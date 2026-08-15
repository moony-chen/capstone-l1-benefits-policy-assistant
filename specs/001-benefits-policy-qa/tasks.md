# Tasks: Benefits Policy Q&A Tool

**Input**: Design documents from `/specs/001-benefits-policy-qa/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No separate test files requested. The built-in `eval` mode over Q01–Q15 is the test harness (plan.md Testing; constitution Quality Gates). Each user story ends with a verification task using its quickstart.md scenario.

**Organization**: Tasks are grouped by user story. NOTE: constitution Principle V mandates a single-file implementation (`assistant.ts`), so implementation tasks within a story are sequential edits to that one file; `[P]` is marked only where tasks touch genuinely different files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Single-file CLI tool at repository root: `assistant.ts`, `package.json`, `.env`
- Inputs: `data/benefits_policies.md`, `data/sample_questions.csv`
- Generated: `data/embeddings-cache.json`, `eval/results-<timestamp>.{json,md}`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization runnable by a reviewer with minimal setup

- [x] T001 Create `package.json` at repository root with `tsx` pinned dev dependency, npm scripts `ask` (`tsx assistant.ts ask`) and `eval` (`tsx assistant.ts eval`), `"type": "module"`, engines `node >=20.6`
- [x] T002 [P] Create `.gitignore` at repository root ignoring `node_modules/` and `data/embeddings-cache.json` (generated cache; eval reports under `eval/` are kept as Quality Gates evidence)
- [x] T003 Run `npm install` and verify `npx tsx --version` executes; confirm `data/benefits_policies.md` (19 policies) and `data/sample_questions.csv` (15 questions) are present

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure inside `assistant.ts` that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement environment loading and validation in `assistant.ts`: read `.env` vars (`PORTKEY_API_KEY`, `PORTKEY_BASE_URL`, `RAG_LLM_MODEL`, `RAG_EMBED_MODEL`); exit code 1 at startup naming any missing variable; never print the API key
- [x] T005 Implement handbook parsing in `assistant.ts`: split `data/benefits_policies.md` on `^## (POL-\d{3} .*)$` headings into Policy records (id, title, body, embedText); compute SHA-256 of the raw file; validate exactly 19 unique policies POL-001..POL-019 with non-empty bodies, fail loudly otherwise; define constant `EDITION_DATE = "2025-10-01"`
- [x] T006 Implement the Portkey gateway client in `assistant.ts` per `specs/001-benefits-policy-qa/contracts/portkey-api.md`: native `fetch` calls to `{BASE}/embeddings` (batch input, verify vector count matches input count) and `{BASE}/chat/completions` (extract `choices[0].message.content`); retry once with backoff on network/5xx/429, then exit 1 naming endpoint and model; exit 1 on unexpected response shapes

**Checkpoint**: Foundation ready — env validated, handbook parsed, gateway client working

---

## Phase 3: User Story 1 - Answer a covered question with a policy citation (Priority: P1) 🎯 MVP

**Goal**: A People Ops user asks a covered question and gets a grounded answer with valid POL-NNN citations within seconds

**Independent Test**: Ask a single-policy question (e.g. parental leave) and verify the answer is correct per the handbook, cites POL-010, and exits 0

### Implementation for User Story 1

- [x] T007 [US1] Implement the embedding cache in `assistant.ts` per `specs/001-benefits-policy-qa/data-model.md`: load `data/embeddings-cache.json` (`fileSha256`, `model`, `createdAt`, `embeddings` map); on startup compare handbook hash + `RAG_EMBED_MODEL` — HIT reuses vectors with zero API calls, MISS re-embeds all 19 policies in one batch and rewrites the cache atomically (temp file + rename); mismatched policy-id keys treated as MISS; print `embeddings: cache hit/miss ...` to stderr
- [x] T008 [US1] Implement retrieval in `assistant.ts`: embed the question, cosine similarity against cached policy vectors, top-k results (default k=4, `--k N` flag), log retrieved policy ids + scores to stderr
- [x] T009 [US1] Implement the answering prompt in `assistant.ts` per `specs/001-benefits-policy-qa/contracts/portkey-api.md`: system prompt encoding constitution rules — answer ONLY from provided policy texts, no outside knowledge, cite POL-NNN for every claim, treat today as 2025-10-01; user message with the question plus top-k policy texts; first output line MUST be `CITED:` or `DECLINED:`
- [x] T010 [US1] Implement the `ask` command in `assistant.ts` per `specs/001-benefits-policy-qa/contracts/cli.md`: argument parsing, pipeline ask→retrieve→chat→parse; extract every `POL-\d{3}` token from the answer and validate against parsed handbook ids (validation failure = loud exit 1, never a silent pass); `answered` requires ≥1 citation; print answer text + `Citations:` block to stdout; exit 0 on answered, 1 on error
- [x] T011 [US1] Verify US1: run `npm run ask -- "How many weeks of paid parental leave do I get?"` — expect 12 weeks primary / 4 weeks secondary citing POL-010, exit code 0; confirm a second run logs `cache hit` on stderr

