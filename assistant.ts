import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EDITION_DATE = "2025-10-01";
const EXPECTED_POLICY_COUNT = 19;
const DEFAULT_K = 4;
const WINDOW_WORDS = 150; // ≈200 tokens (1 token ≈ 0.75 words), deterministic split
const HANDBOOK_PATH = "data/benefits_policies.md";
const QUESTIONS_PATH = "data/sample_questions.csv";
const LEGACY_CACHE_PATH = "data/embeddings-cache.json";
const EVAL_DIR = "eval";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_DECLINED = 3;

type ChunkingMode = "policy" | "window";
type Policy = { id: string; title: string; body: string };
type Chunk = { key: string; policyIds: string[]; header: string; body: string; embedText: string };
type Handbook = { sha256: string; policies: Policy[]; byId: Map<string, Policy> };
type Env = {
  PORTKEY_API_KEY: string;
  PORTKEY_BASE_URL: string;
  RAG_LLM_MODEL: string;
  RAG_EMBED_MODEL: string;
};
type Answer = {
  status: "answered" | "declined";
  text: string;
  citations: string[];
  retrievedPolicies: string[];
};

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(EXIT_ERROR);
}

function loadEnv(): Env {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const envPath = [resolve(process.cwd(), ".env"), join(scriptDir, ".env")].find(existsSync);
  const raw: Record<string, string> = {};
  if (envPath) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !line.trimStart().startsWith("#")) {
        raw[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
  const merged = { ...raw, ...process.env } as Partial<Env>;
  const required = ["PORTKEY_API_KEY", "PORTKEY_BASE_URL", "RAG_LLM_MODEL", "RAG_EMBED_MODEL"] as const;
  for (const key of required) {
    if (!merged[key]) fail(`missing required environment variable ${key} (define it in .env)`);
  }
  return merged as Env;
}

function parseHandbook(path: string): Handbook {
  if (!existsSync(path)) {
    fail(`handbook not found at ${path} — the assistant cannot answer without it`);
  }
  const raw = readFileSync(path);
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const text = raw.toString("utf8");
  const heading = /^## (POL-\d{3}) (.+)$/gm;
  const found: { id: string; title: string; start: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = heading.exec(text)) !== null) {
    found.push({ id: match[1], title: match[2].trim(), start: match.index });
  }
  if (found.length === 0) fail(`no POL-NNN headings found in ${path}`);
  const policies: Policy[] = found.map((f, i) => {
    const bodyStart = f.start + f.id.length + f.title.length + 4;
    const bodyEnd = i + 1 < found.length ? found[i + 1].start : text.length;
    const body = text.slice(bodyStart, bodyEnd).trim();
    return { id: f.id, title: f.title, body };
  });
  const ids = policies.map((p) => p.id);
  if (new Set(ids).size !== ids.length) fail(`duplicate POL-NNN ids in ${path}`);
  if (policies.length !== EXPECTED_POLICY_COUNT) {
    fail(`expected ${EXPECTED_POLICY_COUNT} policies, parsed ${policies.length} in ${path}`);
  }
  const empty = policies.find((p) => !p.body);
  if (empty) fail(`policy ${empty.id} has an empty body in ${path}`);
  return { sha256, policies, byId: new Map(policies.map((p) => [p.id, p])) };
}

function policyChunks(handbook: Handbook): Chunk[] {
  return handbook.policies.map((p) => {
    const header = `${p.id} ${p.title}`;
    return { key: p.id, policyIds: [p.id], header, body: p.body, embedText: `${header}\n\n${p.body}` };
  });
}

function windowChunks(handbook: Handbook): Chunk[] {
  const flat: { word: string; policyId: string }[] = [];
  for (const policy of handbook.policies) {
    for (const word of `${policy.id} ${policy.title}`.split(/\s+/)) flat.push({ word, policyId: policy.id });
    flat.push({ word: "", policyId: policy.id });
    for (const word of policy.body.split(/\s+/)) flat.push({ word, policyId: policy.id });
  }
  const chunks: Chunk[] = [];
  let current: { word: string; policyId: string }[] = [];
  const flush = () => {
    if (current.length === 0) return;
    const policyIds = [...new Set(current.map((w) => w.policyId))];
    const body = current.map((w) => w.word).join(" ").replace(/\s+/g, " ").trim();
    if (!body) {
      current = [];
      return;
    }
    const header = `Excerpt from ${policyIds.join(", ")}`;
    const key = `W${String(chunks.length + 1).padStart(2, "0")}`;
    chunks.push({ key, policyIds, header, body, embedText: `${header}\n\n${body}` });
    current = [];
  };
  for (const token of flat) {
    current.push(token);
    if (current.length >= WINDOW_WORDS) flush();
  }
  flush();
  if (chunks.length === 0) fail("window chunker produced no chunks");
  for (const chunk of chunks) {
    if (chunk.policyIds.some((id) => !handbook.byId.has(id))) {
      fail(`window chunk ${chunk.key} references a policy outside the handbook`);
    }
  }
  return chunks;
}

