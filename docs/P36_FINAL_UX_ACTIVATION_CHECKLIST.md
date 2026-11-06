# P36 Production Activation Checklist (owner-gated)

> **Superseded:** the migration order and hashes below are replaced by
> `docs/P36_AUTHORITATIVE_MIGRATION_SEQUENCE.md`. The fixed-dossier file is not a prerequisite of
> the dynamic pair, and the dynamic harness uses `P36_DISPOSABLE_SOCKET`. This text is kept unchanged as history.

Nothing in this checklist has been performed. Each step requires explicit owner authorization.

1. **Verify the staged SQL bytes** against the exact hashes in `docs/P36_FINAL_UX_VALIDATION_REPORT.md` before any application.
2. **Disposable rehearsal**: apply `20261104000000_p36_scientific_authorization.sql`, `20261107000000_p36_dynamic_handoff.sql`, `20261107010000_p36_dynamic_authorization.sql` to a throwaway database; run the SQL negative harnesses (`FV01_PG_SOCKET_DIR`); rehearse each `.rollback.sql` and confirm it is non-destructive when rows exist.
3. **Two-account authenticated acceptance** on an isolated non-production backend: Ground Medical preview/consent/submit; Researcher sees submitted terms only; cross-device visibility; rejected permissions; retry/conflict; scope isolation; both the 12-term and the additional-term workflows.
4. **Production migration**: apply the three staged migrations in order, only after steps 1–3 pass.
5. **Enable write flags** (`P36_DYNAMIC_HANDOFF_ENABLED` and the authorization flag) only after step 4, per the existing owner-managed activation procedure.
6. **Verified revisions**: add a revision to `data/scientific/p36-verified-revisions.v1.json` only with independently reviewable CI evidence for that exact commit, through governed code review. Until then, governed promotion preparation remains unavailable by design.
7. **Local records**: uploading the device's encrypted 197-term request remains a separate, explicit, per-scope user action in the app; it is never performed by deployment.
8. **Catalog activation**: remains a separate governed patch after independent Researcher decisions; this delivery activates nothing.
