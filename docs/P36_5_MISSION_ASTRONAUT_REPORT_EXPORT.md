# P36.5 Mission & Astronaut Report Export

Scope: Unified Health & Device Report only. Identity labels come from authorized mission memberships, not from PDF contents or user-supplied filenames. Display human-readable mission and astronaut names on cover, retaining immutable IDs for traceability. Evidence TXT uses the same sanitized base name.

The existing print route uses `window.print()`. Setting `document.title` provides a **best-effort** suggested Save as PDF name, but cannot force the browser print dialog to honor it. A guaranteed one-click named PDF download requires a real client-side PDF export implementation. Do not claim this patch supplies one. The Lovable implementation should add a distinct Download PDF control with actual PDF bytes, named using reportExportBasename, preserve A4 layout, prevent content upload, and retain Print separately. Do not use server-side PDF rendering for medical data without additional architecture review.

Acceptance: verify authorized crew identity (not another crew), fallback for missing display names, filename sanitization, print cover and TXT name, real named PDF download in Chrome/Edge, existing 4-page or longer report content, no RLS/migrations/publishing. Avoid changes to medical intake and AI parsing.
