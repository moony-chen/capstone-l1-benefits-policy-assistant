# Quickstart: Benefits Policy Q&A Tool

**Feature**: 001-benefits-policy-qa | **Date**: 2026-08-15

Run the assistant end-to-end and validate the spec's core behaviors.
Contracts: [CLI](./contracts/cli.md) · [Model API](./contracts/portkey-api.md)
· Data: [data model](./data-model.md).

## Prerequisites

- Node.js ≥ 20.6 (verified on v20.19.5) and npm
- Network access to `https://portkeygateway.perficient.com`
- `.env` in the repo root with `PORTKEY_API_KEY`, `PORTKEY_BASE_URL`,
  `RAG_LLM_MODEL`, `RAG_EMBED_MODEL` (already present)
- Inputs in place: `data/benefits_policies.md`,
  `data/sample_questions.csv` (already present)

## Setup

```bash
npm install        # installs tsx (dev dependency); no runtime deps
```

## Validation scenarios

Run in order; each checks a spec acceptance scenario. First run builds
the embedding cache (16 embedding calls); later runs reuse it.

### 1. Covered question with citation (User Story 1)

```bash
npm run ask -- "How much does the company match on my 401k and when does it vest?"
```

**Expected**: answer states the match/vesting terms AND — because this
topic is time-dependent — presents both POL-007 (100% of first 3% +
50% of next 2%, three-year graded vesting, in effect before 2026-01-01)
and POL-015 (100% of first 4%, immediate vesting, effective 2026-01-01)
with their dates. `Citations:` lists both policy ids. Exit code 0.

### 2. Internal conflict surfaced, not resolved (User Story 3)

```bash
npm run ask -- "When am I eligible for a sabbatical?"
```

**Expected**: answer reports that POL-016 states both five years
(eligibility) and seven years (approval review) — both quoted, neither
silently chosen. Exit code 0.

### 3. Uncovered question declined (User Story 2)

```bash
npm run ask -- "Does the company pay for my gym membership?"
```

**Expected**: explicit "the handbook does not cover this question"
message, `Citations: none`, exit code 3 — no invented policy details.

### 4. Embedding cache reuse (dependency/`data-model.md` transition)

```bash
npm run ask -- "How many sick days do I get per year?"
```

**Expected**: stderr shows `embeddings: cache hit [sha256=<hash>,
model=@azure-openai/text-embedding-3-small]` — zero embedding API calls.
Answer cites POL-009. Exit code 0.

Then touch nothing — but if `data/benefits_policies.md` changed, the same
command shows `cache miss → re-embedded 16 policies` (hash invalidation).

### 5. Full 15-question evaluation (User Story 4, Quality Gates)

```bash
npm run eval
```

**Expected**: stdout prints a 15-row summary (Q01–Q15: status +
citations); `eval/results-<timestamp>.{json,md}` are written with every
record carrying answer, citations, retrieved policies, and run metadata
(model ids, k, handbook sha256). Exit code 0. At least one decline
and/or conflict surfacing should appear across the set — a run where
all 15 answer cleanly is a signal to probe harder (constitution:
honest self-evaluation), e.g. check the sabbatical and 401(k) rows
explicitly.

## What "done" looks like

- Scenarios 1–5 all pass with the expected exit codes and citations.
- Two saved eval reports (before/after any change) demonstrate the
  measured-improvement loop, regressions included.
