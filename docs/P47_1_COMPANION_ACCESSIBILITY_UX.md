# P47.1 — Daily Health Companion Accessibility & UX

Based on the supplied 2026-10-30 source archive.

## Changes

- Four primary card section titles become semantic h2 elements via the existing CardTitle asChild API.
- Four routine console links and three guidance links gain minimum 44px touch height and visible keyboard focus.
- No authentication paths guessed, no change to the sign-in mechanism, no clinical claims.
- Existing synthetic wording in source already says “not a crew record, clinical baseline, or live sensor feed”; no Supabase branding replacement necessary.

## Validation requested from Lovable

Run tests, typecheck, lint, format check, security audit, production build; verify screen-reader heading navigation and 390px mobile touch targets. Report pre-existing formatting failures separately. Do not publish.

## Still outstanding

Real authorized Crew Self end-to-end tests and Edge/Chrome physical notification tests; no database, RLS, auth or migration changes.

## Integration notes (2026-10-30)

The project's CardTitle has no `asChild` prop, so the four titles are rendered as `h2` elements with the identical card-title classes (the supplied markup failed typecheck and would leak an unknown DOM attribute). Focus outlines use the `ring` design token. Browser acceptance in bundled Chromium at 1280px and 390px (`tests/navigation/p471-companion-a11y.browser.py`): heading order h1 → four h2 (with the two existing h3 subsections), all seven links 44px tall, Tab reaches them with a 2px solid focus outline, no horizontal overflow, no page errors.
