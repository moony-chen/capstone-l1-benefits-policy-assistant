# Benefits Policy Assistant

Grounded Q&A over the Meridian Health Group employee benefits handbook.
Answers come only from handbook policies, always cite POL-NNN ids,
surface conflicting or time-dependent policies with both sides and
dates, and explicitly decline questions the handbook doesn't cover.

## Setup

Requires Node.js ≥ 20.6.

```bash
npm install
```

Create `.env` in the repo root (see `.env.example`):

```
PORTKEY_API_KEY=<key>
PORTKEY_BASE_URL=https://portkeygateway.perficient.com/v1
RAG_LLM_MODEL=@dsvertex/anthropic.claude-sonnet-4-6
RAG_EMBED_MODEL=@azure-openai/text-embedding-3-small
```

## Ask a question

```bash
npm run ask -- "How many sick days do I get per year?"
npm run ask -- "When am I eligible for a sabbatical?"
```

Note the `--` after `npm run ask` — without it npm swallows flags.

### Exit codes

| Code | Meaning                                          |
|------|--------------------------------------------------|
| 0    | Answered (with POL-NNN citations)                |
| 3    | Declined — handbook does not cover the question  |
| 1    | Error (bad args, gateway failure, etc.)          |

## Options

| Flag                  | Values            | Default  | Effect                                   |
|-----------------------|-------------------|----------|------------------------------------------|
| `--k N`               | 1–19              | 4        | Number of chunks retrieved per question  |
| `--chunking policy`   | one chunk per POL | default  | One chunk per policy, never split        |
| `--chunking window`   | ~200-token windows|          | Sequential fixed windows (experimental; measured worse — see `eval/comparison-2026-08-15T15-09-34Z.md`) |

## Evaluate against all sample questions

```bash
npm run eval                # policy chunking
npm run eval -- --chunking window
```

Runs all 15 questions from `data/sample_questions.csv` and writes a
timestamped report (JSON + Markdown) to `eval/`. A correct decline
(e.g. Q13) is a correct answer, not a failure.

## Files

| Path                          | What it is                                |
|-------------------------------|-------------------------------------------|
| `assistant.ts`                | The entire tool (single file)             |
| `data/benefits_policies.md`   | Handbook (19 policies, POL-001..POL-019)  |
| `data/sample_questions.csv`   | Evaluation questions Q01–Q15              |
| `data/embeddings-cache-*.json`| Generated embedding caches (per mode)     |
| `eval/`                       | Evaluation reports + comparisons          |

Embeddings are cached locally and reused automatically; the cache is
rebuilt when the handbook file changes (hash-checked). "Today" is
treated as 2025-10-01 (the handbook edition date) for all date
reasoning.
