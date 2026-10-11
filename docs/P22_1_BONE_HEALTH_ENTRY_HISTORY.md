# P22.1 — Bone Health Data Entry & History

- Adds `/mission/bone-health` in Platform navigation; 63 handbook variables are selectable **reference labels only**.
- Manual entry: numeric value, reported unit, date, source, optional specimen/method/notes, explicit synthetic vs real provenance.
- Uses existing P14 encrypted append-only IndexedDB mission record store (`medical_sensitive`, `observation`); filters history by mission and crew ID. No unencrypted localStorage or Supabase upload.
- This MVP accepts the user's entered mission and crew identifiers; it does **not** establish authenticated crew identity. Do not use shared devices or enter real medical data before identity/access controls are verified.
- No clinical normal ranges, trends across incompatible units, diagnoses, treatment, autonomous alerts or “OK” flags.
- CSV/FHIR/PDF import, verified mission identity, approved unit conversion, and governed medical interpretation are subsequent phases.
- TanStack's generated route tree is deliberately not edited; the normal Lovable route generation should discover the new route. If route generation does not run, report it as a blocker rather than manually patching generated files.
