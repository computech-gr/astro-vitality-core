# FV-01.4.1D — Screenshot evidence register

Date: 2026-10-13. Evidence supplied by project owner in conversation. Screenshots are not included in the patch to avoid unnecessary identity-image redistribution.

## Verified from supplied screenshots

| Case | Account                          | Observation                                                                        | Evidence                                      | Status                 |
| ---- | -------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------- |
| A1   | TEST A (`security@computech.gr`) | Authenticated; own email shown; active memberships 0; no active mission membership | Owner screenshot `image(20261013-171919).png` | PASS — screenshot      |
| A2   | TEST B (`support@computech.gr`)  | Authenticated; own email shown; active memberships 0; no active mission membership | Owner screenshot `image(20261013-171826).png` | PASS — screenshot      |
| A6   | Both                             | First-operator activation form absent in both captured Mission Identity views      | Both owner screenshots above                  | PASS — screenshot only |

## Not yet established

| Case | Missing evidence                                                                                       | Status       |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------ |
| A3   | Two independent browser profiles simultaneously authenticated, refreshed without identity crossover    | NOT VERIFIED |
| A4   | TEST A sees operator-membership restriction and no create/invite controls in Mission & Crew Operations | NOT VERIFIED |
| A5   | TEST B sees operator-membership restriction and no create/invite controls in Mission & Crew Operations | NOT VERIFIED |
| A7   | Signing out A does not sign out B; each signs out independently                                        | NOT VERIFIED |
| RLS  | Direct per-user backend denial on a documented safe read-only operation                                | NOT VERIFIED |

## Evidence limitations and gates

Screenshots prove only visible state at capture time. They do not establish simultaneous independent sessions, backend RLS enforcement, or production deployment history. Do not upgrade A3–A5, A7, or RLS based solely on these images. No synthetic mission creation is authorized. Phase B: NOT APPROVED. FV-01-13: OPEN. Final FV-01 security approval: BLOCKED.
