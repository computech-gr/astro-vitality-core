# P46 — Optional foreground routine reminders

The Daily Health Companion now provides opt-in repeating check-in reminders. Users select an interval; the 1-minute option is for demonstration only. A timer runs while the companion page remains mounted. Due events display an accessible in-page notice and, if explicitly authorized, a browser Notification. No data is written to Supabase, medical records, local storage, or audit logs.

## Boundaries

This is **not** a durable scheduler, push service, or guaranteed notification when the browser is closed, tab suspended, device offline, or the page navigated away from. Browser notification permission is optional. The intervals are user-chosen demonstration settings, not approved medical measurement frequencies. No clinical alert, threshold, or medical risk inference is made.

## Demo

Open `/mission/companion`; inspect the existing dynamic health trend chart under section 3 (requires real Crew Self membership for private data); choose `1 minute (demo)` under section 2; select Start reminders; optionally enable browser notifications; keep the page open; wait one minute; dismiss the in-page reminder; Stop; reload to verify reset. For real multi-device or background scheduling, require a separate reviewed protocol, secure per-crew persistence, server-side scheduling, consent, timezone, revocation, and offline delivery semantics.
