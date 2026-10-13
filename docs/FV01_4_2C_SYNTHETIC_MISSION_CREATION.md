# FV-01.4.2C — Authorized Synthetic Mission Creation

Status: **OWNER APPROVED FOR TWO MANUAL MISSION CREATIONS ONLY**. This approval does not authorize any other mutation.

## Approval and prerequisites

The owner confirmed in their own signed-in browser that the temporary RLS diagnostic is absent from production and that the existing authorized Mission Operator can access Mission & Crew Operations. The owner explicitly approved creating only two synthetic planning missions, understanding that mission and audit records persist. Previous FV-01.4.2A preflight reported both mission codes available; re-check through normal UI before each creation.

Canonical application: `https://mitochondria.edocinfo.com`.

## Exact authorized operations

The **existing authorized Mission Operator**, using their **own normal signed-in browser session**, may navigate to Mission & Crew Operations and use **Create planning mission** exactly twice:

| Mission code  | Mission name           | Dates | Scope                           |
| ------------- | ---------------------- | ----- | ------------------------------- |
| `FV01-TEST-A` | `FV01 Security Test A` | None  | Synthetic planning mission only |
| `FV01-TEST-B` | `FV01 Security Test B` | None  | Synthetic planning mission only |

Before submitting, verify the code and name and that the operation targets a new synthetic mission. After each submission, confirm the resulting code and operator's newly created mission membership through the ordinary UI. Stop if the code already exists, the response is ambiguous, the app reports an error, or any unexpected mission is shown. Do not retry an ambiguous create without first verifying whether it succeeded.

## Explicitly prohibited in this stage

- No crew member creation, invitation generation or acceptance, additional membership assignments, mission events, deactivation, mission closure or cleanup.
- No direct SQL writes, Supabase dashboard edits, service-role access, impersonation, backend scripts or automated calls to production mutation RPCs.
- No modifications to the pre-existing real mission or its crew, permissions or data.
- No changes to RLS, migrations, secrets, production code or deployments.
- Do not print private mission identifiers, tokens, invitation codes or user personal data in evidence.

## Evidence and stopping conditions

Capture redacted screenshots showing each synthetic mission code and planning status in the operator's normal workspace. Record the result for each as CREATED / ALREADY EXISTS / FAILED / UNKNOWN, and whether the operator can see both. Document that creation automatically makes the creator an operator of each new mission and leaves permanent audit evidence. If either create is uncertain or fails, STOP and report without continuing to the next stage.

## Security boundaries

FV-01-13 (`sandbox_exec`) remains **OPEN**. Final security approval remains **BLOCKED**. R4 remains **INCONCLUSIVE** until authorized event-level isolation tests. FV-01.4.2D (crew and invitations) remains **NOT APPROVED** and requires separate explicit owner authorization.

## Execution and reporting

Applying this patch only adds this documentation. It does **not** create missions. Lovable should verify patch compatibility, run formatting checks, then instruct the owner to perform the two approved creations in the existing operator browser session. Report any deviations; do not silently expand authorization.
