import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCanonicalMetricsTool from "./tools/list-canonical-metrics";
import listMyMissionsTool from "./tools/list-my-missions";
import listMissionEventsTool from "./tools/list-mission-events";
import getMissionSnapshotTool from "./tools/get-mission-snapshot";

// The OAuth issuer must be the direct Supabase host; only the project ref
// survives publish unchanged, and Vite inlines this literal at build time.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "astro-vitality-core",
  title: "Astro Vitality Core",
  version: "0.1.0",
  instructions:
    "Read-only agent tools for The Mitochondria, an open-source offline-first astronaut health intelligence platform. Every tool runs as the signed-in user under mission row-level security. Tools return reference metadata and record metadata only; they never return raw physiological values, never apply clinical thresholds, and never produce diagnoses or medical advice.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCanonicalMetricsTool, listMyMissionsTool, listMissionEventsTool, getMissionSnapshotTool],
});