**Checkpoint**: US1 fully functional — grounded, cited answers in seconds

---

## Phase 4: User Story 2 - Decline questions the handbook does not cover (Priority: P2)

**Goal**: Uncovered questions get an explicit decline with exit code 3 — never a guess

**Independent Test**: Ask an uncovered question (gym membership) and verify explicit not-covered message, no citations, exit 3

### Implementation for User Story 2

- [x] T012 [US2] Implement the DECLINED path in `assistant.ts`: parse `DECLINED:` first line, surface the explicit not-covered message to stdout with `Citations: none — not covered by the handbook.`, exit code 3; `declined` answers MUST have empty citations and MUST NOT contain policy specifics invented by the model (fail validation otherwise)
- [x] T013 [US2] Extend the system prompt in `assistant.ts` for partial coverage: when some aspects of a question are covered and others are not, answer the covered aspects with citations and explicitly flag the uncovered aspects as not covered; when retrieved text is only tangentially related, decline rather than stretch it
- [x] T014 [US2] Verify US2: run `npm run ask -- "Does the company pay for my gym membership?"` — expect explicit not-covered decline, `Citations: none`, exit code 3; run a partially covered question and confirm covered part answered with citation + uncovered part flagged

**Checkpoint**: US1 + US2 both independently working

---

## Phase 5: User Story 3 - Surface conflicting or time-dependent policies (Priority: P3)

**Goal**: Conflicts (POL-016 five vs seven years) and time-dependent policies (POL-007 vs POL-015 across 2026-01-01) are reported with both sides and dates — never silently resolved

**Independent Test**: Ask about sabbatical eligibility and the 401(k) match; both sides and dates appear in each answer

### Implementation for User Story 3

- [x] T015 [US3] Extend the system prompt in `assistant.ts` for conflicts and time-dependency per constitution Principle III: when retrieved policies conflict or change over time, present ALL sides with their POL-NNN ids and dates/effective windows relative to today = 2025-10-01; never silently choose, average, or omit a side; verify k=4 retrieves both POL-007 and POL-015 for 401(k) questions (log retrieved ids to stderr as evidence)
- [x] T016 [US3] Verify US3 with quickstart scenarios 1–2 in `specs/001-benefits-policy-qa/quickstart.md`: 401(k) question shows POL-007 terms (before 2026-01-01) AND POL-015 changes (effective 2026-01-01); sabbatical question shows POL-016's five-year eligibility AND seven-year approval review, both cited; both exit 0

**Checkpoint**: All answering stories (US1–US3) independently functional

---

## Phase 6: User Story 4 - Reviewer evaluates against all sample questions (Priority: P4)

**Goal**: One command runs all 15 sample questions and writes a complete evaluation report — the Quality Gates evidence artifact

**Independent Test**: Run `npm run eval`; verify a complete 15-record report (answer, citations, status per question) with run metadata

### Implementation for User Story 4

- [x] T017 [US4] Implement CSV parsing in `assistant.ts` for `data/sample_questions.csv`: read question_id + employee_question rows (Q01–Q15); exit 1 if the file is missing or does not contain exactly 15 uniquely-identified questions
- [x] T018 [US4] Implement the `eval` command loop in `assistant.ts`: run the US1–US3 answer pipeline for each question (shared embedding cache, single cache build), pace calls to respect gateway rate limits, collect EvaluationRecords (questionId, question, answer, retrievedPolicies) per `specs/001-benefits-policy-qa/data-model.md`
- [x] T019 [US4] Implement report writing in `assistant.ts`: write `eval/results-<timestamp>.json` and `.md` (per-question answer, citations, status; run metadata: timestamp, both model ids, k, handbook sha256) plus a 15-row summary table to stdout; exit 0 if the report is complete (15 validated records), 1 otherwise; ensure no secrets appear in reports
- [x] T020 [US4] Run `npm run eval` end-to-end: verify exit 0, 15 records, Q01–Q15 all present; save this baseline report (before/after evidence for any future improvement per Quality Gates); explicitly inspect the sabbatical and 401(k) rows for conflict surfacing and probe for failure cases — a uniformly clean run must be investigated, not celebrated

