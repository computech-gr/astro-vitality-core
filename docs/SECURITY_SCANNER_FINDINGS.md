# Security Scanner Findings Review

This document records the review of the three Supabase/Lovable security warnings visible after P15/P16 hardening. They are not permission gaps to be auto-fixed blindly.

## Research pseudonymization keys have no access policies defined

**Disposition: intentional deny-by-default boundary.**

`mission_research_keys` has RLS enabled and forced. Direct privileges are revoked from `anon` and `authenticated`. No browser-facing policy is intentionally defined because the pseudonymization salt must not be readable by ordinary signed-in users. Server-side governed routines use it only inside the protected database boundary.

Adding a permissive browser policy would weaken the research de-identification boundary. If the scanner requires an explicit policy for presentation purposes, that should be evaluated separately as an explicit deny policy only; it is not required for access denial.

## No write policies defined for core mission tables

**Disposition: intentional RPC-only write architecture.**

Direct browser writes are not the supported path. Mission-event ingestion passes through the governed `ingest_mission_event` SECURITY DEFINER routine, which performs authenticated mission membership, crew scope, classification, provenance, idempotency and payload validation. Direct table privileges remain restricted.

Adding permissive INSERT/UPDATE/DELETE policies solely to silence a scanner would bypass that controlled ingestion boundary.

## Signed-In Users Can Execute SECURITY DEFINER Function

**Disposition: reviewed and required for the public RPC boundary.**

The intentionally exposed RPCs are callable by `authenticated`, not `anon`, and perform explicit authorization internally. Internal helpers such as the mission research-key trigger helper are not exposed to signed-in browser callers. P16 tests and live verification cover cross-mission/crew denial, role restrictions, replay/conflict behavior and research export separation.

A SECURITY DEFINER function being callable by authenticated users is not by itself proof of unsafe authorization. Each exposed routine must continue to be reviewed whenever its implementation changes.

## Auto-fix policy

Do **not** use a global "fix all" action for these findings. Security changes must preserve the P15/P16 role model, forced RLS, RPC-only write boundary, audit behavior and research-key isolation.
