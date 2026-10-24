# Medical v3 — final synthetic demonstration and exact-commit CI

## Boundary

This handoff adds a read-only GitHub Actions status reporter. It DOES NOT grant production authorization, modify evidence, provision staging, apply migrations, or mark missing checks as passed.

## Run a truthful synthetic example

1. In the existing project, run `bun test tests/domain/synthetic-export-qa.test.ts tests/domain/medical-advisor-review.test.ts tests/domain/medical-v3-completion-fixture.test.ts` and retain the actual output.
2. Use the existing synthetic demonstration mission and synthetic crew. Confirm that the authorized reviewer sees only permitted evidence. No real astronaut records.
3. Demonstrate the evidence-based question: `What changes are observable in the two synthetic heart-rate observations? Cite the exact observation IDs and do not infer diagnosis or normal ranges.` Only show an AI answer if the existing isolated or authorized synthetic-only path actually generates one and the contract validator accepts all citations.
4. Demonstrate reviewer edit and rationale, stale-evidence invalidation, and authorized history JSON export if the active environment supports them. Otherwise show unit/integration evidence, explicitly labeled NOT BROWSER ACCEPTED.
5. Test 1280px and 390px browser widths ONLY on a verified independent Auth/Data API/database stack. Never use shared production backend as a staging substitute.
6. Confirm GitHub Quality, Security Scan and Medical v3 Release Gate conclusions on the exact same final SHA; a failed or missing gate must remain visible.

## Outstanding owner evidence

P3663: actual private isolated restore exercise and verifiable operator evidence.
P3664: genuine explicit owner risk decision; DO NOT accept potentially irrecoverable data loss on the owner's behalf.
P20-RULES-001: official 2026 submission source and actual rules recheck.
Independent staging: separate Auth issuer, Data API, database, origin and bounded test-only AI credential.

Do not weaken or skip private evidence verifiers. Separate synthetic research demonstration readiness from production clinical or release readiness.
