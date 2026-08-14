<!--
Sync Impact Report
==================
- Version change: (unratified template) -> 1.0.0
  Reason: initial ratification; every template placeholder resolved with
  project-specific content. Initial version is 1.0.0 by convention.
- Modified principles: N/A (first ratification; PRINCIPLE_1..6 placeholders
  filled verbatim in spirit from the ratified input).
- Added sections:
  - Core Principles I-VI: Grounding-Only, Always Cite, Surface Conflicts,
    Decline When Uncovered, Dependency-Light, Evidence Standard
  - Quality Gates (15-question evaluation coverage, measured before/after
    including regressions, reference date 2025-10-01)
  - Governance (amendment procedure, semantic versioning, compliance review)
- Removed sections: template [SECTION_3] slot dropped; the ratified input
  supplies one extra section (Quality Gates), which fills [SECTION_2].
  No third content section was required. Not a deferred TODO.
- Follow-up TODOs: none
-->

# Benefits Policy Assistant Constitution

## Core Principles

### I. Grounding-Only (NON-NEGOTIABLE)
Answers MUST come solely from text retrieved from the employee benefits
handbook (`benefits_policies.md`). The assistant MUST NOT use outside
knowledge, model priors, or general benefits-industry assumptions to fill
gaps. Information not present in retrieved passages does not exist for the
purpose of answering.

Rationale: the handbook is the sole authority; a plausible answer sourced
from model memory instead of the handbook is a compliance hazard, not a
convenience.

### II. Always Cite (NON-NEGOTIABLE)
Every answer MUST cite the POL-NNN policy id(s) it relies on. An answer
with no policy citation — or whose cited policies do not actually support
its claims — is a failed answer regardless of its content.

### III. Surface Conflicts
When retrieved policies conflict (e.g., POL-016 stating both five and seven
years of service for sabbatical eligibility) or are time-dependent (e.g.,
POL-007 vs POL-015 on the 401(k) match before and after 2026-01-01), the
assistant MUST report both sides together with their dates or effective
windows. The system MUST NOT silently choose one side or average them.

Rationale: silently resolving a conflict hides a legal/plan ambiguity the
employee needs to know about.

### IV. Decline When Uncovered (NON-NEGOTIABLE)
If the handbook does not cover a question, the assistant MUST say so
explicitly. It MUST NOT guess, extrapolate, or answer from general
knowledge. A correct decline is a correct answer.

### V. Dependency-Light
The assistant MUST remain a single-file implementation that a reviewer can
run end-to-end with minimal setup. Designs that require standing up
services, databases, or container infrastructure are out of scope.

Rationale: reviewability is a deliverable; the system must be auditable by
one person on one machine.

### VI. Evidence Standard
Every claim — in answers, evaluation tables, or improvement write-ups —
MUST cite a policy id (POL-NNN), a question id (Q01–Q15), or a measured
number. Unquantified judgments (e.g., "handles conflicts well") are
inadmissible as evidence.

## Quality Gates

- **Full evaluation coverage**: evaluation MUST cover all fifteen sample
  questions in `sample_questions.csv` (Q01–Q15); for each, the answer
  given, the policy cited, and a groundedness judgement MUST be recorded.
- **Measured improvement only**: every proposed improvement MUST show
  measured before/after results across the full question set, including
  any regressions (questions that got worse). Improvements without
  measurement, or reports that omit regressions, do not count.
- **Reference date**: the handbook edition date, 2025-10-01
  (1 October 2025), is treated as "today" for all time-dependent policy
  reasoning and for all evaluation.
- **Honest self-evaluation**: the assistant MUST be probed for failures,
  not only successes; the handbook contains internal conflicts and at
  least one question it cannot answer. An evaluation reporting uniform
  passes is rejected as not serious.

## Governance

- This constitution supersedes ad-hoc practice: every spec, plan, task
  list, and evaluation artifact MUST comply with Principles I–VI and the
  Quality Gates; violations block progression to the next phase.
- **Amendment procedure**: propose the change with rationale, apply a
  semantic version bump (MAJOR: principle removal or redefinition;
  MINOR: new principle or section; PATCH: wording or clarification),
  record the change in the Sync Impact Report at the top of this file,
  and update the Last Amended date.
- **Compliance review**: each phase (specify, plan, implement) and each
  improvement write-up MUST be checked against this constitution before
  being accepted; conflict handling (Principle III) and declines
  (Principle IV) receive explicit review.
- **Source artifacts of record**: the handbook `benefits_policies.md` and
  the sample questions `sample_questions.csv`; question ids Q01–Q15 and
  policy ids POL-NNN as defined there.

**Version**: 1.0.0 | **Ratified**: 2026-08-14 | **Last Amended**: 2026-08-14
