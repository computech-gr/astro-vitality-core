# P23F — Browser evidence and read-only sync review

## Scope

- Adds a read-only needs_review list on Offline Mission Mode with record identifiers and rejection reasons. Does not display decrypted health payloads or allow reset/reassignment.
- Adds an explicit, user-triggered read-only comparison of up to 300 local `synced` event IDs against up to 300 cloud `mission_events` IDs visible through existing RLS.
- Uses the existing `loadRecordedMissionData` and store interfaces; no migration, dependencies, navigation change, or medical rules.
- Replaces hardcoded amber review panel border with theme border tokens.

## Limitations

- A browser comparison is **not** an end-to-end sensor or airplane-mode test.
- Cloud results may be incomplete due to limits or permissions; zero matches do not prove no records exist.
- Old placeholder records and old bone metric indexes are intentionally untouched.
- Human review remediation, authenticated device-to-cloud verification, and full production testing remain open.

## Acceptance

1. Signed-out state cannot trigger cloud evidence check.
2. Signed-in authorized account can explicitly run read-only comparison.
3. Rejected records remain encrypted and unmodified; no reset/retry action exists.
4. Run targeted typecheck and P23F verifier; manually test browser with authorized test account.
