# P29 — Conservative Offline Mission Operations

This milestone extends the existing encrypted append-only P14/P23 store-and-forward infrastructure, **without** creating a second persistence system.

The existing `/mission/offline` page now includes an explicit **session-only foreground retry** control. It retries only while the tab is visible, the browser reports connectivity, the user has a signed-in active mission membership, and the local queue contains pending or failed records. It rechecks authorization for every attempt and applies exponential backoff (15 seconds to 5 minutes). It does not automatically resolve conflicts or `needs_review` records. It does not silently persist consent or transmit in a background service worker.

This is operational synchronization, **not autonomous medical decision-making**. The browser connectivity indicator does not guarantee server availability. The existing transport and server RLS remain authoritative. No offline device validation or signed-in end-to-end evidence is claimed. No migration is needed.

Acceptance: P29 verifier, domain tests, existing offline verifiers, foundation verifier, typecheck, production build. Real-device airplane-mode capture/reconnect, authorization expiry, multi-tab races and conflict review remain for final P34 acceptance.