function buildChunks(mode: ChunkingMode, handbook: Handbook): Chunk[] {
  return mode === "policy" ? policyChunks(handbook) : windowChunks(handbook);
}

function cachePathFor(mode: ChunkingMode): string {
  return `data/embeddings-cache-${mode}.json`;
}

async function postJson<T>(label: string, request: () => Promise<Response>, parse: (body: unknown) => T): Promise<T> {
  const attempt = async (): Promise<Response> => {
    let response: Response;
    try {
      response = await request();
    } catch (transport) {
      throw Object.assign(new Error(`transport error: ${(transport as Error).message}`), { retryable: true });
    }
    if (response.status >= 500 || response.status === 429) {
      throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: true, status: response.status });
    }
    if (!response.ok) {
      throw Object.assign(new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`), { retryable: false });
    }
    return response;
  };
  let response: Response;
  try {
    response = await attempt();
  } catch (first) {
    const retryable = (first as { retryable?: boolean }).retryable === true;
    if (!retryable) fail(`${label} failed: ${(first as Error).message}`);
    const delay = (first as { status?: number }).status === 429 ? 4000 : 1500;
    console.error(`${label} transient failure (${(first as Error).message}) — retrying once in ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
    try {
      response = await attempt();
    } catch (second) {
      fail(`${label} failed after retry: ${(second as Error).message}`);
    }
  }
  try {
    return parse(await response.json());
  } catch (e) {
    fail(`${label} returned an unexpected response shape: ${(e as Error).message}`);
  }
}

async function gatewayFetch(env: Env, path: string, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch(`${env.PORTKEY_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.PORTKEY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function embed(env: Env, inputs: string[]): Promise<number[][]> {
  const label = `embeddings endpoint (${env.RAG_EMBED_MODEL})`;
  const data = await postJson(
    label,
    () => gatewayFetch(env, "/embeddings", { model: env.RAG_EMBED_MODEL, input: inputs }, 30_000),
    (body: unknown) => (body as { data?: { embedding?: number[] }[] }).data
  );
  if (!Array.isArray(data) || data.length !== inputs.length || data.some((d) => !Array.isArray(d.embedding))) {
    fail(`embeddings response malformed: expected ${inputs.length} vectors`);
  }
  return data.map((d) => d.embedding as number[]);
}

async function chat(env: Env, system: string, user: string): Promise<string> {
  const label = `chat endpoint (${env.RAG_LLM_MODEL})`;
  const content = await postJson(
    label,
    () =>
      gatewayFetch(
        env,
        "/chat/completions",
        {
          model: env.RAG_LLM_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        90_000
      ),
    (body: unknown) => (body as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content
  );
  if (typeof content !== "string" || content.trim().length === 0) {
    fail("chat response malformed: choices[0].message.content missing");
  }
  return content.trim();
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function retrieve(env: Env, question: string, chunks: Chunk[], cache: Map<string, number[]>, k: number): Promise<{ chunk: Chunk; score: number }[]> {
  const [qv] = await embed(env, [question]);
  const ranked = chunks
    .map((chunk) => ({ chunk, score: cosine(qv, cache.get(chunk.key) as number[]) }))
    .sort((x, y) => y.score - x.score);
  const top = ranked.slice(0, k);
  console.error(`retrieved: ${top.map((t) => `${t.chunk.key}(${t.score.toFixed(3)})`).join(" ")}`);
  return top;
}

function systemPrompt(): string {
  return [
    "You answer employee benefits questions for the People Operations team of Meridian Health Group, using ONLY the policy excerpts provided below from the employee benefits handbook.",
    `The handbook edition is current as of ${EDITION_DATE}. Treat ${EDITION_DATE} as today's date for all reasoning about what is in effect, what changes later, or what applies on a given date. Never use the real-world date.`,
    "Rules, in order of importance:",
    "1. Grounding: answer ONLY from the provided policy texts. Never use outside knowledge, general benefits-industry assumptions, or guesses to fill gaps. If the information is not in the provided excerpts, it does not exist for answering purposes.",
    "2. Citations: support every factual claim with the POL-NNN policy id it comes from. Use only policy ids that appear in the provided excerpts; never invent an id, number, or provision.",
    "3. Conflicts: if the provided policies disagree with each other (for example, two different eligibility thresholds), report BOTH statements with their policy ids. Never silently choose one side, average them, or hide the discrepancy — flag it as a conflict the employee should clarify with People Operations.",
    "4. Time-dependent policies: when a policy changes on a future effective date (or a previous one is superseded), present EACH version with its dates/effective window relative to today (${EDITION_DATE}). State which applies today and what changes later.",
    "5. Partial coverage: only for questions with MULTIPLE distinct parts where at least one part is directly answerable — answer that part with citations and explicitly state which parts the handbook does not cover.",
    "6. Declining: if the question's central ask — the specific thing the employee needs to know — is not addressed by the provided policies, decline the whole question, even when related policies provide background context. Do NOT answer by summarizing related-but-non-responsive policies: if those policies do not actually answer what was asked, that is a decline, not a partial answer. Do not guess, extrapolate, or answer from general knowledge. A correct decline is a correct answer.",
    "",
    "Output format (strict):",
    "- If you can answer any covered aspect: the FIRST line must be exactly `CITED:` then the answer on the following lines, with POL-NNN citations inline.",
    "- If nothing in the provided policies covers the question: the FIRST line must be exactly `DECLINED:` then a brief statement that INCLUDES the phrase \"the handbook does not cover this question\". You may briefly name the policies you checked and state that they are silent on what was asked, but you MUST NOT present any policy as supporting an answer, and MUST NOT invent policy details.",
  ].join("\n");
}

