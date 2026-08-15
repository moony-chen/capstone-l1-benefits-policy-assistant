# Tasks: Chunking Mode Switch

**Input**: Design documents from `/specs/002-chunking-mode-switch/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No separate test files. Verification tasks use quickstart.md scenarios plus the built-in eval harness in both modes (Quality Gates evidence).

**Organization**: Tasks grouped by user story. Constitution Principle V keeps everything in `assistant.ts`, so implementation tasks are sequential edits to that one file; `[P]` is marked only where tasks touch genuinely different files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- Single-file CLI at repository root: `assistant.ts`
- Generated caches: `data/embeddings-cache-policy.json`, `data/embeddings-cache-window.json` (legacy `data/embeddings-cache.json` migrated once)
- Reports: `eval/results-<timestamp>.{json,md}`, `eval/comparison-<timestamp>.md`
- Baselines (immutable): `eval/results-2026-08-15T06-55-18-823Z.*`, `eval/results-2026-08-15T12-56-48-996Z.*`

---

## Phase 1: Setup

**Purpose**: Prep before touching `assistant.ts`

- [ ] T001 Update `.gitignore` at repository root to ignore BOTH generated cache files (`data/embeddings-cache-policy.json`, `data/embeddings-cache-window.json`) in place of the legacy single entry

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core abstractions inside `assistant.ts` that both modes and both user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T002 Refactor `assistant.ts` to a unified Chunk type per specs/002-chunking-mode-switch/data-model.md: `{ key, policyIds, header, body, embedText }`; policy-mode chunker produces 19 chunks from the existing Policy records (key=`POL-NNN`, header=`{id} {title}`) with retrieval, prompting (`header\n\n{body}`), and cache logic now operating on Chunks — zero behavior change in policy mode (guards US1 scenario 1)
- [ ] T003 Implement the window chunker in `assistant.ts` per specs/002-chunking-mode-switch/research.md D1/D3: concatenate `{id} {title}\n\n{body}` of all 19 policies in handbook order (preamble excluded), split into sequential ≤150-word windows (whole words, deterministic), key=`W01`…, policyIds=overlapped POL-NNN ids, header=`Excerpt from {ids}`; validate every chunk's policyIds ⊆ parsed handbook ids and all windows ≤150 words (final window may be shorter)
- [ ] T004 Implement per-mode embedding caches in `assistant.ts` per specs/002-chunking-mode-switch/data-model.md: `data/embeddings-cache-{policy|window}.json` with validity = fileSha256 ∧ model ∧ mode (window mode additionally checks windowWords=150 ∧ chunk keys match); HIT logs `cache hit [mode=…, sha256=…, model=…]`, MISS embeds all chunks of that mode in ONE batch and atomically rewrites only that mode's file; one-time legacy migration renames valid `data/embeddings-cache.json` → `embeddings-cache-policy.json` (noted on stderr), never touching window cache
- [ ] T005 Implement `--chunking <policy|window>` argument parsing in `assistant.ts` for both `ask` and `eval` per specs/002-chunking-mode-switch/contracts/cli.md: optional flag, absent ⇒ policy; invalid value ⇒ exit 1 with usage; `--k` unchanged (range 1–19); document-confirmed npm `--` semantics (flags after `--` reach the script)

**Checkpoint**: Both chunkers + caches + flag parsing ready; policy mode still behaves exactly as feature 001

---

## Phase 3: User Story 1 - Switch between chunking strategies (Priority: P1) 🎯 MVP

**Goal**: A reviewer selects policy or window chunking per run; everything else (grounding, citations, conflicts, declines) is mode-invariant

**Independent Test**: Quickstart scenarios 1–5 of specs/002-chunking-mode-switch/quickstart.md — default invariance + migration, window answers, both conflict hard cases under window mode, mode isolation

### Implementation for User Story 1

- [ ] T006 [US1] Wire the mode through the answering pipeline in `assistant.ts`: mode selects chunker + cache file; retrieval ranks Chunks (stderr shows `W03(0.582)…` or `POL-NNN(…)` per mode); `retrievedPolicies` in answers/eval records becomes the de-duplicated union of top-k chunks' policyIds; `userPrompt` renders each chunk as `header\n\n{body}` so window prompts expose citable POL ids (FR-003)
- [ ] T007 [US1] Verify US1 with quickstart scenarios 1–5 in specs/002-chunking-mode-switch/quickstart.md: (1) no-flag sick-days ask → POL-009, exit 0, legacy cache migration + `cache hit [mode=policy]`; (2) `-- --chunking window` Silver PPO ask → $1,500 deductible citing POL-003, exit 0; (3) sabbatical window ask → BOTH five- and seven-year POL-016 thresholds present; (4) 401(k) window ask → POL-007 AND POL-015 with dates; (5) mode isolation — after window runs, no-flag ask still `cache hit [mode=policy]`, both cache files exist
- [ ] T008 [US1] Add `chunkingMode` to eval report metadata in `assistant.ts` (required field, `policy|window`) and to the markdown report header per FR-006; confirm a policy-mode eval record (spot-run `eval -- --k 4` if a fresh report is needed) carries `chunkingMode: "policy"`

**Checkpoint**: Mode switch fully functional and isolated in both directions

---

## Phase 4: User Story 2 - Measured comparison of the two strategies (Priority: P2)

**Goal**: Full window-mode evaluation + comparison artifact vs the latest policy-mode baseline, regressions included (constitution Quality Gates)

**Independent Test**: `eval/comparison-<timestamp>.md` exists with per-question diffs, classifications, hard-case checks, and a stated verdict

### Implementation for User Story 2

- [ ] T009 [US2] Run full window-mode evaluation: `npm run eval -- --chunking window` → exit 0, 15/15 records, report tagged `chunkingMode: "window"` saved under `eval/` (new file; baselines untouched)
- [ ] T010 [US2] Author `eval/comparison-<timestamp>.md` comparing the window-mode report against `eval/results-2026-08-15T12-56-48-996Z` per specs/002-chunking-mode-switch/quickstart.md scenario 6: per-question status/citation table, each diff classified improvement/regression/neutral with evidence quotes; explicit SC-004 checks that Q12 (POL-016 both thresholds), Q02 and Q11 (POL-007 + POL-015 both present with dates) lost no side; honest verdict — window mode losing is a valid finding, and the default stays policy unless evidence says otherwise
- [ ] T011 [US2] Audit outputs after the comparison: no `PORTKEY_API_KEY` in either report or comparison; both baselines byte-identical to pre-feature state (`git status` clean for `eval/results-2026-08-15T*`); comparison cites question ids, policy ids, and measured numbers only (Principle VI)

**Checkpoint**: Measured before/after evidence complete; Quality Gates satisfied

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T012 Run `npx tsc --noEmit` clean; rerun quickstart scenario 1 to re-confirm default-mode invariance after all changes; ensure stderr cache/migration notes match the contract wording in specs/002-chunking-mode-switch/contracts/cli.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: immediate; single file edit
- **Foundational (Phase 2)**: after Setup — BLOCKS both stories (single-file constraint forces sequence)
- **US1 (Phase 3)**: after Foundational
- **US2 (Phase 4)**: after US1 (needs the working switch + tagged reports)
- **Polish (Phase 5)**: last

### User Story Dependencies

- **US1**: Foundational only; independently verified by T007
- **US2**: Depends on US1's switch and report tagging; independently verified by the comparison artifact from T010

### Within Each User Story

- Abstraction before wiring; wiring before verification; verification before reports
- Single-file constraint: all `assistant.ts` edits sequential — no parallelism

### Parallel Opportunities

- None beyond nothing: one source file, one .gitignore edit — tasks are deliberately sequential (Principle V)

---

## Parallel Example

Not applicable: single-file implementation (constitution Principle V) makes every task sequential; only T001 touches a different file and it must precede cache-generation runs.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: .gitignore update
2. Phase 2: Chunk abstraction → window chunker → per-mode caches → flag parsing
3. Phase 3: pipeline wiring + scenario verifications + report tagging
4. **STOP and VALIDATE**: T007 scenarios 1–5 all pass
5. Demo-able: switchable strategies with mode-invariant guarantees

### Incremental Delivery

1. Setup + Foundational → switch machinery ready
2. US1 → verified mode switching (MVP)
3. US2 → window-mode eval + comparison artifact (the measured verdict)
4. Polish → typecheck + invariance re-confirmation

---

## Notes

- [P] tasks: none qualify — single-file constraint (see Parallel Opportunities)
- [Story] labels map tasks to spec user stories for traceability
- Baselines `eval/results-2026-08-15T*.md|json` are immutable evidence: never edit, delete, or overwrite (T011 audits this)
- Regressions in the comparison are findings to report, not reasons to rerun until green (constitution: honest self-evaluation)
- After any post-comparison change, repeat the US2 cycle: new eval + new comparison (Quality Gates)
