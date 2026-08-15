# Research: Chunking Mode Switch

**Feature**: 002-chunking-mode-switch | **Date**: 2026-08-15

No NEEDS CLARIFICATION items — the spec's one approximation ("~200
tokens") is resolved by decision D1 below with a documented, deterministic
heuristic.

## D1: Token approximation — 150-word sequential windows ≈ 200 tokens

- **Decision**: approximate 200 tokens as 150 whitespace-delimited words
  (the standard English heuristic: 1 token ≈ 0.75 words ⇒ 200 tokens ≈
  150 words). Windows are built by concatenating all policy bodies (id
  heading + body per policy, preamble excluded) and accumulating whole
  words until the 150-word budget is reached; the final short window is
  kept as-is. No model tokenizer call — the split is pure string math,
  reproducible run to run.
- **Rationale**: determinism outranks tokenizer fidelity for a
  comparison experiment; spec Assumptions explicitly allow an
  approximation if reproducible. Measured sanity: handbook policy text
  is ~1,400 words ⇒ expect ~10 windows.
- **Alternatives considered**: gateway tokenizer endpoint (extra API
  dependency and a network call for identical experimental value);
  character-count windows (worse correlation with tokens than words);
  windows anchored to policy starts (spec forbids — window mode is
  strictly sequential and may span policies).

## D2: Cache keying — one cache file per mode

- **Decision**: `data/embeddings-cache-policy.json` and
  `data/embeddings-cache-window.json`. Validity check per file: file
  sha256 + embed model + (window mode) window size must all match.
  Legacy `data/embeddings-cache.json` is renamed to the policy file on
  first startup if it is present and valid — a one-time migration so
  existing users keep their cache.
- **Rationale**: spec FR-004 only demands no cross-mode reuse; separate
  files additionally mean toggling modes during comparison work never
  evicts the other strategy's vectors (avoids re-embedding thrash), and
  `cache hit` stderr evidence is unambiguous per strategy. Cost: two
  constants instead of one.
- **Alternatives considered**: single file with a `mode` field (simple,
  but every toggle rebuilds — 1 batch call each time; acceptable yet
  noisier for repeated experiments); subdirectory of caches (overkill).

## D3: Chunk abstraction — unify policy and window retrieval units

- **Decision**: introduce a `Chunk` shape used by retrieval, prompting,
  and the cache: `{ key, policyIds, header, body, embedText }`. Policy
  mode: key = `POL-NNN`, policyIds = [that id], header = `POL-NNN
  Title`. Window mode: key = `W01`…`WNN`, policyIds = overlapped ids,
  header = `Excerpt from POL-001 … POL-002` (ids the model may cite),
  body = window text. Cache embeddings map is keyed by chunk key.
- **Rationale**: one retrieval path parameterized by chunk source — no
  if/else duplication in cosine ranking, prompting, or cache logic
  (Principle V simplicity). FR-003 falls out naturally: the header
  exposes valid POL-NNN ids, and downstream citation validation against
  the parsed handbook is untouched.
- **Alternatives considered**: parallel policy/window code paths
  (duplicated retrieval logic, two places to drift); window chunks
  keyed by content hash (opaque in logs; W01… is debuggable).

## D4: Retrieved-policy reporting under window mode

- **Decision**: `retrievedPolicies` in answers/eval records becomes the
  de-duplicated union of `policyIds` across the top-k chunks (window
  mode) or the top-k policy ids (policy mode). k stays 4 by default in
  both modes (spec: shared retrieval depth).
- **Rationale**: several windows may overlap one policy; dedup keeps the
  eval record and stderr evidence readable and comparable to baseline
  reports. k=4 unchanged keeps the comparison single-variable (only
  chunking differs).
- **Alternatives considered**: reporting raw chunk keys in eval records
  (not comparable with baseline POL ids); raising k for window mode
  (introduces a second variable — bad experiment design).

## D5: Default-mode invariance (FR-005/SC-005)

- **Decision**: `--chunking` is optional; absent ⇒ policy mode. The only
  observable difference for existing users is the one-time cache file
  rename (stderr notes the migration). Answering, prompts, validation,
  exit codes, and report schema (minus the new `chunkingMode: "policy"`
  field) are untouched.
- **Rationale**: spec FR-005/SC-005 require bit-for-bit behavioral
  continuity for no-parameter runs; verified by quickstart scenario 1
  (a no-flag ask must produce a policy-mode answer with cache hit).
- **Alternatives considered**: making the flag required (breaks every
  existing invocation and npm script).

## D6: Comparison workflow — manual artifact from the two JSON reports

- **Decision**: window-mode `npm run eval` writes a standard report
  (with `chunkingMode: "window"`); the comparison artifact
  `eval/comparison-<timestamp>.md` is authored from the two report JSONs
  exactly as feature 001's comparison was: per-question status/citation
  diff, explicit classification (improvement/regression/neutral), and a
  dedicated check that Q12 (POL-016 both paragraphs) and Q02/Q11
  (POL-007 + POL-015 both present) did not lose a side (SC-004).
- **Rationale**: matches the established Quality Gates workflow and
  keeps `assistant.ts` free of a bespoke compare command the spec does
  not ask for; JSON reports make the diff mechanical.
- **Alternatives considered**: built-in `compare` subcommand (scope
  creep beyond FR-007); CSV export (nothing the current JSON lacks).