function userPrompt(question: string, retrieved: { chunk: Chunk }[]): string {
  const blocks = retrieved.map((r) => `${r.chunk.header}\n\n${r.chunk.body}`).join("\n\n---\n\n");
  return `Employee question:\n${question}\n\nPolicy excerpts from the handbook (edition ${EDITION_DATE}):\n\n${blocks}`;
}

function parseAnswer(content: string, handbook: Handbook, retrievedIds: string[]): Answer {
  const lines = content.split("\n");
  const first = lines[0];
  const marker = first.startsWith("CITED:") ? "CITED:" : first.startsWith("DECLINED:") ? "DECLINED:" : null;
  if (!marker) {
    fail(`unexpected answer format: first line must start with CITED: or DECLINED: (got "${first.slice(0, 60)}")`);
  }
  const rest = [first.slice(marker.length), ...lines.slice(1)].join("\n").trim();
  if (marker === "DECLINED:") {
    if (!/does not cover|not covered/i.test(rest)) {
      fail(`declined answer must explicitly state the handbook does not cover the question — got: "${rest.slice(0, 200)}"`);
    }
    return { status: "declined", text: rest, citations: [], retrievedPolicies: retrievedIds };
  }
  const tokens = new Set(rest.match(/POL-\d{3}/g) ?? []);
  if (tokens.size === 0) fail("answered question must cite at least one POL-NNN policy");
  for (const token of tokens) {
    if (!handbook.byId.has(token)) fail(`answer cites unknown policy ${token} — not in the handbook`);
  }
  return { status: "answered", text: rest, citations: [...tokens], retrievedPolicies: retrievedIds };
}

async function answerQuestion(env: Env, question: string, handbook: Handbook, chunks: Chunk[], cache: Map<string, number[]>, k: number): Promise<Answer> {
  const top = await retrieve(env, question, chunks, cache, k);
  const content = await chat(env, systemPrompt(), userPrompt(question, top));
  const retrievedPolicies = [...new Set(top.flatMap((t) => t.chunk.policyIds))];
  return parseAnswer(content, handbook, retrievedPolicies);
}

function printAnswer(answer: Answer, handbook: Handbook): void {
  if (answer.status === "declined") {
    console.log(`${answer.text}\n\nCitations: none — not covered by the handbook.`);
    return;
  }
  const citationLines = answer.citations.map((id) => `- ${id} ${handbook.byId.get(id)?.title ?? ""}`.trimEnd());
  console.log(`${answer.text}\n\nCitations:\n${citationLines.join("\n")}`);
}

const USAGE = 'usage: npm run ask -- "your benefits question" [--k N] [--chunking policy|window] | npm run eval -- [--k N] [--chunking policy|window]';

function parseMode(value: string | undefined): ChunkingMode {
  if (value === undefined) return "policy";
  if (value === "policy" || value === "window") return value;
  fail(`--chunking expects "policy" or "window" (got "${value}") — ${USAGE}`);
}

