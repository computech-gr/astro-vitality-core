# P34 — Real-device end-to-end acceptance

## Scope and honest status

P34 adds a human-operated test execution workspace to `/mission/validation`. **No real-device execution is asserted by this patch.** The canonical ledger starts with 15 `not_executed` cases and no approval. The interface collects **session-only**, unverified notes; export is a local JSON download, never a server write or formal signoff. Browser reload discards notes. No migration or new dependencies.

## Execution procedure

Use physical Android/iOS devices and an authorized desktop/browser as appropriate, separately authenticated Crew Self, Operator, Ground Medical and Researcher test accounts, a synthetic/test mission, and a second mission to test isolation. Do not use real patient data. Follow each scenario's steps; record device/browser version, expected and observed result, time and redacted screenshot/hash reference in notes. For observed pass, provide at least 20 characters of notes. A manual status is **self-reported, not verified**. Preserve actual evidence separately under a controlled review process; the app intentionally does not upload screenshots or signatures.

## Required adversarial checks

Check researcher's **direct table SELECT and ground snapshot RPC** access in addition to the P28 export RPC: export suppression alone does not prove all access paths are safe. Test auth expiry during foreground retry, duplicate uploads, simultaneous tabs, conflict quarantine and offline records across refresh. Verify no simulated crew records enter real mission data. Check camera permission denial, actual capture, no fabricated metrics, accessibility and SEO noindex. Confirm P25 does not infer inverse unmeasured changes or claim validated clinical reasoning. Confirm all eight P32 independent science gates remain pending.

## Acceptance policy

No pass/fail in this UI is formal acceptance. Formal signoff requires a separate, independently reviewed artifact with test operator identity, actual hardware evidence, reproducible traces, findings and remediation verification. Clinical approval remains disabled. Any failure or untested critical path blocks readiness. No scientific or clinical validation is implied by build/test success.

## Verification

`node scripts/verify-p34-real-device-acceptance.mjs`; `bun test tests/validation/p34-real-device-acceptance.test.ts`; `node scripts/verify-p18.mjs`; `node scripts/verify-p32-independent-review.mjs`; `node scripts/verify-foundation.mjs`; `bun run typecheck`; `bun run build`.
