# P36.3 — Synthetic Biomarker Local Research Preview

## Scope

The existing `/mission/documents` workflow now renders a read-only, in-memory preview of selected synthetic biomarker measurements. The original local extraction, exact registry-name and unit matching, Crew Self mission gating, manual selection, observation date, confirmation, duplicate-ID check and local JSON export are retained.

The preview uses the same `canExport` gate as the existing synthetic handoff. It displays mission and crew IDs from the signed-in active membership, observation date, metric ID/name, exact measured string and unit, and source excerpt. It does not persist to browser storage or Supabase, invoke APIs, create observations, calculate clinical scores, infer reference ranges or approve records. File replacement, review changes and clear invalidate the preview. It is not an authenticated server-side review decision.

## Acceptance

1. Signed-in active Crew Self on existing MISSION_TEST: upload **synthetic** CSV/TXT or locally extract synthetic PDF, review exact matches, select unique metrics, supply date, check confirmation, then preview.
2. Missing consent, missing Crew Self context, duplicate selected IDs or missing confirmation: preview disabled.
3. Change selections, date or confirmation: old preview disappears; file replacement and clear also reset it.
4. Confirm no network persistence, no migration execution, no new mission or crew records, no browser grants or clinical activation.
5. Run focused tests, full `bun run check` and visual checks in Lovable.

## Gates

FV-01-13 OPEN; P32/P34 PENDING; Final Security Gate BLOCKED; clinical activation DISABLED. P36.2B10 SQL remains staged only; do not apply it to the shared Lovable Cloud DB.