**Checkpoint**: Full Quality Gates evidence loop working

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and compliance audit across all stories

- [x] T021 Run all five scenarios in `specs/001-benefits-policy-qa/quickstart.md` in order; confirm expected exit codes (0/0/3/0/0), citations, cache hit line, and eval artifacts
- [x] T022 Audit output hygiene in `assistant.ts`: `PORTKEY_API_KEY` never appears in stdout, stderr, eval reports, or the cache; stdout carries only user-facing answer content per `specs/001-benefits-policy-qa/contracts/cli.md`
- [x] T023 Final constitution compliance review: confirm single-file implementation (`assistant.ts`), zero runtime dependencies, one-chunk-per-policy intact, citation validation active, decline exit code 3, 2025-10-01 reference date used everywhere; clean up dead code and unused flags

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–6)**: Depend on Foundational completion
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational; builds the ask/retrieve/answer pipeline
- **User Story 2 (P2)**: Builds on US1's pipeline (same file); independently testable via decline scenarios
- **User Story 3 (P3)**: Builds on US1's pipeline (same file); independently testable via conflict scenarios
- **User Story 4 (P4)**: Builds on US1–US3 behaviors (eval exercises the full pipeline); independently testable via `npm run eval`

Note: because Principle V mandates a single file, stories share `assistant.ts` and are recommended sequential (P1 → P2 → P3 → P4) even though each has an independent verification gate.

### Within Each User Story

- Cache/parsing before retrieval; retrieval before prompting; prompting before command wiring; verification task LAST
- Single-file constraint: tasks within a story are sequential edits — no parallelism within `assistant.ts`

### Parallel Opportunities

- T001 (`package.json`) and T002 (`.gitignore`) can run in parallel (different files)
- Verification runs across different stories (T011, T014, T016) exercise the same file and should run sequentially
- No other file-level parallelism exists by design (single-file constitution constraint)

---

## Parallel Example: Setup

```bash
# These two touch different files and can run together:
Task: "Create package.json at repository root..." (T001)
Task: "Create .gitignore at repository root..." (T002)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: T011 independent test (parental leave → POL-010, exit 0)
5. Demo-able: cited answers for covered questions

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add User Story 1 → test via T011 → MVP
3. Add User Story 2 → test via T014 (declines, exit 3)
4. Add User Story 3 → test via T016 (both-sides conflict answers)
5. Add User Story 4 → test via T020 (15-question eval report = Quality Gates baseline)
6. Polish → T021 full quickstart sweep

### Parallel Team Strategy

Not applicable: single-file implementation makes task-level parallelism unsafe beyond Setup; one developer proceeding sequentially is the intended workflow (constitution Principle V).

---

## Notes

- [P] tasks = different files, no dependencies (only T001/T002 qualify)
- [Story] label maps each task to its spec user story for traceability
- Every verification task cites its quickstart.md scenario or explicit expected behavior (exit codes, policy ids) per constitution Principle VI
- Stop at any story checkpoint to validate independently
- After any post-baseline change, re-run `npm run eval` and report measured before/after including regressions (Quality Gates)

---

## Phase 8: Improvement — correct over-answered Q13 to a decline (Quality Gates cycle)

**Goal**: Q13 ("does PTO keep accruing during parental leave?") is not addressed
by the handbook; the baseline run (eval/results-2026-08-15T06-55-18-823Z)
wrongly marked it `answered` by summarizing related-but-non-responsive
policies. Fix the behavior, then demonstrate it with the constitution's
measured before/after cycle including regressions.

- [x] T024 Tighten the answering rules in `assistant.ts`: when a question's
  central ask is not addressed by retrieved policies — even when related
  policies provide background context — the system MUST fully decline
  (DECLINED, no citations, exit 3). Partial-coverage answers are only for
  multi-part questions where at least one part is directly answerable.
- [x] T025 Verify the fix on `ask`: Q13 question declines with exit 3; the
  multi-part partial-coverage case (pet insurance + dental cleanings) still
  answers the covered part with citations, exit 0 (regression guard).
- [x] T026 Re-run `npm run eval` end-to-end into a new report under `eval/`
  (after-state; baseline report stays untouched).
- [x] T027 Compare the two reports (before vs after) in
  `eval/comparison-<timestamp>.md`: per-question status and citation diff;
  expected change is exactly Q13 answered→declined; report ANY other change
  honestly as a regression (constitution Quality Gates).
