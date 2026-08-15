# Feature Specification: Chunking Mode Switch

**Feature Branch**: `002-chunking-mode-switch`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "I would like to try different chunking strategy, like a fixed 200 token window. add a chunking mode switch parameter, so I can switch between the old one and new. when done also do a round of eval and compare the result with last run"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switch between chunking strategies (Priority: P1)

A reviewer of the assistant can choose, per run, how the handbook is cut
into retrieval chunks: the existing strategy (one chunk per whole POL-NNN
policy — the default, unchanged) or an alternative strategy that splits
the handbook into fixed windows of approximately 200 tokens each,
regardless of policy boundaries. The choice is made with a simple
parameter on both single-question and evaluation runs. Everything else
(grounding rules, citations, conflict handling, declines) behaves
identically in both modes.

**Why this priority**: the switch itself is the deliverable — without it
no strategy comparison is possible.

**Independent Test**: run the same covered question in both modes; both
return grounded, cited answers (citations still being valid POL-NNN ids),
and the mode used is visible in the run's output/metadata.

**Acceptance Scenarios**:

1. **Given** a run without the parameter, **When** the assistant starts,
   **Then** it uses the existing one-chunk-per-policy strategy — behavior
   identical to today (no parameter required, nothing changes for
   existing users).
2. **Given** a run with the window mode selected, **When** the handbook
   is indexed, **Then** it is split into sequential ~200-token windows,
   each window remembering the POL-NNN policy id(s) it came from so every
   answer can still cite valid policy ids.
3. **Given** either mode, **When** an answer is produced, **Then**
   citation validation still rejects any POL-NNN id that does not exist
   in the handbook (constitution Principles I–II hold in both modes).
4. **Given** a switch from one mode to the other, **When** retrieval
   happens, **Then** embeddings from the other mode's chunks are never
   reused (the embedding cache is keyed so stale vectors cannot leak
   across strategies).

---

### User Story 2 - Measured comparison of the two strategies (Priority: P2)

The reviewer runs the full fifteen-question evaluation in window mode and
compares it against the most recent policy-mode run
(`eval/results-2026-08-15T12-56-48-996Z`), per the constitution's
measured-improvement gate. The comparison reports, question by question,
which answers/citations changed, which got better, which got worse —
with special attention to the known hard cases: conflict questions
(sabbatical POL-016) and time-dependent questions (401(k) POL-007 vs
POL-015), where splitting policies across window boundaries risks
retrieving only one side of the story.

**Why this priority**: the whole point of the switch is to measure
whether the alternative strategy helps or hurts; without a before/after
comparison the feature has no verdict (constitution Quality Gates).

**Independent Test**: a comparison artifact exists under `eval/` showing
per-question status/citation diffs between the window-mode run and the
last policy-mode run, including a stated verdict and any regressions.

**Acceptance Scenarios**:

1. **Given** window mode selected, **When** the evaluation runs, **Then**
   all fifteen questions (Q01–Q15) produce records (answer, citations,
   status) plus run metadata that includes the chunking mode used.
2. **Given** both reports, **When** compared, **Then** the comparison
   names every question whose status or citations changed, and classifies
   each change as improvement, regression, or neutral — regressions are
   reported, never hidden.
3. **Given** the known conflict/time-dependent questions, **When**
   window mode answers them, **Then** the comparison explicitly checks
   both sides + dates are still present; if window mode loses a side,
   that is recorded as a regression.
4. **Given** the comparison verdict, **When** window mode shows no
   measured benefit (or regressions), **Then** policy mode remains the
   default and the window mode stays available purely as an option —
   the default strategy only changes with measured evidence.

### Edge Cases

- What happens when a 200-token window spans two policies' text? The
  window carries all POL-NNN ids it overlaps; citations remain valid for
  any of those policies.
- What happens when a policy is shorter than the window? Its text simply
  shares a window with neighboring text (window mode is strictly
  sequential; no padding or policy-anchored restarts).
- What happens when the last window is far below 200 tokens? It is kept
  as-is (no merging rule beyond sequence construction).
- What happens when mode is switched between two runs seconds apart?
  Each mode uses its own cache entries (or rebuilds), never the other's.
- What about the handbook preamble (before POL-001)? It is not policy
  text; window mode skips it exactly as policy mode does not embed it.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST support a chunking mode parameter with at
  least two values: the existing policy-per-chunk mode (default when the
  parameter is absent) and a fixed-window mode of approximately 200
  tokens per chunk.
- **FR-002**: The parameter MUST apply to both single-question answering
  and full evaluation runs.
- **FR-003**: In window mode, every chunk MUST retain the POL-NNN
  policy id(s) its text overlaps, so answers still cite valid policy ids
  and existing citation validation continues to work unchanged.
- **FR-004**: The embedding cache MUST prevent cross-mode reuse: vectors
  built for one chunking strategy MUST NOT satisfy a run in the other
  strategy.
- **FR-005**: Omitting the parameter MUST produce behavior identical to
  the current assistant (policy mode; no defaults change).
- **FR-006**: Evaluation reports MUST record the chunking mode used, so
  any report can be attributed to a strategy without guessing.
- **FR-007**: A full window-mode evaluation MUST be run and compared
  against the latest policy-mode evaluation, with per-question diffs and
  explicit classification of improvements/regressions, including the
  conflict (POL-016) and time-dependent (POL-007/POL-015) questions.

### Key Entities *(include if feature involves data)*

- **ChunkingMode**: the selected strategy — `policy` (one chunk per
  POL-NNN, default) or `window` (sequential ~200-token chunks).
- **Chunk**: a retrieval unit. In policy mode: exactly one policy. In
  window mode: ~200 tokens of sequential handbook text, annotated with
  the POL-NNN id(s) it overlaps.
- **EmbeddingCache** (extended): keyed additionally by chunking mode so
  each strategy has its own vector set for the same handbook hash.
- **EvaluationReport** (extended): gains a `chunkingMode` field in run
  metadata.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of answers in either mode cite only valid POL-NNN ids
  (zero citation-validation failures across both modes' 15-question
  evaluations).
- **SC-002**: A window-mode evaluation completes all 15 questions
  (Q01–Q15) with the mode recorded in its report metadata.
- **SC-003**: A comparison artifact exists quantifying per-question
  status/citation changes between the window-mode run and the latest
  policy-mode run, with every change classified and regressions
  explicitly listed.
- **SC-004**: Conflict (Q12/POL-016) and time-dependent (Q02, Q11 /
  POL-007+POL-015) questions are checked in the comparison: both sides +
  dates present = pass; any lost side = recorded regression.
- **SC-005**: Default behavior (no parameter) is bit-for-bit the prior
  strategy — verified by the absence of diffs between a no-parameter
  policy-mode run and the existing policy-mode behavior.

## Assumptions

- "200 token window" is approximate: a deterministic word/whitespace
  based approximation (no model tokenizer call) is acceptable as long as
  chunks average near 200 tokens and the split is reproducible run to
  run.
- Window mode is an experiment/diagnostic option; the default strategy
  changes only if a future measured comparison justifies it (this spec's
  comparison may conclude window mode is worse — that is a valid
  outcome, not a failure).
- Both modes share the existing model gateway, retrieval depth (k=4
  default), prompt rules, and validation logic; only chunk construction
  and cache keying differ.
- The latest policy-mode baseline for comparison is
  `eval/results-2026-08-15T12-56-48-996Z` (14 answered, Q13 declined);
  prior runs are immutable evidence and are never edited or deleted.
