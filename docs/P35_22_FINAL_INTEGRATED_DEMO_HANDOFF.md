# P35.22 — Final integrated demo handoff (governed)

This is a consolidated **synthetic demonstration handoff**, not a claim that all production, clinical, or security work is complete.

## Included

- Nine visible readiness gates covering isolated mission, mission selection, Administrator, canonical pipeline, Ground Medical, science, devices and NASA acceptance.
- Dynamic read-only membership evidence for `MITO_DEMO_2026` from the current signed-in identity. Membership does **not** prove full authorization or mission isolation.
- Local JSON handoff export with explicit negative authorization/clinical claims.
- Six regression tests. No migrations, secrets, elevated permissions, Cloud writes or publishing.

## Owner-run activation (separate from applying patch)

1. After verifying existing P35.21 form, owner explicitly creates `MITO_DEMO_2026` using the typed phrase. Backend may reject the request. Do not automate this action.
2. Confirm new mission appears in authorized mission membership and can be selected. Verify MISSION_TEST was not changed.
3. Administrator role is **not implemented** by this patch. Design and review server-side privileges, RLS and independent Ground Medical separation before approval.
4. In isolated synthetic mission, run PDF/CSV review, device simulator, canonical mapping, longitudinal dashboard and report end-to-end with separate authorized actors. Record actual server receipts; never replace these with offline exports.
5. Independently accept Ground Medical workflow, science reviews and open security/real-device gates; publish only after owner authorization.

## Non-negotiable limitations

No new backend Administrator role, no automatic mission creation, no fabricated independent scientific sign-off, no real-device validation, no claim of clinical decision support. `FV-01.13`, P32/P34 and scientific review remain open until evidenced. The remaining tasks cannot safely be closed by applying a source-code ZIP alone.
