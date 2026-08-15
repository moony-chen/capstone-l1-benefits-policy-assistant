# Feature Specification: Benefits Policy Q&A Tool

**Feature Branch**: `001-benefits-policy-qa`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "I want to create a small tool for the People Operation team, when employees ask benefits questions, they can easily retrieve the police from the handbook, and answer the question right away. A cite of the POL_NNN must be used, and if the handbook is not covered, just decline the question"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Answer a covered question with a policy citation (Priority: P1)

A People Operations team member receives an employee benefits question
(e.g., "How much does the company match on my 401k?"). They type the
question into the tool and immediately receive a plain-language answer
grounded in the employee benefits handbook, with the POL-NNN policy id(s)
that support it. The team member can relay the answer to the employee
without opening the handbook themselves.

**Why this priority**: This is the core value of the tool — fast, verifiable
answers. Without it, nothing else matters.

**Independent Test**: Ask one question that is clearly covered by a single
policy; verify the answer is correct per the handbook and cites that
policy id.

**Acceptance Scenarios**:

1. **Given** a question fully covered by one or more handbook policies,
   **When** the user submits it, **Then** the tool returns an answer whose
   every factual statement is supported by the cited POL-NNN policy text.
2. **Given** a question covered by multiple policies, **When** the user
   submits it, **Then** the tool cites every policy it relied on.
3. **Given** a covered question, **When** the tool answers, **Then** the
   response arrives within seconds so it can be relayed "right away".

---

### User Story 2 - Decline questions the handbook does not cover (Priority: P2)

An employee asks something the handbook does not address (e.g., a question
about a benefit plan the company does not offer, or a topic outside
benefits). The tool explicitly states that the handbook does not cover the
question, rather than guessing or producing an answer from general
knowledge. The People Ops member knows immediately to escalate or answer
from another authoritative source.

**Why this priority**: A wrong-but-confident answer is worse than no
answer; the user explicitly required declining, and constitution
Principle IV makes it non-negotiable.

**Independent Test**: Ask a question on a topic absent from the handbook;
verify the tool declines explicitly and invents no policy details.

**Acceptance Scenarios**:

1. **Given** a question on a topic with no supporting policy in the
   handbook, **When** the user submits it, **Then** the tool responds with
   an explicit "not covered by the handbook" statement and no invented
   answer.
2. **Given** a partially covered question (some aspects covered, others
   not), **When** the user submits it, **Then** the tool answers the
   covered aspects with citations and explicitly flags the uncovered
   aspects as not covered.

---

### User Story 3 - Surface conflicting or time-dependent policies (Priority: P3)

An employee asks about a topic where the handbook disagrees with itself
(e.g., sabbatical eligibility stated as both five and seven years of
service in POL-016) or where the answer changes over time (e.g., the
401(k) match under POL-007 before versus after the 2026 update POL-015).
The tool presents both sides with their dates/effective windows instead of
silently picking one.

**Why this priority**: These are the questions where a naive tool silently
gives a legally risky answer; the constitution (Principle III) forbids
silent resolution.

**Independent Test**: Ask about sabbatical eligibility and about the 401(k)
match; verify both sides and dates appear in each answer.

**Acceptance Scenarios**:

1. **Given** a question where retrieved policies conflict, **When** the
   user submits it, **Then** the tool reports both conflicting statements
   with their POL-NNN ids.
2. **Given** a question whose answer depends on the date (policy effective
   or expiring relative to the reference date), **When** the user submits
   it, **Then** the tool presents each version with its effective dates
   and does not silently choose the current one without noting the change.

---

### User Story 4 - Reviewer evaluates against all sample questions (Priority: P4)

A reviewer runs the tool end-to-end against the complete set of fifteen
sample evaluation questions and records, for each: the answer given, the
policy cited, and whether it is correct and properly grounded. Any
improvement to the tool is demonstrated with measured before/after results
across the full set, including regressions.

**Why this priority**: Constitutional Quality Gates require full coverage
evaluation and measured improvements; this is how honesty of the whole
system is demonstrated, though the tool is useful without it.

**Independent Test**: Run the evaluation over all fifteen sample questions
(Q01–Q15); verify a complete recorded table of answers, citations, and
groundedness judgements.

**Acceptance Scenarios**:

1. **Given** the fifteen sample questions, **When** the reviewer evaluates
   the tool, **Then** every question has a recorded answer, cited
   policies, and a correctness/groundedness judgement.
