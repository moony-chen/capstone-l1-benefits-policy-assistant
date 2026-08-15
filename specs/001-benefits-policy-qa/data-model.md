# Data Model: Benefits Policy Q&A Tool

**Feature**: 001-benefits-policy-qa | **Date**: 2026-08-15

All entities live in memory at runtime (single-file tool); persistent
state is files only. No database.

## Policy (parsed chunk = citation unit)

Represents one handbook policy; the atomic retrieval and citation unit
(one chunk per POL-NNN, never split — user requirement, constitution
Principle II).

| Field    | Type   | Notes                                          |
|----------|--------|------------------------------------------------|
| id       | string | Matches `^POL-\d{3}$`; unique across handbook  |
| title    | string | Heading text after the id                      |
| body     | string | Full policy text, verbatim, unmodified         |
| embedText| string | `"{id} {title}\n\n{body}"` — the embedded text |

**Validation**: exactly 16 policies parsed (POL-001..POL-016); parse
fails loudly if any `## POL-NNN` heading is malformed or duplicated, or
if body is empty.

## Handbook

| Field      | Type     | Notes                                        |
|------------|----------|----------------------------------------------|
| sourcePath | string   | `data/benefits_policies.md`                  |
| sha256     | string   | SHA-256 hex of the raw file bytes            |
| editionDate| string   | Constant `2025-10-01` (handbook preamble)    |
| policies   | Policy[] | Ordered by appearance                        |

**Validation**: file must exist and be readable; otherwise the tool exits
with a setup error and answers nothing (spec edge case: fail loudly).

## EmbeddingCache

Persistent JSON at `data/embeddings-cache.json`.

| Field     | Type                  | Notes                                        |
|-----------|-----------------------|----------------------------------------------|
| fileSha256| string                | Handbook hash the vectors were built from    |
| model     | string                | Value of `RAG_EMBED_MODEL` at embed time     |
| createdAt | string                | ISO 8601 timestamp of last (re)build         |
| embeddings| Record<policyId, number[]> | One vector per policy; 1536 dims (verified) |

**State transition (evaluated on every startup)**:

```text
compute sha256(handbook) →
  match(cache.fileSha256 == sha256 AND cache.model == RAG_EMBED_MODEL)
    → HIT:  reuse vectors, zero embedding API calls
    → MISS: re-embed all policies, rewrite cache atomically
            (write temp file, then rename)
```

**Validation**: a HIT whose `embeddings` keys ≠ the 16 parsed policy ids
is treated as a MISS (defensive; handles manual handbook edits).

## Answer

Result of one question.

| Field    | Type     | Notes                                               |
|----------|----------|-----------------------------------------------------|
| status   | enum     | `answered` \| `declined`                            |
| text     | string   | Answer text or explicit not-covered message         |
| citations| string[] | POL-NNN ids relied on; empty only when declined     |
| conflicts| string[] | POL-NNN pairs/notes surfaced (e.g. POL-007/POL-015) |

**Validation (programmatic, constitution Principles I/II/IV)**:
- `answered` ⇒ `citations.length ≥ 1`
- every id in `citations` and every `POL-\d{3}` token appearing in `text`
  must exist in the parsed handbook
- `declined` ⇒ `citations` empty and `text` explicitly states the
  handbook does not cover the question
- violations fail the answer loudly (non-zero exit), never silently pass

## EvaluationRecord / EvaluationReport

Written by `eval` mode to `eval/results-<timestamp>.{json,md}`
(Principle VI / Quality Gates evidence).

| Field           | Type                | Notes                                  |
|-----------------|---------------------|----------------------------------------|
| questionId      | string              | `Q01`..`Q15` from CSV                  |
| question        | string              | Verbatim from CSV                      |
| answer          | Answer              | As returned                            |
| retrievedPolicies | string[]          | Top-k policy ids actually given to LLM |

| Field        | Type               | Notes                                        |
|--------------|--------------------|----------------------------------------------|
| runAt        | string             | ISO 8601                                     |
| llmModel     | string             | `RAG_LLM_MODEL` value used                   |
| embedModel   | string             | `RAG_EMBED_MODEL` value used                 |
| k            | number             | Retrieval depth                              |
| handbookSha  | string             | Hash of handbook for this run                |
| records      | EvaluationRecord[] | Exactly 15, one per Q01–Q15                  |

**Validation**: a report is complete iff it contains exactly 15 records
with question ids Q01–Q15, each with an `Answer` that passed Answer
validation.

## Relationships

```text
Handbook 1 ── * Policy          (parsed from, ordered)
Policy   1 ── 1 embedding entry (in EmbeddingCache, keyed by policy id)
Answer   * ── * Policy          (via citations ⊆ handbook policy ids)
EvalRecord 1 ── 1 Answer
EvalReport 1 ── * EvalRecord    (exactly 15)
```
