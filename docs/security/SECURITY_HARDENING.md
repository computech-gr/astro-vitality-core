# P16 Security & Safety Hardening

P16 closes the roadmap security-hardening gate around the implementation completed through P15.

## Controls introduced

- threat model and misuse-case register;
- deterministic repository secret/server-boundary audit;
- security response headers at the SSR boundary;
- forced-RLS posture preserved for all P15 mission tables;
- `SECURITY DEFINER` functions retain pinned `search_path` and explicit grants;
- hardened mission-event ingestion validation and mission-operator scope;
- replay/idempotency mismatch becomes an explicit conflict rather than a silent duplicate;
- research export recursively strips direct-identifier and free-text keys;
- pseudonymization is explicitly documented as not equivalent to anonymization;
- dedicated P16 tests/verifier and CI security audit;
- filesystem vulnerability/secret scan workflow using Trivy.

## CSP limitation

TanStack Start currently emits inline bootstrap/hydration code. The P16 CSP therefore retains `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` where required for the current runtime. This is a documented residual risk, not a claim of strict CSP. A nonce/hash-based policy is a release-candidate hardening target if supported by the final hosting/runtime path.

## No new medical authority

P16 changes security and failure behavior only. It adds no new clinical thresholds, diagnoses, medical recommendations, or autonomous escalation authority.
