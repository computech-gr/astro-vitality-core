# Daily Health Companion rules

- Environment, checklist and participation stay in component memory only; Crew Self evidence is read through the existing scientific-evidence adapter, so colors stay data-quality states and cadences defer to approved mission protocols.
- Optional reminders are foreground-only, user-chosen intervals held in component memory (reminder-engine.ts) with an in-page notice and a permission-gated browser Notification; no persistence, push or service-worker scheduling, so no delivery guarantee is implied.
- The synthetic trend demonstration is a hardcoded, opt-in, memory-only illustration kept outside the Crew Self evidence path, so it can never be mistaken for, mixed with or exported as crew data.
- Crew Self trend time-window/source filters and the provenance table are local presentation over already-authorized evidence (filterTrendObservations): no conversion, aggregation, thresholds or extra fetches, and they reset whenever the crew scope changes.
- Revocation on return is a full page reload when a hidden tab becomes visible again (not real-time while visible), so stale Crew Self evidence is never kept; it intentionally resets checklist, filters, synthetic demo and reminders.
