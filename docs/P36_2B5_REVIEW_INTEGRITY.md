# P36.2B5 — Cross-mission / independent reviewer integrity (STAGED)

Replaces the **unapplied** P36.2B4 pending SQL in place. No Cloud migration, no publication, no import/approval RPC, no client writes. Synthetic only.

## Guardrails
- Submitter membership must be active `crew_self`, with the exact batch mission and crew member.
- Reviewer membership, when present, must be active `ground_medical` in the exact batch mission, with a **different `user_id`**, not merely a different membership UUID.
- Existing review batches cannot be made inconsistent by updating membership role, active state, mission, crew, or user. Referenced membership deletes are already restricted by foreign keys.
- Existing deny-all forced RLS and no browser grants remain in place. No approved observations are promoted or published.

## Acceptance in disposable PostgreSQL only
Run all prior migrations, then the staged pending SQL, verify trigger behavior with synthetic identities: correct submitter accepted; cross-mission, cross-crew, inactive, wrong-role submitter rejected; same-user reviewer (two memberships), cross-mission, inactive, wrong-role reviewer rejected; valid independent reviewer accepted; post-insert membership invalidation rejected; anon/authenticated denied; duplicate/replay and synthetic-only checks. Run existing DB suite and full `bun run check`.

## Outstanding
The pending SQL has **not** been deployed. Database triggers are defense in depth, not a server-side approval workflow. Role semantics and future reviewer eligibility need independent security/scientific approval. `approved` remains a schema placeholder, not a validated approval. No production change without owner approval and a separate safe database deployment plan.

Use existing `MISSION_TEST` and its **actual current crew membership** for the later demo; do not create new mission/crew or guess UUIDs. Never use real medical records. FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED.
