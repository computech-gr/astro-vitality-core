# FV-01.4.1B — Real-browser acceptance record

Status: NOT VERIFIED. Phase B production fixture creation is NOT APPROVED.

## Preconditions

- Use the published production origin and two genuinely separate browser profiles, not two private windows sharing a session.
- TEST A: `security@computech.gr`; TEST B: `support@computech.gr`.
- Both accounts are confirmed and have zero memberships according to read-only preflight evidence dated 2026-10-13.
- Do not use the real Mission Operator account during these checks.
- Do not create missions, issue invitations, assign roles, activate bootstrap, or change any production records.
- Do not copy passwords, cookies, authorization headers, access tokens, real health data, or personal identifiers into evidence.

## Browser checks — owner performs each in a real session

| ID  | Actor  | Action                                               | Expected                                                             | Status       |
| --- | ------ | ---------------------------------------------------- | -------------------------------------------------------------------- | ------------ |
| A1  | TEST A | Sign in on `/mission/identity`                       | Own email, zero active memberships                                   | NOT VERIFIED |
| A2  | TEST B | Sign in on `/mission/identity` in a separate profile | Own email, zero active memberships                                   | NOT VERIFIED |
| A3  | Both   | Keep both sessions open; refresh both pages          | Each retains only its own identity                                   | NOT VERIFIED |
| A4  | TEST A | Open Mission & Crew Operations                       | Operator membership required; no create/invite controls              | NOT VERIFIED |
| A5  | TEST B | Open Mission & Crew Operations                       | Operator membership required; no create/invite controls              | NOT VERIFIED |
| A6  | Both   | Inspect Mission Identity                             | First-operator activation form absent                                | NOT VERIFIED |
| A7  | Both   | Sign out independently                               | Session returns to signed-out state; other profile remains signed in | NOT VERIFIED |

Record screenshot filename, date, browser profile label, observed result, and PASS/FAIL for each row. Redact any sensitive content before sharing. Do not mark PASS solely because a database row is absent.

## Authorization boundary — separate from UI checks

UI hiding and zero memberships do not prove Row Level Security enforcement. If the application already exposes a documented, read-only, non-sensitive mission-scoped request through the normal signed-in user interface, observe its denial under each test account and record only sanitized HTTP status/error category. Do not guess endpoints, inject tokens, probe unrelated tables, or access real health records. If no safe request is available, mark direct per-user RLS denial NOT VERIFIED and defer it to an explicitly approved, controlled test plan.

## Stop and escalation

If either account can view the real mission, access create/invite controls, see the other account's identity, or trigger bootstrap, stop immediately. Do not try further writes. Preserve sanitized evidence and report the issue.

## Acceptance gates

- Phase A browser acceptance requires all A1–A7 observed and recorded PASS in actual independent sessions.
- Direct per-user backend authorization is a distinct gate; never infer PASS from UI or privileged read-only database queries.
- Phase B remains NOT APPROVED until the owner explicitly authorizes persistent synthetic missions and acknowledges append-only audit traces.
- FV-01-13 (`sandbox_exec`) remains OPEN; final FV-01 security approval remains BLOCKED.
