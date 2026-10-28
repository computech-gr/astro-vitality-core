# P36.2 Automatic shared collection timestamp

Apply both source files over the current project. A uniquely labelled UTC collection date and time in the original extracted document pre-fills only new AI suggestions explicitly tagged `dateKind=collection`. Rows remain unchecked, editable and unsaved. No inference from report issue date, local clock, ambiguous or missing timestamps. The timestamp represents specimen collection and must be confirmed as applicable by the reviewer. Shared across four domains via `processBoneFileWithAi`.

Acceptance: real Challenge 02 PDF should show five AI suggestions with 2026-10-14T07:35:00Z, unchecked. Test invalid/ambiguous dates, other modules, edit/save, and no regression. Do not change authorization, migrations, RLS or publishing.