2. **Given** a proposed improvement to the tool, **When** it is applied,
   **Then** before/after results across all fifteen questions are
   reported, including any questions that got worse.

### Edge Cases

- What happens when a question is vague or ambiguous (e.g., "the leave
  policy")? The tool retrieves the most plausible matching policies and
  answers with citations, or asks which benefit is meant if it cannot
  identify one; it does not guess specifics.
- What happens when retrieved text is only tangentially related to the
  question? The tool treats the question as not covered and declines
  rather than stretching a weak passage into an answer.
- What happens when a policy's effect depends on dates relative to the
  handbook edition (2025-10-01)? Dates are always reasoned against that
  reference date, which is treated as "today".
- What happens when a question mixes a covered topic and an uncovered
  topic in one sentence? The covered part is answered with citations and
  the uncovered part explicitly declined (see User Story 2, scenario 2).
- What happens when the handbook file is missing or unreadable? The tool
  fails loudly with a clear setup message instead of answering from
  anything else.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST accept a natural-language employee benefits
  question and return a plain-language answer promptly (target: within
  seconds, suitable for live relay to an employee).
- **FR-002**: Every answer MUST cite at least one POL-NNN policy id, and
  every cited policy MUST actually support the claims in the answer.
- **FR-003**: Answers MUST be derived solely from the text of the employee
  benefits handbook; the system MUST NOT use outside knowledge or general
  assumptions to fill gaps.
- **FR-004**: When the handbook does not cover a question (fully or
  partially), the system MUST explicitly say so for the uncovered part(s)
  and MUST NOT guess.
- **FR-005**: When policies conflict or are time-dependent, the system
  MUST report all sides with their POL-NNN ids and dates/effective
  windows, and MUST NOT silently select one.
- **FR-006**: All date-dependent reasoning MUST treat the handbook edition
  date, 2025-10-01, as "today".
- **FR-007**: The tool MUST be runnable end-to-end by a single reviewer
  with minimal setup (constitution Principle V: dependency-light,
  single-file).
- **FR-008**: The system MUST support an evaluation run over all fifteen
  sample questions (Q01–Q15) that records, per question: the answer given,
  the policy id(s) cited, and a correctness/groundedness judgement.

### Key Entities *(include if feature involves data)*

- **Policy**: A single handbook entry identified by its POL-NNN id, with a
  title, body text, and any effective/announcement dates.
- **Handbook**: The authoritative collection of policies; edition dated
  2025-10-01; the sole permitted source of answers.
- **Question**: A natural-language benefits question; in evaluation,
  identified by question id (Q01–Q15).
- **Answer**: A response comprising answer text, at least one POL-NNN
  citation — or an explicit not-covered decline; may present multiple
  policy sides for conflicts.
- **Evaluation Record**: Per-question record of answer given, policies
  cited, and groundedness judgement; used to demonstrate measured
  before/after improvements including regressions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of non-decline answers cite at least one POL-NNN policy
  id, and every cited policy supports the answer text (zero unsupported
  claims across the fifteen sample questions).
- **SC-002**: Every question in the fifteen-question evaluation (Q01–Q15)
  results in either a cited answer or an explicit not-covered decline —
  zero unanswered or evasive responses.
- **SC-003**: Zero answers contain statements that cannot be traced to a
  cited policy passage, verified question-by-question in the evaluation
  record.
- **SC-004**: Questions touching conflicting policies (e.g., sabbatical
  eligibility) and time-dependent policies (e.g., the 401(k) match change)
  are answered with all sides and dates shown — verified on the relevant
  sample questions.
- **SC-005**: A reviewer with no project-specific setup beyond standard
  tooling can run the tool end-to-end and receive answers within seconds
  per question.

## Assumptions

- The handbook (a single document containing POL-NNN policy entries,
  edition dated 2025-10-01) is the complete and authoritative source;
  there are no other approved sources.
- Questions are asked one at a time by a single People Operations user;
  no concurrency, multi-tenancy, or end-user self-service is required for
  this version.
- Interaction is text-in/text-out (a question in, an answer out); the
  evaluation question set (Q01–Q15) is available to the team for
  evaluation purposes.
- Employee-facing response language is English.
- People Operations team members can verify a cited policy id against the
  handbook themselves, so citations need not include full policy text
  (though quoting supporting text is acceptable).
- Improvements to answering behavior are in scope only when demonstrated
  with measured before/after results per the constitution's Quality Gates;
  multilingual support, chat history, and integrations with HR systems are
  out of scope for v1.
