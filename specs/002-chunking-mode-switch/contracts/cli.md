# CLI Contract: Chunking Mode Switch (delta on feature 001)

**Feature**: 002-chunking-mode-switch | **Date**: 2026-08-15

Extends [001 CLI contract](../001-benefits-policy-qa/contracts/cli.md).
Everything not mentioned here is unchanged, including exit codes
(0 answered / 3 declined / 1 error) and all constitution guarantees.

## New parameter: `--chunking <policy|window>`

Applies to both commands; optional; absent ⇒ `policy` (behavior identical
to feature 001 — FR-005).

```text
npm run ask -- "question" [--k N] [--chunking window]
tsx assistant.ts ask "question" --chunking policy
npm run eval -- [--k N] [--chunking window]
```

**npm flag-passing rule**: via `npm run`, the `--` separator is REQUIRED
before any flags — npm otherwise consumes them itself and the script
receives only the remaining words (verified empirically: `npm run ask
--k abc "test"` dropped `--k abc` and ran with defaults). Direct `tsx
assistant.ts …` invocations need no `--`.

**Behavior**:
- `--chunking policy` — one chunk per POL-NNN; cache at
  `data/embeddings-cache-policy.json`.
- `--chunking window` — sequential ~200-token (150-word) windows over the
  concatenated policy text; each window's prompt header names the
  overlapped POL-NNN ids so answers still cite valid policies; cache at
  `data/embeddings-cache-window.json`.
- Invalid value (e.g. `--chunking sentence`) ⇒ exit 1 with usage message.

**Cache migration (one-time)**: if legacy `data/embeddings-cache.json`
exists and is valid for policy mode, it is renamed to
`embeddings-cache-policy.json` (noted on stderr); window mode ignores it.

**stderr diagnostics** (unchanged shape, mode-aware):
`embeddings: cache hit [mode=window, sha256=<hash>, model=<id>]`,
`retrieved: W03(0.582) W07(0.551) …` (window keys) or POL ids (policy
mode); `retrievedPolicies` in eval records is the de-duplicated union of
overlapped POL ids either way.

## Eval report delta

Report metadata gains a required `chunkingMode` field (`policy` |
`window`). Report files and format otherwise unchanged, so before/after
comparisons with feature 001 baselines remain mechanical.

## Guarantees preserved in BOTH modes

1. Citation validation: every POL-NNN token in an answer must exist in
   the parsed handbook (code-enforced, unchanged).
2. Conflicts/time-dependent policies: both sides + dates (regression
   check lives in the comparison workflow, SC-004).
3. Uncovered questions decline with exit 3.
4. Reference date 2025-10-01.
