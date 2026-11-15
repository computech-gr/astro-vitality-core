# P72.8 — Restore Direct Researcher Scientific Approval (Preview only)

## 1. Root cause

- The message "exactly one independently provisioned source-validation receipt is required" comes only from
  the production lifecycle `p37_catalog_approve_v1` (pending `20261108000000_p37_catalog_activation.sql`,
  installed as migration 0023, first written 2026-11-07). It was an intended owner rule for the production
  catalog, not a later regression.
- The synthetic demo path (P37 demo 0025, P38 bulk 0026, P61.5 Researcher scope 0027) never required a
  receipt. Live evidence: 207 of 243 terms carry DEMO_DECIDE + DEMO_ACTIVATE events while
  `p36_dynamic_source_validation` holds 0 receipts.
- Demo Account changes (P69–P71, migration 0028) and P72.6 (0029) do not touch any approval function.
- What broke the experience was the page: the Researcher has two missions (FV01-TEST-B membership with no
  submissions, MITO_DEMO_2026 via global review), so the catalog panel stayed on "Choose a mission" and the
  direct demo approval section was hidden; P72.7 preselected only the review panel above. Each request in the
  new request table led to the term list and the receipt-bound production "Scientific Approve" workspace.
  The newest request ubr-6a205852 also needed a separate scope step before a decision.

## 2. Restored (no database change)

- Catalog panel opens the only mission with submissions (shared `defaultMissionSelection`).
- Each submitted request has "Demo approve / reject", which opens the Researcher section filtered to that
  request (new "Submitted request" filter).
- "Demo Scientific Approve Selected": DEMO SCIENTIFIC APPROVAL — NOT CLINICALLY VALIDATED; adds accepted
  synthetic terms to the demo scope when needed (existing P61.5 authorization) and records the existing P37
  demo decision. No receipt. Ground Medical activates separately; the decider can never activate.
- Production approval keeps its receipt rule and now carries a note pointing to the demo approval.

## 3. Pending database change (not applied; needs owner approval)

- `supabase/pending/20261115020000_p728_demo_scientific_decision.sql` (+ `.rollback.sql`) and
  `20261115020001_p728_demo_mission.authorize.sql` (classifies MITO_DEMO_2026 only).
- Adds append-only decision records (actor, role, time, decision, rationale, evidence references, original
  submission/term, link to the demo event), Researcher REJECT, Ground Medical ACTIVATE/DECLINE with
  rationale, owner-only mission classification, and a guard that refuses demo decisions in mixed-provenance
  missions, blocks rejected/declined terms, and (in classified missions) blocks the old demo writes so a
  rationale is always recorded. No production approval, receipt, observation, term or triage is written.
- Production impact: the Preview and published app share one backend, so applying it changes both. After it
  is applied the single-term P37 demo panel cannot write in MITO_DEMO_2026; decisions go through the
  P72.8 actions. Rollback is refused once any record exists.

## 4. Verification

- Disposable PostgreSQL (socket-only): `scripts/verify-p728-demo-scientific-decision-pg.ts` 125 assertions —
  Ground Medical submission → Researcher approval without receipt → Medical activation by a separate actor;
  production approval still refused without a receipt; unauthorized users, the submitter, untriaged and
  ambiguous-unit terms refused; Researcher cannot activate; decider cannot activate/decline; mixed and
  unclassified missions refused; ACLs, RLS, immutability, idempotency and rollback refusal.
  Existing verifiers still pass: P37 84, P37 demo 126, P38 103, P61.5 157, P72.6 90.
- Preview as the Researcher: demo mission preselected; ubr-6a205852 opened with its 7 terms; approve dialog
  shows the label, suggested evidence references and the acknowledgement; cancelled, nothing recorded.
  Ground Medical screen shows Activate and the (pending) Decline action.
- Data unchanged: 265 examinations, 264 reviews, 0 corrections, 14 memberships, 6 requests / 243 terms,
  243 triage, 414 demo events, 213 scope, 16 grants, 0 production entries, 0 receipts, 429 audit events;
  examination fingerprint 57e0ed2b…, demo ledger fingerprint c9acce95…
