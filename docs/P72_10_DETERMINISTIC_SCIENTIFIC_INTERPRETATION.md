# P72.10 — Deterministic scientific interpretation and cross-device report parity (Preview only)

## Root cause

After P72.9, examinations and medical reviews came from the server, but two inputs of the report still came from the exporting device:

- **Interpretation reviews (P40/P41):** events in this device's encrypted review ledger. The server only signs (attests) an approval and keeps no copy.
- **Reference-criteria decisions (P57):** same design. These are device-only events with a server signature and no server copy.

The Researcher's Scientific Review page opens interpretation review tasks automatically, so fresh browsers held between 0 and 27 local events. Those events changed the "Scientific rules applied" line and the appendix line "Interpretation source … plus N device-local review event(s); snapshot SHA-256 …". An attested approval or an approved criterion on one device would also have changed findings and colouring there.

## Scientific-input inventory

| Input                                                                                                                                                                                                                                                                                         | Source                                             | Can change findings?                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Examinations, medical reviews                                                                                                                                                                                                                                                                 | Server (P72.9 snapshot) or explicit local offline  | Yes                                                                         |
| Interpretation registry, verified reference intervals, P57 criteria registry, P56 pattern library and review-priority rules, P57.1 warning rules, P58 concern library, P59 provisional criteria, mappings and relationship model, P60 pattern library, cross-domain context, attestation keys | Bundled with the app, so identical on every device | Yes                                                                         |
| Interpretation review events (tasks, drafts, approvals, revocations)                                                                                                                                                                                                                          | Device only                                        | Approvals and revocations: yes. Tasks and drafts: no (text and digest only) |
| Reference-criteria decisions                                                                                                                                                                                                                                                                  | Device only                                        | Approved criteria: yes                                                      |
| Period, sources, synthetic literature demonstration                                                                                                                                                                                                                                           | Page choices                                       | Yes                                                                         |
| AI wording (P54, P58)                                                                                                                                                                                                                                                                         | Server, Ground Medical role, default-off flags     | Informational only; never changes a class or priority                       |
| Export time                                                                                                                                                                                                                                                                                   | Clock                                              | No                                                                          |

Interpretations bound to a synthetic demo apply only to their own mission (exact catalog ID, unit and domain). Criteria apply only to the missions their approval covers.

## Behaviour

- **Server-confirmed reports** use only the shared versioned rules. Device decisions are never applied.
  - If the device holds approvals or approved criteria, the report states they were NOT APPLIED.
  - Tasks and drafts are not mentioned, because they never change content.
- **Local offline reports** (explicit choice only) apply this device's verified decisions, labelled `DEVICE-LOCAL SCIENTIFIC DECISIONS — NOT SERVER VERIFIED`.
  - The report waits while those decisions load.
  - It is blocked with a "Reload" message if they cannot be read or fail their integrity check.
- **One frozen scientific snapshot** is bound to the dataset snapshot and used by the screen and every export. Each export re-derives it and is cancelled on any difference.
- **Provenance** prints separate fingerprints for clinical observations and for scientific interpretation inputs, plus the list of 14 rule sets (version, status, SHA-256) and whether AI wording is present.
- **Role-specific AI wording is kept.** Only Ground Medical requests the AI step. In this deployment the server replies "switched off", which is true for that role and configuration.

## Not changed

Examination records, medical reviews, scientific decisions, approved criteria, catalogs, memberships, audit history, permissions and database schema are unchanged. No migration. Not published.

## Remaining limitation

A device-local interpretation approval or approved criterion is not shared across devices. Two ways to share them:

- Merge the existing approval package into the bundled registry.
- Add a new server ledger, which needs an approved database migration.
