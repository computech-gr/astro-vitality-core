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

## P41.1 Literature relevance and evidence safety

Observed failure: the G-CSF search pre-selected the first six references with abstracts, including unrelated NASA reports (atmospheric moisture via "clear sky fluxes (CSF)", cosmic-ray electrons, an intracranial-pressure model mentioning cerebrospinal "CSF") and PubMed articles that mention G-CSF only as one embryo-transfer add-on or in passing. The embryo-transfer article was also keyword-tagged "spaceflight/analog" because of clinical bed rest.

- Three separate questions are shown per reference: bibliographic existence (provider), scientific relevance (`src/domain/health-intelligence/literature-relevance.ts`) and claim-level support (excerpt check plus Researcher review).
- Relevance is deterministic: exact label/alias or a long form defined in the text itself (abbreviations case-sensitive, partial tokens such as "CSF" never count), whether the biomarker is measured (specimen/level/assay or analyte-list change wording) or administered as an intervention, population (human / animal / in vitro / unstated), specimen and assay terms. The spaceflight keyword is reported only and never establishes relevance; clinical "bed rest" no longer sets the spaceflight tag (head-down bed rest still does).
- Classes: Relevant (measured in humans), Potentially relevant — manual review required (animal, in vitro, population unstated, or the biomarker as a therapy), Irrelevant (not named, partial abbreviation only, passing or intervention-only mention in a study about another topic), Insufficient information (metadata only or existence unconfirmed). Each has a short reason quoting the source sentence.
- Nothing is pre-selected. Relevant and Potentially relevant references can be ticked; Irrelevant and Insufficient information ones cannot.
- The server re-assesses the re-retrieved provider text: `researcher_explicit` drafts may use Relevant and Potentially relevant references, `automatic_batch` (Process next 5 / 25) only Relevant ones. Excluded references and reasons are stored with the draft. With no usable reference the result is "Insufficient relevant scientific evidence" and the AI is not called. A verbatim excerpt from an excluded reference leaves its claim unresolved, and the editor conversion re-applies the gate to stored bundles.
- Unchanged: excerpt validation, prohibited-language rejection, citation identifier verification, evidence strength "not assessed", Researcher-only approval and server attestation.
- Tests: `tests/domain/p41-1-literature-relevance.test.ts` with the actual observed records in `tests/fixtures/p41-1-gcsf-observed-references.v1.json`.
- Limitations: rule-based relevance reads titles and abstracts only, in English; it can misjudge unusual wording and is a triage aid, not a scientific appraisal. Labels without aliases match only their exact wording (e.g. "25(OH) Vitamin D" does not match "25-hydroxyvitamin D" unless that alias is supplied or defined in the text).
