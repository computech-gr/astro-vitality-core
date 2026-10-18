# P35.21 — Governed synthetic demo mission activation

## Scope

Adds a real, explicit, owner-triggered mission creation action to the signed-in Mission Demo Launchpad. It uses the existing `createMissionOperation` adapter and the server-enforced `create_mission_operation` RPC; the server validates an active Mission Operator membership, creates a new planning mission, grants only its creator a Mission Operator membership, and writes an audit event. No new migrations.

## Execution safety

Applying the patch does **not** create a mission. The owner must type `CREATE MITO_DEMO_2026`, check an explicit Cloud-write confirmation and click Create. The backend can still deny creation. Target mission code is `MITO_DEMO_2026`; MISSION_TEST is never modified. Do not click during routine browser regression testing without owner approval.

## Open gates — not claimed complete

- Administrator is not an existing membership role and is **not granted** by this patch. Design and review server-side scoped administrator permissions independently.
- Crew Self and Ground Medical remain independently authorized; no impersonation or auto-grant.
- Canonical PDF/device ingestion and clinical/security/scientific acceptance require separate integrated evidence.
- A newly created mission contains no health records or crew; its creation alone is not end-to-end acceptance.
- Production publishing remains owner controlled.

## Acceptance

Run focused test `bun test tests/mission/p3521-governed-demo-mission-activation.test.ts` and one `bun run check`. Browser verify the activation form remains disabled until typed confirmation, and **do not click the creation button** unless the owner explicitly approves the Cloud write. Signed-out users cannot access the Launchpad. Report all blockers without asserting demo completion.