function parseAskArgs(argv: string[]): { question: string; k: number; mode: ChunkingMode } {
  const positional: string[] = [];
  let k = DEFAULT_K;
  let mode: ChunkingMode = "policy";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--k") {
      const next = argv[i + 1];
      const parsed = Number(next);
      if (!next || !Number.isInteger(parsed) || parsed < 1 || parsed > 19) fail("--k expects an integer between 1 and 19");
      k = parsed;
      i++;
    } else if (argv[i] === "--chunking") {
      mode = parseMode(argv[i + 1]);
      i++;
    } else {
      positional.push(argv[i]);
    }
  }
  const question = positional.join(" ").trim();
  if (!question) fail(USAGE);
  return { question, k, mode };
}

function parseEvalArgs(argv: string[]): { k: number; mode: ChunkingMode } {
  let k = DEFAULT_K;
  let mode: ChunkingMode = "policy";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--k") {
      const parsed = Number(argv[i + 1]);
      if (!argv[i + 1] || !Number.isInteger(parsed) || parsed < 1 || parsed > 19) fail("--k expects an integer between 1 and 19");
      k = parsed;
      i++;
    } else if (argv[i] === "--chunking") {
      mode = parseMode(argv[i + 1]);
      i++;
    } else {
      fail(`unexpected argument "${argv[i]}" — ${USAGE}`);
    }
  }
  return { k, mode };
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = false;
      } else current += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      fields.push(current);
      current = "";
    } else current += ch;
  }
  fields.push(current);
  return fields.map((f) => f.trim());
}

function loadQuestions(path: string): { questionId: string; question: string }[] {
  if (!existsSync(path)) fail(`sample questions not found at ${path}`);
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  if (header[0] !== "question_id" || header[1] !== "employee_question") {
    fail("sample questions CSV must have header question_id,employee_question");
  }
  const rows = lines.slice(1).map((l) => {
    const [questionId, question] = parseCsvLine(l);
    return { questionId, question };
  });
  const ids = rows.map((r) => r.questionId);
  if (ids.length !== 15 || new Set(ids).size !== 15) {
    fail(`expected exactly 15 uniquely-identified questions, found ${ids.length}`);
  }
  if (!ids.every((id) => /^Q\d{2}$/.test(id))) fail("question ids must match Qnn format");
  return rows;
}

type EvalRecord = { questionId: string; question: string; answer: Answer };

