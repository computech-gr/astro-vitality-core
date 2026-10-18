# P35.17 — Interactive Synthetic Health Preview

Adds a read-only, domain-filtered three-timepoint table for the existing 18 deterministic fictional observations. It is usable on reserved MISSION_TEST solely because it makes no Cloud calls, no imports, no exports, and no changes to mission records. The existing export and checklist protections remain unchanged. Four regression tests cover coverage, timepoints, fail-closed dataset flags and provenance exclusion. No administrator authorization, migration, role grant, clinical interpretation, or publishing is included.

Next owner decision: approve a **separate** synthetic demo mission via the existing operator creation workflow (Cloud write), and separately approve a backend-governed administrator design. Do not silently create missions or promote the operator to admin.
