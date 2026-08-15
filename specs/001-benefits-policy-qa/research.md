# Research: Benefits Policy Q&A Tool

**Feature**: 001-benefits-policy-qa | **Date**: 2026-08-15

All NEEDS CLARIFICATION items were resolved by user input (stack, gateway,
chunking, cache, data location) plus live verification. No open
clarifications remain.

## D1: Runtime — Node.js 20 + TypeScript via `tsx`

- **Decision**: Node.js ≥ 20.6 (installed v20.19.5) running a single
  TypeScript file through `tsx` (pinned dev dependency).
- **Rationale**: native `fetch` and `--env-file` support are built in, so
  zero runtime dependencies; `tsx` needs no build step, keeping
  end-to-end reviewer runnability (constitution Principle V). Verified:
  `node --version` → v20.19.5 on this machine.
- **Alternatives considered**:
  - Python starter (`starter/rag_starter.py`): rejected — user specified
    Node.js + TypeScript.
  - `ts-node`: heavier, slower startup, config file drift.
  - Compile-then-run (`tsc` + `node`): adds a build artifact and step a
    reviewer must know about.
  - Node 22 native type stripping: not available on installed Node 20.

## D2: Model access — Portkey gateway, OpenAI-compatible REST, no SDK

- **Decision**: call `{PORTKEY_BASE_URL}/embeddings` and
  `{PORTKEY_BASE_URL}/chat/completions` with `Authorization: Bearer
  {PORTKEY_API_KEY}` using native `fetch`. Model ids come from `.env`:
  `RAG_LLM_MODEL=@dsvertex/anthropic.claude-sonnet-4-6`,
  `RAG_EMBED_MODEL=@azure-openai/text-embedding-3-small`.
- **Rationale**: **live-verified 2026-08-15** (measured evidence,
  constitution Principle VI):
  - `POST /embeddings` with `@azure-openai/text-embedding-3-small`
    returned a 1536-dim vector (HTTP 200, `object:"list"`).
  - `POST /chat/completions` with `@dsvertex/anthropic.claude-sonnet-4-6`
    returned `choices[0].message.content == "ok"`
    (`provider:"vertex-ai"`, `model:"claude-sonnet-4-6"`).
- **Alternatives considered**: `portkey` SDK or `openai` SDK (extra
  dependency for two endpoints — violates dependency-light);
  LangChain/LlamaIndex orchestration (far too heavy for 16 policies).

## D3: Chunking — one chunk per POL-NNN, never split mid-policy

- **Decision**: split the handbook on `^## (POL-\d{3} .*)$` headings; each
  chunk is the full policy (id, title, body). The preamble before POL-001
  is not a retrieval chunk (its edition date is captured as the constant
  reference date instead).
- **Rationale**: user-specified; also constitution Principle II traceability
  — a citation names a whole policy, so retrieval units and citation units
  must match. Measured fit: 16 chunks, each well under 150 words, far
  inside model context limits, so no splitting pressure exists.
- **Alternatives considered**: fixed-size token windows (would split
  policies and break citation traceability); sentence-level chunks (lose
  policy-level context, e.g. POL-016's two eligibility paragraphs must
  travel together to surface the conflict).

## D4: Embedding cache — local JSON keyed by handbook hash + model id

- **Decision**: `data/embeddings-cache.json` stores
  `{ fileSha256, model, embeddings: { "POL-NNN": [...] } }`. On startup:
  compute SHA-256 of `data/benefits_policies.md`; if it matches the cached
  `fileSha256` AND the embed model id matches, reuse vectors (zero API
  calls); otherwise re-embed all policies and rewrite the cache
  atomically.
- **Rationale**: user-specified hash evaluation; full re-embed on mismatch
  is 16 calls — cheap and simpler than incremental diffing (Principle V).
- **Alternatives considered**: per-policy incremental updates (complexity
  without measurable benefit at 16 chunks); no cache (re-embeds every run,
  slowing the eval loop and burning gateway quota).

## D5: Retrieval — cosine similarity, top-k = 4

- **Decision**: embed `"{POL-NNN} {title}\n\n{body}"` per policy; rank by
  cosine similarity to the embedded question; take top k=4 (configurable
  via `--k`).
- **Rationale**: k=4 is wide enough to pull both POL-007 and POL-015 for
  401(k) questions (similar wording) and both paragraphs of POL-016 (one
  chunk) so conflicts surface (Principle III), while staying small enough
  to keep prompts tight.
- **Alternatives considered**: k=2 (risks dropping POL-015 when POL-007
  scores higher); hybrid BM25+dense (deferred — a future improvement that
  must go through the measured before/after Quality Gate).

## D6: Answering — single structured chat call + programmatic checks

- **Decision**: one chat completion per question. System prompt encodes
  constitution rules (grounding-only; cite POL-NNN; surface conflicts with
  dates/effective windows; decline when uncovered; today = 2025-10-01).
  The model must emit a machine-parseable first line (`CITED:` /
  `DECLINED:`) followed by the answer. Code then validates: every
  `POL-\d{3}` token in the answer exists in the handbook; non-declines
  carry ≥1 citation; validation failure fails the answer loudly.
- **Rationale**: keeps a single LLM call (dependency-light) while making
  Principles II and IV machine-checkable for the eval harness (Principle
  VI).
- **Alternatives considered**: free-form output (not reliably parseable);
  multi-step agent with tool calls (heavier, unjustified at this scale).

## D7: Reference date — 2025-10-01

- **Decision**: hardcode the handbook edition date (1 October 2025) as a
  constant, inject it into every prompt ("treat today as 2025-10-01"),
  and use it in eval expectations.
- **Rationale**: constitution Quality Gates mandate it; the handbook
  preamble states the same, so constant and source agree.

## D8: Evaluation harness — built-in `eval` mode

- **Decision**: `eval` mode reads `data/sample_questions.csv`, runs all
  15 questions, and writes `eval/results-<timestamp>.{json,md}` recording
  per question: question id, answer text, citations, status
  (answered/declined), plus run metadata (model ids, k, handbook hash).
  Improvement runs are just two saved eval reports compared side by side,
  which satisfies the before/after-with-regressions gate.
- **Rationale**: Quality Gates require full Q01–Q15 coverage and measured
  improvements; making eval a mode of the same single file keeps the
  deliverable self-contained.
- **Alternatives considered**: separate eval script (a second source
  file — Principle V tension); manual copy-paste evaluation (not
  reproducible, fails Principle VI).
