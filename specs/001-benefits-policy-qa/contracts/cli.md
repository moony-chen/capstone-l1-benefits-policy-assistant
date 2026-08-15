# CLI Contract: Benefits Policy Q&A Tool

**Feature**: 001-benefits-policy-qa | **Date**: 2026-08-15

Single executable: `assistant.ts`, run via npm scripts (or `tsx
assistant.ts` directly). Text-in/text-out for a People Operations user.

## Commands

### `ask` — answer one question

```text
npm run ask -- "How many weeks of paid parental leave do I get?"
tsx assistant.ts ask "question text" [--k N]
```

- `question text`: required, natural-language employee benefits question.
- `--k N`: optional retrieval depth (default 4).

**Output (stdout)**:

```text
<answer text>

Citations:
- POL-010 Parental Leave
```

**Decline output (when handbook does not cover the question)**:

```text
The handbook does not cover this question. <brief statement of what was
searched; no invented content.>

Citations: none — not covered by the handbook.
```

**Exit codes**:

| Code | Meaning                                            |
|------|----------------------------------------------------|
| 0    | Answered (with ≥1 valid POL-NNN citation)          |
| 3    | Declined — handbook does not cover the question    |
| 1    | Error (missing handbook, gateway failure, invalid  |
|      | citations produced, bad arguments)                 |

**Diagnostics (stderr)**: cache hit/miss line (`embeddings: cache hit
[sha256=<hash>, model=<id>]` or `cache miss → re-embedded 16 policies`),
retrieved policy ids and similarity scores. Stdout carries only the
user-facing answer.

### `eval` — run all sample questions

```text
npm run eval
tsx assistant.ts eval [--k N] [--out eval/]
```

**Behavior**: reads `data/sample_questions.csv`, runs `ask` logic for each
of Q01–Q15 (single run, shared cache), writes
`eval/results-<timestamp>.json` and `eval/results-<timestamp>.md`, prints
a summary table (question id, status, citations) to stdout.

**Exit codes**: 0 if a complete 15-record report was produced (regardless
of individual answers — declines are correct outcomes); 1 on error
(missing CSV, incomplete report, any answer failing validation).

**Report contents**: per [data-model.md](../data-model.md)
EvaluationRecord/EvaluationReport; reports are the before/after evidence
for the constitution's measured-improvement gate.

## Guarantees (constitution Principles I–IV)

1. Every non-decline answer contains at least one POL-NNN citation, and
   every cited id exists in `data/benefits_policies.md` (enforced in
   code, not just prompted).
2. Conflicting or time-dependent retrieved policies are presented with
   both sides and their dates/effective windows (e.g. POL-007 vs POL-015
   across 2026-01-01; POL-016 five vs seven years).
3. Uncovered questions produce an explicit decline and exit code 3 —
   never a guessed answer.
4. All date-dependent reasoning treats 2025-10-01 as "today".

## Environment contract

`.env` (already present), loaded by the tool:

| Variable          | Use                                    |
|-------------------|----------------------------------------|
| PORTKEY_API_KEY   | Bearer token for the gateway           |
| PORTKEY_BASE_URL  | Gateway base, OpenAI-compatible `/v1`  |
| RAG_LLM_MODEL     | Chat model id for answering            |
| RAG_EMBED_MODEL   | Embedding model id for retrieval       |

See [portkey-api.md](./portkey-api.md) for endpoint shapes.
