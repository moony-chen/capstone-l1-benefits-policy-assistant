# Data Model: Chunking Mode Switch

**Feature**: 002-chunking-mode-switch | **Date**: 2026-08-15

Extends feature 001's model ([001 data-model](../001-benefits-policy-qa/data-model.md)).
Policy, Handbook, and Answer entities are unchanged. Changes: new Chunk
and ChunkingMode entities, per-mode EmbeddingCache, extended
EvaluationReport metadata.

## ChunkingMode

| Value    | Meaning                                              |
|----------|------------------------------------------------------|
| `policy` | One chunk per POL-NNN (feature 001 behavior; default) |
| `window` | Sequential ~200-token windows across policy text     |

**Validation**: CLI accepts exactly `policy` or `window` after
`--chunking`; anything else exits 1 with usage. Absent flag ⇒ `policy`.

## Chunk (new — the retrieval unit in both modes)

| Field      | Type     | Notes                                                |
|------------|----------|------------------------------------------------------|
| key        | string   | Cache/embedding key: `POL-NNN` or `W01`…`WNN`        |
| policyIds  | string[] | POL-NNN ids this chunk's text overlaps (≥1)          |
| header     | string   | Prompt-facing label incl. citable POL ids           |
| body       | string   | Verbatim handbook text                               |
| embedText  | string   | `"{header}\n\n{body}"` — what gets embedded         |

**Construction**:
- Policy mode: 19 chunks; key=id, policyIds=[id], header=`{id} {title}`,
  body=full policy body (identical to 001).
- Window mode: concatenate every policy's `{id} {title}\n\n{body}` in
  handbook order (preamble excluded); split into sequential windows of
  ≤150 whitespace-delimited words (≈200 tokens, deterministic); key=
  `W01`…, policyIds = every POL-NNN appearing in the window, header =
  `Excerpt from {POL-NNN, POL-NNN}`.

**Validation**: every chunk's policyIds ⊆ parsed handbook ids; window
word counts ≤150 (final window may be shorter); chunk count > 0.

## EmbeddingCache (extended — one per mode)

Persistent JSON, per mode: `data/embeddings-cache-policy.json`,
`data/embeddings-cache-window.json`.

| Field      | Type                  | Notes                                        |
|------------|-----------------------|----------------------------------------------|
| fileSha256 | string                | Handbook hash the vectors were built from    |
| model     | string                | `RAG_EMBED_MODEL` at embed time              |
| mode      | string                | `policy` \| `window` (mirrors filename)      |
| windowWords| number                | Window mode only: 150 (bump invalidates)     |
| createdAt | string                | ISO 8601                                     |
| embeddings| Record<chunkKey, number[]> | One vector per chunk                     |

**State transition (per mode, every startup)**:

```text
read data/embeddings-cache-{mode}.json →
  valid(fileSha256 ∧ model ∧ mode ∧ [window: windowWords])
    → HIT:  reuse vectors, zero embedding calls
    → MISS: embed all chunks of this mode in one batch, atomic rewrite
legacy migration (policy mode only, once):
  if embeddings-cache.json exists and is valid for policy mode
    → rename to embeddings-cache-policy.json, then treat as HIT
```

**Validation**: HIT requires embeddings keys == this mode's chunk keys
(defensive against handbook edits). Cross-mode reuse is structurally
impossible: separate files, separate key namespaces (`POL-*` vs `W*`).

## Answer / EvaluationRecord (extended)

Unchanged except `retrievedPolicies`: now the de-duplicated union of
`policyIds` across top-k chunks (policy mode: the k policy ids, as
before). Citations still extracted from answer text and validated
against parsed handbook ids — mode-independent.

## EvaluationReport (extended)

| Field       | Type   | Notes                                             |
|-------------|--------|---------------------------------------------------|
| chunkingMode| string | `policy` \| `window` — new required field         |

All prior fields unchanged. Comparison artifacts
(`eval/comparison-*.md`) consume two reports' records; reports are
immutable once written.

## Relationships

```text
Handbook 1 ─ * Policy (unchanged)
Policy   * ─ * Chunk    (policy mode: 1-1; window mode: 1-N overlap)
Chunk    1 ─ 1 embedding entry (in its mode's cache, keyed by chunk key)
Answer   * ─ * Policy   (citations, unchanged validation)
Chunk    * ─ 1 ChunkingMode (via the run's --chunking parameter)
```
