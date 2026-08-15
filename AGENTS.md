# Benefits Policy Assistant — Agent Context

Grounded RAG Q&A over the Meridian Health Group benefits handbook. Governance
source of truth: `.specify/memory/constitution.md`.

## The project in one paragraph

Single-file TypeScript CLI (`assistant.ts`, run via tsx, zero runtime deps).
All model calls go through the Perficient Portkey gateway (creds in `.env`,
never committed, never printed). Pipeline: parse handbook → one chunk per
POL-NNN policy → embed + cache → cosine top-k → grounded LLM answer with
`CITED:`/`DECLINED:` first-line contract, validated in code.

## Commands

- `npm run ask -- "question"` — answer one question (add `--k N` for retrieval depth)
- `npm run eval` — run all 15 sample questions, writes timestamped report to `eval/`
- Exit codes: 0 = answered, 3 = declined (correct behavior, not an error), 1 = error

## Non-negotiable rules (violations are bugs)

1. Answers come ONLY from handbook text. Never add outside knowledge.
2. Every non-decline answer cites POL-NNN ids that actually support its claims.
3. Conflicts and time-dependent policies are surfaced with BOTH sides + dates,
   never silently resolved. Known traps: POL-016 states 5 AND 7 years for
   sabbatical; POL-007 vs POL-015 change at 2026-01-01.
4. If the handbook doesn't cover the question's central ask → DECLINED, exit 3.
   A correct decline is a correct answer.
5. "Today" is 2025-10-01 (handbook edition date) for all date reasoning.

## Hard constraints when editing code

- `eval/results-*` and `eval/comparison-*` are IMMUTABLE evidence — never edit,
  delete, or overwrite; new runs write new timestamped files.
- No runtime dependencies. No build step. Everything stays in `assistant.ts`
  (single-file by constitution Principle V).
- Handbook: 19 policies, POL-001..POL-019, at `data/benefits_policies.md`.
  Questions: Q01–Q15 at `data/sample_questions.csv`.
- `PORTKEY_API_KEY` must never appear in stdout, stderr, reports, or git.

## Where things live

- `specs/` — speckit SDD trail (constitution, spec, plan, tasks per feature)
- `eval/` — timestamped eval reports = measured-improvement evidence
- `data/` — inputs (handbook, questions) + generated embedding cache
- After ANY behavioral change: re-run `npm run eval`, keep both reports,
  diff them, report regressions honestly (constitution Quality Gate).