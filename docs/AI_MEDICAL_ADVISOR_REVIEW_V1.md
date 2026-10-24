# AI Medical Opinion Draft — Medical Advisor Review v1

This patch adds an **AI draft capture and session-only advisor review workbench** to the existing report. It does not connect to an AI provider, store credentials, transmit PHI, verify clinical licensure, or create a legally binding medical signature. The prompt export is a manual operation; it may contain sensitive measurement data even without names, so it must not be uploaded to third-party AI without authorization and approved data handling.

The draft is explicitly unverified. Only mission-scoped `ground_medical` members may approve it in the UI; this role does not independently establish medical licensure. Advisor changes and rationale are required. Approval is bound to an evidence snapshot and becomes invalid if source measurements change. The review is **in-memory only**, lost on refresh. A future durable sign-off requires authenticated advisor identity, professional credential verification, encrypted append-only audit events, revocation and independent clinical governance. This patch intentionally does not misrepresent session approval as a durable signed opinion.

The English report retains research-only disclaimers. AI suggestions cannot modify observation values, scientific catalog, diagnosis, treatment, or PENDING_NIKOLAS_REVIEW.
