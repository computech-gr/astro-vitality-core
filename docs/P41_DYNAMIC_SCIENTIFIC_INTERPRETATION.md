# P41 — Dynamic scientific interpretation (research prototype)

Extends the P40 interpretation registry; no competing source of truth, no database change.

## Governance
- A device-recorded APPROVE or REVOKE applies (and can be merged into the shared registry) only when the server has re-checked it and signed an ATTEST statement: exact event hash, record key, content fingerprint, acknowledgement and the signed-in caller, after reading an active `researcher` mission membership as that caller (RLS, no service role).
- Trusted public key: `data/scientific/interpretation-attestation-keys.v1.json` (derived from the existing secret with the P41 domain-separation label). Unattested decisions show "Awaiting server attestation" and reports keep the previous status.
- Draft rejection is recorded with a reason; nothing is removed.

## Evidence
- Providers: NCBI PubMed E-utilities (abstracts only), NASA NTRS public API (PUBLIC distribution only), Crossref (DOI metadata only). Timeouts, two retries with backoff, NCBI pacing, per-caller hourly limits, 6-hour cache.
- Queries contain only the biomarker name and aliases; values, dates, emails and identifiers are refused before any request.
- Every reference records provider, identifiers, retrieval time, provider version and what was inspected (metadata only / abstract). Full text is never claimed.
- AI drafts (Lovable AI, strict JSON schema) see only server-retrieved text. A claim is kept as "excerpt found" only when each cited excerpt occurs verbatim in that text; otherwise it is "unresolved". Threshold, cut-off, deficiency, diagnostic, causal, recommendation and improvement/deterioration wording is rejected. Spaceflight-specific claims need a spaceflight/analog source. Evidence strength stays "not assessed" until the Researcher appraises it.
- Kill switches: `P41_LITERATURE_DISABLED=true`, `P41_INTERPRETATION_AI_DISABLED=true`.

## Backlog and unknown biomarkers
- Preflight clusters the 416 records (catalog ID, proposed links, same name within a domain) and lists conflicts and manual decisions.
- Batch processing is resumable and idempotent, retries failures up to three times and prepares drafts only.
- Submitted unknown terms are matched by exact normalized label + exact unit; unmatched terms become one shared research candidate per label + unit. After Ground Medical activation the candidate links to the activated identity by term ID; evidence is attached only by a Researcher action.

## Examination comparison
- Per series (metric + exact unit): consecutive and baseline-to-latest absolute and percentage change at recorded precision; zero/negative earlier values have no percentage; repeated readings are listed (differing repeats not compared); date-only vs timed same-day readings are not ordered. Specimen, method and protocol are not recorded, so comparability is stated as unverified. Display is neutral; no validated alert rule exists.

## Tests
`tests/domain/p41-interpretation-research.test.ts` (mocked providers, offline): privacy, parsing, retrieval failure, AI validation, attestation refusal paths, longitudinal cases, candidates, preflight, backlog, synthetic end-to-end with offline rebuild.
