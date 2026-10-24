# MITOCHONDRIA v3 — synthetic-source decision gate (not an authorization)

## Purpose

This patch repairs three obsolete source-format-sensitive static assertions. It does **not** approve the proposed authoritative synthetic-source design, change trust boundaries, migrate production, enable AI, or persist Medical Advisor approvals. Two private evidence gates remain blocked until genuine owner-controlled evidence is supplied.

## Design to present for separate owner decision

- Server-controlled, owner-approved synthetic fixture manifest, with fixed mission/crew scope, provenance, immutable fixture version and source digest; never promote browser uploads or local acceptance flags to server authority.
- Authoritative review events and catalog-eligibility decisions; reconstruct corrections/supersessions, reject cycles, forks, missing parents, cross-scope records and ambiguous effective observations.
- Versioned canonical SHA-256 document binding source/catalog revision, observation IDs, exact values/units/times, review decisions and lineage. Include cross-runtime byte-parity fixtures.
- Ground-medical membership must be checked against the authenticated caller and exact crew on every request. Keep synthetic-only and research-only flags, PENDING_NIKOLAS_REVIEW and scientific gates.
- Separate production migration review, RLS/grants audit, safe rollback and genuine restore drill, privacy/retention approval, rate-limit concurrency proof, and explicit activation authorization.

## Acceptance instructions

Run the three updated static verifiers and full project checks. Report remaining five-gate disposition accurately: three may now pass; the private restore-evidence and owner-risk acknowledgment gates must remain blocked without authentic files. Format only touched files and any specifically authorized existing v3 contract file. Do not fabricate evidence, loosen security, or apply SQL to production.
