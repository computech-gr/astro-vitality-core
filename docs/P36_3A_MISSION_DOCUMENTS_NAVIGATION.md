# P36.3A — Mission Documents navigation discovery

- Add **Mission Documents** under **Platform → Monitoring & data** in the existing global navigation, rendered by the same desktop and mobile menu structure.
- Map it to the existing `/mission/documents` route; the route and its Crew Self access rules remain unchanged.
- Make the label searchable with document/laboratory/biomarker keywords.
- No database, permissions, identity, deployment, or clinical changes.
- The accompanying test is static; Lovable must run full tests, typecheck, lint, build and visually verify desktop/mobile menu and global search.

The accompanying synthetic PDF is a separate downloadable test artifact, not a source-code change. PDF text extraction may join lines; use the TXT fixture for reliable exact-match parser testing. Only synthetic data are permitted.
