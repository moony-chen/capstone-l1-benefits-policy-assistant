# Quickstart: Chunking Mode Switch

**Feature**: 002-chunking-mode-switch | **Date**: 2026-08-15

Validate the mode switch end-to-end. Contracts:
[CLI delta](./contracts/cli.md) · [001 CLI](../001-benefits-policy-qa/contracts/cli.md)
· Data: [data model](./data-model.md).

## Prerequisites

Same as feature 001 (Node ≥ 20.6, `.env`, `data/` inputs, `npm install`).
Existing policy-mode cache may be present (migration tested in scenario 1).

## Validation scenarios

### 1. Default invariance + cache migration (FR-005/SC-005)

```bash
npm run ask -- "How many sick days do I get per year?"
```

**Expected**: identical behavior to feature 001 — answer cites POL-009,
exit 0. If legacy `data/embeddings-cache.json` existed, stderr shows the
one-time migration note, then `cache hit [mode=policy, …]` (no embedding
calls). Report metadata path if evaluated: `chunkingMode: "policy"`.

### 2. Window-mode answered question (US1/FR-001..003)

```bash
npm run ask -- "What is the deductible on the Silver PPO plan?" --chunking window
```

**Expected**: first window run shows `cache miss → embedding ~10 window
chunks` on stderr, then `retrieved: W…(score)` lines; answer states the
$1,500 Silver PPO individual deductible citing POL-003, exit 0.

### 3. Conflict hard case under window mode (Principle III / SC-004)

```bash
npm run ask -- "When am I eligible for a sabbatical?" --chunking window
```

**Expected**: answer still surfaces BOTH POL-016 thresholds (five and
seven years). POL-016's two paragraphs may land in different windows —
if only one side appears, that is exactly the regression the comparison
must catch; note it.

### 4. Time-dependent hard case under window mode (SC-004)

```bash
npm run ask -- "How much does the company match on my 401k and when does it vest?" --chunking window
```

**Expected**: both POL-007 (pre-2026 match/vesting) and POL-015
(2026-01-01 changes) with dates; exit 0. Losing either side = regression.

### 5. Mode isolation (FR-004)

```bash
npm run ask -- "How many sick days do I get per year?"
```

**Expected**: after window runs, a no-flag (policy) run still shows
`cache hit [mode=policy]` — policy vectors were never evicted or reused
across modes; and `data/` holds both cache files.

### 6. Full window-mode eval + comparison (US2/FR-006..007)

```bash
npm run eval --chunking window
```

**Expected**: exit 0; 15/15 records; report metadata includes
`chunkingMode: "window"`; new `eval/results-<ts>.{json,md}`. Then author
`eval/comparison-<ts>.md` vs `eval/results-2026-08-15T12-56-48-996Z.*`:
per-question status/citation diffs, each classified
improvement/regression/neutral, explicit Q12/Q02/Q11 both-sides check,
honest verdict (window mode may legitimately lose — that is a finding,
not a failure; prior reports are never edited).

## What "done" looks like

- Scenarios 1–5 pass with expected exit codes, citations, and cache
  behavior in both modes.
- Scenario 6 produces the window-mode report and a comparison artifact
  with a stated verdict and zero unexplained diffs.
