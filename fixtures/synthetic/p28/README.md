# P28 synthetic domain fixtures — SYNTHETIC TEST DATA ONLY

Separate CSV files for manual import testing of the Immune, Cardiovascular and
Behavioral health modules. Every row is synthetic and labelled as such; none is
a real astronaut measurement. These files are never auto-imported, seeded or
served by the app — a reviewer must select one with the module's file picker,
choose the "synthetic" provenance and verify each row.

- Variable IDs come from the current project catalogs (`IMM-*`, `BSC-*` from the
  proposed domain catalog; `cv-*` from the cardiovascular handbook catalog).
- Cardiovascular units match the handbook catalog unit for each ID.
- The IMM/BSC catalogs do not define units. The units used here are reported
  test values only (matching the existing module CSV examples where present);
  they are not catalog units, reference ranges or approvals.
