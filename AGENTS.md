<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Unapproved database changes are staged in supabase/pending/ (never supabase/migrations/) and exercised only by the disposable harness with FV0143_INCLUDE_PENDING=1; this keeps production migrations owner-gated.
- Greek scientific handbooks in data/scientific stay byte-identical; English display text lives in sibling _.en_.json layers joined by ID via src/domain/scientific-localization (keeps source traceability).
- P36 synthetic Cloud submission goes only through the server function in src/lib/p36-cloud-submission.functions.ts calling a security-definer RPC as the signed-in user (never the service role), and stays off unless the server flag P36_CLOUD_SUBMISSION_ENABLED is "true"; this keeps identity checks in the database and live writes owner-gated.
- Public competition team facts live in a browser-safe content module consumed by the team leaf route; the existing global shell owns its only header and the Project Guide retains its Team anchor to avoid duplicated content and navigation.
- The Project Guide roadmap is rendered only from the browser-safe registry src/content/roadmap-phases.ts, with every linked doc/verifier checked by tests; this keeps phase history evidence-backed and maintained in one place.
- Responsive presentation changes for frozen Health Intelligence sources belong in its leaf route wrapper; preserve the sealed source fingerprints and scientific classification values.
- Bone health history is append-only: corrections mark the prior entry erroneous and add a superseding entry via collapseBoneEntryVersions in src/domain/bone-health/history.ts; never rewrite or delete encrypted offline records.
- Unified medical intake stores observations only as versioned envelopes (mitochondria.unified-observation.v1) through src/domain/health-intelligence/observation-store.ts: per-measurement catalog classification, reviewer-accepted rows only route to domain read models, and storage stays encrypted, append-only and offline (no cloud writes).
- The Astronaut Health Report (/mission/health-report) is generated deterministically by src/domain/health-intelligence/health-history-report.ts from reviewer-accepted unified observations only: real and synthetic provenance are never mixed, erroneous/unreviewed records are excluded, and narrative statements must cite observation IDs with no diagnoses, thresholds or inferred trends.
- Medical advisor acknowledgment remains session-only for offline unified observations; v3 persistence and AI generation require owner-approved pending SQL plus an independently reconstructed authoritative synthetic evidence adapter, and fail closed without either. Caller-authenticated RPCs own append-only revisions, SHA-256 validation and atomic quotas; browser digests never attest evidence. Real-data AI is disabled, structured statements are rejected rather than rewritten, and reviewer membership is not licensure or a legal signature.
- Synthetic fixture review is a separate server-scope-resolved path with compact sorted-key v2 canonical evidence; offline reports never feed its authority. The pending fixture registry and test receipts are disposable-only until owner activation approval, because invented receipts are not human or scientific validation.
- Synthetic Q&A uses caller-scoped RPCs and the shared existing OpenAI Responses contract only behind disposable-environment server gates; exact fact-template validation rejects rather than rewrites claims, and exports re-read authority/history server-side to avoid cached hashes and browser timestamps.
