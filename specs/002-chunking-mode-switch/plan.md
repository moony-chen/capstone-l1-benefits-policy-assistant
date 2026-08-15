# Implementation Plan: Chunking Mode Switch

**Branch**: `002-chunking-mode-switch` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-chunking-mode-switch/spec.md`

## Summary

Add a `--chunking policy|window` parameter to the existing single-file
assistant. Policy mode (default, absent flag = today's behavior, FR-005)
keeps one chunk per POL-NNN. Window mode splits the concatenated policy
text into deterministic sequential ~200-token (≈150-word) windows, each
annotated with the POL-NNN id(s) it overlaps so citation validation and
conflict surfacing continue to work (FR-003). The embedding cache is
keyed per mode (`data/embeddings-cache-{mode}.json`, one-time migration
of the existing cache file) so vectors never leak across strategies
(FR-004). Eval reports record `chunkingMode`. The feature culminates in
a measured window-mode eval vs the latest policy-mode baseline
(`eval/results-2026-08-15T12-56-48-996Z`) with per-question diffs and
explicit regression classification, including the POL-016 and
POL-007/POL-015 hard cases (FR-007, constitution Quality Gates).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged from
feature 001; tsx, native fetch, zero runtime deps)

**Primary Dependencies**: none at runtime (unchanged); dev: tsx,
typescript, @types/node

**Storage**: `data/embeddings-cache-policy.json` and
`data/embeddings-cache-window.json` (per-mode caches; legacy
`data/embeddings-cache.json` migrated once); eval reports under `eval/`

**Testing**: built-in eval mode in both modes + quickstart scenarios;
manual comparison artifact under `eval/` (same workflow as feature 001)

**Target Platform**: Node ≥ 20.6 with Portkey gateway access (unchanged)

**Project Type**: CLI tool (still single-file `assistant.ts`)

**Performance Goals**: window-mode run completes 15 questions with one
embedding batch call on cache miss; mode toggles never re-embed the
other mode's vectors

**Constraints**: constitution Principle V (single file, no runtime deps);
no-parameter behavior identical to current assistant (FR-005/SC-005);
deterministic window split (no model tokenizer call)

**Scale/Scope**: 19 policies → ~10-12 window chunks; 15 eval questions;
2 modes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Grounding-Only | Both modes pass only handbook-derived text to the LLM; window chunks carry handbook text verbatim; prompt rules unchanged | PASS |
| II. Always Cite | Window chunks display overlapped POL-NNN ids in the prompt so the model can cite; existing citation validation unchanged (FR-003, SC-001) | PASS |
| III. Surface Conflicts | Window mode risks splitting POL-016's two paragraphs; SC-004 makes losing a conflict side an explicit recorded regression in the comparison | PASS |
| IV. Decline When Uncovered | Decline rules/validation untouched by chunking mode | PASS |
| V. Dependency-Light | Parameter + chunker inside the existing `assistant.ts`; still single-file, zero runtime deps | PASS |
| VI. Evidence Standard | Eval reports record chunkingMode; comparison cites Q-ids, POL-ids, and measured diffs | PASS |
| Quality Gates | FR-007 mandates full 15-question window-mode eval + before/after comparison vs latest baseline, regressions included; prior reports immutable | PASS |

No violations; Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/002-chunking-mode-switch/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── cli.md           # CLI contract delta: --chunking flag + cache files
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created here)
```

### Source Code (repository root)

```text
assistant.ts                      # MODIFIED: Chunk abstraction, window chunker,
                                  # --chunking flag, per-mode cache paths,
                                  # chunkingMode in eval metadata
data/
├── benefits_policies.md          # unchanged input
├── sample_questions.csv          # unchanged input
├── embeddings-cache-policy.json  # generated (migrated from embeddings-cache.json)
└── embeddings-cache-window.json  # generated on first window-mode run
eval/
├── results-2026-08-15T06-55-18-823Z.*   # immutable baseline 1
├── results-2026-08-15T12-56-48-996Z.*   # immutable baseline 2 (comparison target)
├── results-<new-window-run>.*           # generated window-mode report
└── comparison-<new>.md                  # generated comparison artifact
```

**Structure Decision**: no new source files; feature 001's single-file
layout is preserved (Principle V), only `assistant.ts` is modified and
generated data files are added.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations.
