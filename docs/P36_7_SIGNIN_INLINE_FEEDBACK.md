# P36.7 — Sign-in error feedback correction

## Root cause

The sign-in handler used the page-global `message` alert located above the mission access form. On scrolled screens it could be out of view. The credential-error mapper already returns `Incorrect email or password. Please try again.` for unknown accounts and bad passwords.

## Fix

Render a dedicated accessible alert directly under the sign-in password field. Preserve email and clear password after failure; clear stale errors on editing. Do not distinguish unknown users from wrong passwords. No SQL, feature flags, permissions, or synthetic cloud saving changed.

## Manual acceptance

1. On the published site, enter a valid test-account email and deliberately incorrect password. Verify inline message and empty password field.
2. Try an unknown email; verify identical generic message.
3. Enter correct credentials and verify sign-in.
4. Verify signup password-length error still works.
5. Run `bun run check` and verify live publish/CI separately.
