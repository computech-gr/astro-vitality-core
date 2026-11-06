# P36 dynamic workflow — authoritative migration sequence

This document supersedes the migration order in `docs/P36_FINAL_UX_ACTIVATION_CHECKLIST.md` and
`docs/P36_PRODUCTION_ACTIVATION_CHECKLIST.md`. Those files are kept as history. Nothing here has been
applied to production; every production step still needs explicit owner authorization.

## How the order was worked out (from the SQL itself)

| File                                              | Depends on                                                                                           | Creates                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261107000000_p36_dynamic_handoff.sql`          | existing `auth.uid()`, `missions`, `crew_members`, `mission_memberships`, `mission_crew_assignments` | `p36_dynamic_admission` (closed by default), `p36_dynamic_handoff_submissions`, `p36_dynamic_handoff_terms`, `p36_dynamic_scope`, append/list RPCs |
| `20261107010000_p36_dynamic_authorization.sql`    | the handoff file (`p36_dynamic_scope`, `p36_dynamic_handoff_*`, `p36_dynamic_admission`)             | `p36_dynamic_source_validation`, `p36_dynamic_authorization_events`, auth append/list RPCs                                                         |
| `20261104000000_p36_scientific_authorization.sql` | none of the above                                                                                    | separate fixed-12-dossier ledger                                                                                                                   |

The fixed-dossier file is **not** a prerequisite of either dynamic file (no reference to any of its
objects). Requiring it first, as the final UX checklist did, was wrong. It is a separate, optional
feature that needs its own decision.

## The single sequence

Forward (once, in this order, each file atomically, bytes must match the hashes):

1. `supabase/pending/20261107000000_p36_dynamic_handoff.sql` — SHA-256 `c36ed38b8836f5c8cb0a906735e1ec6a8748145df393ab7029312434275ff83d`
2. `supabase/pending/20261107010000_p36_dynamic_authorization.sql` — SHA-256 `47c3498fad113acec0c9776636ae1378adbcdcf5b719cfc7c4e4d98124d33b06`

After both files are applied, admission stays **closed**: no writes are accepted even with application
flags on. Opening admission is a separate trusted-SQL step
(`update public.p36_dynamic_admission set handoff_open = true, change_note = '…'`, later
`authorization_open = true`) and needs its own authorization.

Rollback (only when the feature tables are verified empty, in reverse order):

1. `20261107010000_p36_dynamic_authorization.rollback.sql` — `4af6a908698a20ec792c56214fa09cf6001b1ea7b556650b35104f5ca98c5704`
2. `20261107000000_p36_dynamic_handoff.rollback.sql` — `985188b27aa0d7747848cdb2907a37961a52e44d59b3b5ff89385340bd2bdd4a`

Both rollbacks refuse when any record exists. The handoff rollback also refuses while the
authorization objects are still installed, so it cannot be run out of order. If records exist,
**close admission instead** (retaining disable). Records stay intact and remain readable.

Never apply:

- the whole `supabase/pending/` directory;
- pending files that are byte-identical to committed Drizzle migrations (a second copy);
- legacy/standalone/split v3 alternatives as if they were cumulative;
- `20261104000000_p36_scientific_authorization.sql` just to satisfy the older checklist.

## Changes since the previous NO-GO hashes

- Closed-by-default admission switch (`p36_dynamic_admission`) checked by both append RPCs. Granting EXECUTE no longer admits writes on its own.
- Append RPCs take `FOR SHARE` locks on the authorizing membership and crew assignment, so a concurrent revocation is serialized and honored.
- An approval must cite the source receipt's own `validation_reference` in `validationEvidenceRefs`.
- The handoff rollback has an ordering guard and drops the admission table.
