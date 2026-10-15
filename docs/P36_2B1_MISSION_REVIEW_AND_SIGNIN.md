# P36.2B1 — Mission-scoped local review and sign-in UX

This is a deliberately non-persistent security boundary increment, **not** the complete P36.2B verified-import implementation. The document workbench now requires an authenticated active Crew Self membership with a crew ID before allowing local synthetic-file selection; it displays the context but does not bind, store or submit observations. A future reviewed-import implementation requires server-enforced mission/crew authorization, RLS, durable provenance, approval audit, duplicate handling and end-to-end negative tests before any database write. No migration is included.

Sign-in validates missing/malformed email and missing password, shows accessible failure feedback, clears the password after failure, and intentionally uses a generic message for invalid email/password combinations to prevent account enumeration. The UI never promises to reveal whether an email exists.

Use synthetic documents only. No clinical activation or gate clearance.