async function runEval(env: Env, handbook: Handbook, chunks: Chunk[], cache: Map<string, number[]>, k: number, mode: ChunkingMode): Promise<number> {
  const questions = loadQuestions(QUESTIONS_PATH);
  console.error(`eval: running ${questions.length} questions (k=${k}, chunking=${mode})`);
  const records: EvalRecord[] = [];
  for (const [index, q] of questions.entries()) {
    const answer = await answerQuestion(env, q.question, handbook, chunks, cache, k);
    records.push({ questionId: q.questionId, question: q.question, answer });
    console.error(`eval: ${q.questionId} → ${answer.status} [${answer.citations.join(", ") || "none"}] (${index + 1}/${questions.length})`);
    if (index < questions.length - 1) await new Promise((r) => setTimeout(r, 500));
  }
  if (!existsSync(EVAL_DIR)) mkdirSync(EVAL_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const report = {
    runAt: new Date().toISOString(),
    llmModel: env.RAG_LLM_MODEL,
    embedModel: env.RAG_EMBED_MODEL,
    chunkingMode: mode,
    k,
    handbookSha256: handbook.sha256,
    editionDate: EDITION_DATE,
    records,
  };
  writeFileSync(join(EVAL_DIR, `results-${stamp}.json`), JSON.stringify(report, null, 2));
  writeFileSync(join(EVAL_DIR, `results-${stamp}.md`), evalMarkdown(report));
  console.log(`| question | status | citations |`);
  console.log(`|----------|--------|-----------|`);
  for (const r of records) {
    console.log(`| ${r.questionId} | ${r.answer.status} | ${r.answer.citations.join(", ") || "none"} |`);
  }
  console.log(`\nreport: ${join(EVAL_DIR, `results-${stamp}.md`)}`);
  return EXIT_OK;
}

function evalMarkdown(report: { runAt: string; llmModel: string; embedModel: string; chunkingMode: string; k: number; handbookSha256: string; records: EvalRecord[] }): string {
  const lines = [
    "# Evaluation Report — Benefits Policy Q&A",
    "",
    `- **Run at**: ${report.runAt}`,
    `- **Reference date ("today")**: ${EDITION_DATE}`,
    `- **LLM model**: ${report.llmModel}`,
    `- **Embedding model**: ${report.embedModel}`,
    `- **Chunking mode**: ${report.chunkingMode}`,
    `- **Retrieval k**: ${report.k}`,
    `- **Handbook sha256**: ${report.handbookSha256}`,
    "",
    "## Summary",
    "",
    "| question | status | citations |",
    "|----------|--------|-----------|",
    ...report.records.map((r) => `| ${r.questionId} | ${r.answer.status} | ${r.answer.citations.join(", ") || "none"} |`),
    "",
    "## Records",
  ];
  for (const r of report.records) {
    lines.push(
      "",
      `### ${r.questionId}`,
      "",
      `**Question**: ${r.question}`,
      "",
      `**Status**: ${r.answer.status} | **Retrieved**: ${r.answer.retrievedPolicies.join(", ")}`,
      "",
      r.answer.text,
      "",
      `**Citations**: ${r.answer.citations.join(", ") || "none"}`
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "ask" && command !== "eval") {
    fail(USAGE);
  }
  const mode = command === "ask" ? parseAskArgs(rest).mode : parseEvalArgs(rest).mode;
  const env = loadEnv();
  const handbook = parseHandbook(HANDBOOK_PATH);
  const chunks = buildChunks(mode, handbook);
  const cachePath = cachePathFor(mode);

  if (mode === "policy" && !existsSync(cachePath) && existsSync(LEGACY_CACHE_PATH)) {
    try {
      const legacy = JSON.parse(readFileSync(LEGACY_CACHE_PATH, "utf8")) as { fileSha256?: string; model?: string };
      if (legacy.fileSha256 === handbook.sha256 && legacy.model === env.RAG_EMBED_MODEL) {
        renameSync(LEGACY_CACHE_PATH, cachePath);
        console.error("embeddings: migrated legacy cache → data/embeddings-cache-policy.json");
      }
    } catch {
      console.error("embeddings: legacy cache unreadable — ignoring it");
    }
  }

  const loadCache = (): Map<string, number[]> | null => {
    const chunkKeys = new Set(chunks.map((c) => c.key));
    if (!existsSync(cachePath)) return null;
    try {
      const cached = JSON.parse(readFileSync(cachePath, "utf8")) as {
        fileSha256: string;
        model: string;
        mode?: string;
        windowWords?: number;
        embeddings: Record<string, number[]>;
      };
      const keys = Object.keys(cached.embeddings ?? {});
      const valid =
        cached.fileSha256 === handbook.sha256 &&
        cached.model === env.RAG_EMBED_MODEL &&
        (cached.mode ?? "policy") === mode &&
        (mode === "window" ? cached.windowWords === WINDOW_WORDS : true) &&
        keys.length === chunkKeys.size &&
        keys.every((key) => chunkKeys.has(key));
      if (!valid) return null;
      console.error(`embeddings: cache hit [mode=${mode}, sha256=${handbook.sha256.slice(0, 12)}, model=${env.RAG_EMBED_MODEL}]`);
      return new Map(Object.entries(cached.embeddings));
    } catch {
      console.error("embeddings: cache unreadable — rebuilding");
      return null;
    }
  };
  const buildVectors = async (): Promise<Map<string, number[]>> => {
    console.error(`embeddings: cache miss → embedding ${chunks.length} ${mode} chunks`);
    const vectors = await embed(env, chunks.map((c) => c.embedText));
    const entries = chunks.map((c, i) => [c.key, vectors[i]] as [string, number[]]);
    const cache = {
      fileSha256: handbook.sha256,
      model: env.RAG_EMBED_MODEL,
      mode,
      ...(mode === "window" ? { windowWords: WINDOW_WORDS } : {}),
      createdAt: new Date().toISOString(),
      embeddings: Object.fromEntries(entries),
    };
    const tmp = `${cachePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(cache));
    renameSync(tmp, cachePath);
    return new Map(entries);
  };
  const cache = loadCache() ?? (await buildVectors());

  if (command === "ask") {
    const { question, k } = parseAskArgs(rest);
    const answer = await answerQuestion(env, question, handbook, chunks, cache, k);
    printAnswer(answer, handbook);
    return answer.status === "answered" ? EXIT_OK : EXIT_DECLINED;
  }
  const { k } = parseEvalArgs(rest);
  return runEval(env, handbook, chunks, cache, k, mode);
}

process.exit(await main());
