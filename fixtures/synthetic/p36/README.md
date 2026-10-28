# P36 synthetic fixtures — Challenge 02

`P36_CHALLENGE_02_ORIGINAL.pdf` is the exact owner-supplied synthetic regression
document (SHA-256 `877dc53c59c3759441c03713b31d0758ecaf3f36e3f77a5b7b88cd4fb09ec4bd`,
byte-preserved; do not modify).

It is a deliberately adversarial synthetic laboratory report:

- no MITOCHONDRIA catalog identifiers anywhere in the document;
- result values printed before analyte names;
- reference intervals and instrument numbers that must never become results;
- a header collection date/time (14 October 2026, 07:35 UTC) that must not be
  silently promoted to an observation timestamp.

Expected hybrid outcome (deterministic parser + validated AI assistance):
five synthetic immune measurements — WBC 6.7 10^9/L (IMM-001), neutrophils
3.8 10^9/L (IMM-002), lymphocytes 2.2 10^9/L (IMM-003), hs-CRP 2.4 mg/L
(IMM-007), NLR 1.73 ratio (IMM-006) — all unchecked, all requiring human
verification and an explicitly confirmed observation date before saving.

SYNTHETIC DEMONSTRATION DATA ONLY. Not a medical record.
