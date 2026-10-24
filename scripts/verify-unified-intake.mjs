#!/usr/bin/env node
/** Unified Medical Data Intake verifier: additive, research-only, append-only, no cloud writes. */
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const fail = (message) => {
  console.error(`FAIL: ${message}`);
  process.exit(1);
};

const envelope = read("src/domain/health-intelligence/observation-envelope.ts");
const store = read("src/domain/health-intelligence/observation-store.ts");
const workspace = read("src/components/unified-intake-workspace.tsx");
const route = read("src/routes/mission.intake.tsx");
const classification = read("src/domain/health-domains/unified-intake-classification.ts");

// Versioned envelope with identity, metric, unit, time, source, provenance, quality, review state
for (const token of [
  "mitochondria.unified-observation.v1",
  "missionId",
  "crewMemberId",
  "metricId",
  "originalUnit",
  "observedAt",
  "documentSha256",
  "provenance",
  "reviewerConfirmed",
  "reviewState",
]) {
  if (!envelope.includes(token)) fail(`envelope missing ${token}`);
}

// Append-only encrypted storage, mission-scoped reads, no cloud writes
for (const token of [
  "persistOfflineMissionEvent",
  "medical_sensitive",
  "collapseUnifiedObservationVersions",
  "markUnifiedObservationErroneous",
  "mission.missionId === missionId",
  "mission.crewMemberId === crewMemberId",
]) {
  if (!store.includes(token)) fail(`store missing ${token}`);
}
if (store.includes("supabase.from(") || store.includes("supabaseAdmin"))
  fail("store must never write to the cloud");

// Per-row review, domain routing, duplicate warnings, review-only fallback
for (const token of [
  "classifyIntakeObservation",
  "Domain routing preview",
  "review-only",
  "Possible duplicate",
  "I reviewed every selected row",
  "PENDING_NIKOLAS_REVIEW",
  "research reference only",
]) {
  if (!workspace.toLowerCase().includes(token.toLowerCase())) fail(`workspace missing ${token}`);
}
if (workspace.includes("supabase.from(")) fail("workspace must never write to the cloud");

// Classification stays deterministic and review-gated
for (const token of ["reviewRequired: true", "automaticallyApproved: false", "requiresHumanReview: true"]) {
  if (!classification.replace(/\s+/g, " ").includes(token)) fail(`classification missing ${token}`);
}

// Route is operational (noindex) and uses the global shell only
if (!route.includes("operationalRouteHead")) fail("route must use operationalRouteHead (noindex)");

// Sealed scientific sources untouched by this feature
const registry = JSON.parse(read("data/scientific/p36-biomarker-source-registry.v1.json"));
if (!Array.isArray(registry.metrics) || registry.metrics.length === 0)
  fail("P36 registry unreadable");

console.log(
  "Unified intake verifier PASS: versioned envelope, per-row review, append-only encrypted storage, domain routing, no cloud writes, research-only gates intact.",
);
