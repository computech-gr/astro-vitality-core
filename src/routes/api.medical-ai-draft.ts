import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { SyntheticEvidenceSnapshot } from "@/domain/health-intelligence/synthetic-evidence";
import {
  AI_DRAFT_INSTRUCTIONS,
  AI_DRAFT_SCHEMA,
  renderStructuredDraft,
  validateAIDraft,
} from "@/domain/health-intelligence/ai-draft-validation";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: noStore });
const MAX_BODY = 36000;
// Integration fix: repository IDs are "mission-<32 hex>" / "crew-<32 hex>" (UUIDs also accepted).
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MISSION_ID = new RegExp(`^(mission-[0-9a-f]{32}|${UUID})$`, "i");
const CREW_ID = new RegExp(`^(crew-[0-9a-f]{32}|${UUID})$`, "i");

export const Route = createFileRoute("/api/medical-ai-draft")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY)
          return fail("Request too large", 413);
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin)
          return fail("Cross-origin request denied", 403);
        const bearer = request.headers.get("authorization") ?? "";
        if (!bearer.startsWith("Bearer ")) return fail("Authentication required", 401);
        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) return fail("Identity service unavailable", 503);
        const token = bearer.slice(7);
        // Integration fix: membership query must run as the caller (RLS), not anon.
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}`, apikey: supabaseKey } },
        });
        const { data: userResult, error: userError } = await supabase.auth.getUser(token);
        if (userError || !userResult.user) return fail("Invalid session", 401);
        let raw: string;
        try {
          raw = await request.text();
        } catch {
          return fail("Invalid request", 400);
        }
        if (raw.length > MAX_BODY) return fail("Request too large", 413);
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          return fail("Invalid JSON", 400);
        }
        const { missionId, crewMemberId, provenance, consent, observations } = input;
        if (
          typeof missionId !== "string" ||
          typeof crewMemberId !== "string" ||
          !MISSION_ID.test(missionId) ||
          !CREW_ID.test(crewMemberId) ||
          (provenance !== "real" && provenance !== "synthetic") ||
          consent !== true ||
          !Array.isArray(observations) ||
          observations.length < 1 ||
          observations.length > 120
        )
          return fail("Invalid evidence or consent", 400);
        const { data: membership, error: membershipError } = await supabase
          .from("mission_memberships")
          .select("id")
          .eq("user_id", userResult.user.id)
          .eq("mission_id", missionId)
          .eq("crew_member_id", crewMemberId)
          .eq("role", "ground_medical")
          .eq("active", true)
          .limit(1);
        if (membershipError || !membership?.length)
          return fail("Ground-medical authorization required", 403);
        if (provenance === "real")
          return fail(
            "Real-data AI transfer is disabled pending approved privacy configuration",
            403,
          );
        const allowedDomains = new Set([
          "bone",
          "cardiovascular",
          "immune",
          "behavioral",
          "sleep",
          "cognitive",
          "other",
        ]);
        const evidence: Array<{
          id: string;
          metric: string;
          value: string;
          unit: string;
          time: string;
          domain: string;
        }> = [];
        for (const item of observations) {
          if (!item || typeof item !== "object") return fail("Invalid evidence", 400);
          const o = item as Record<string, unknown>;
          if (
            typeof o["id"] !== "string" ||
            o["id"].length > 100 ||
            !/^[a-zA-Z0-9:_-]+$/.test(o["id"]) ||
            typeof o["metric"] !== "string" ||
            o["metric"].length > 120 ||
            (typeof o["value"] !== "string" && typeof o["value"] !== "number") ||
            String(o["value"]).length > 80 ||
            typeof o["unit"] !== "string" ||
            o["unit"].length > 35 ||
            typeof o["time"] !== "string" ||
            o["time"].length > 40 ||
            !Number.isFinite(Date.parse(o["time"])) ||
            typeof o["domain"] !== "string" ||
            !allowedDomains.has(o["domain"].toLowerCase())
          )
            return fail("Invalid evidence", 400);
          evidence.push({
            id: o["id"],
            metric: o["metric"],
            value: String(o["value"]),
            unit: o["unit"],
            time: o["time"],
            domain: o["domain"],
          });
        }
        const apiKey = process.env["OPENAI_API_KEY"];
        if (!apiKey) return fail("Server AI provider not configured; no data sent", 503);
        if (process.env["MITO_MEDICAL_GOVERNANCE_V3_ENABLED"] !== "true")
          return fail(
            "AI generation paused pending approved atomic quotas and authoritative synthetic evidence verification; no data sent",
            503,
          );
        if (new Set(evidence.map((e) => e.id)).size !== evidence.length)
          return fail("Duplicate evidence IDs", 422);
        const { data: source, error: sourceError } = await supabase.rpc(
          "medical_v3_fixture_snapshot",
        );
        const snapshot = source as SyntheticEvidenceSnapshot | null;
        if (sourceError || !snapshot)
          return fail("Authoritative synthetic evidence unavailable; no data sent", 503);
        if (snapshot.missionId !== missionId || snapshot.crewMemberId !== crewMemberId)
          return fail("Synthetic fixture scope mismatch; no data sent", 403);
        // Pending RPC types are intentionally not generated before owner approval.
        const { data: verified, error: verificationError } = await supabase.rpc(
          "medical_v3_ai_evidence",
          {
            p_mission: missionId,
            p_crew: crewMemberId,
          },
        );
        if (verificationError || !verified || !Array.isArray(verified))
          return fail("Authoritative synthetic evidence unavailable; no data sent", 503);
        if (
          JSON.stringify(verified) !== JSON.stringify(snapshot.evidence) ||
          evidence.length !== snapshot.evidence.length ||
          evidence.some((row, index) => {
            const trusted = snapshot.evidence[index];
            return (
              !trusted ||
              Object.keys(row).some(
                (key) => row[key as keyof typeof row] !== trusted[key as keyof typeof trusted],
              )
            );
          })
        )
          return fail("Stale or tampered evidence; no data sent", 422);
        const { data: reservation, error: quotaError } = await supabase.rpc(
          "medical_v3_reserve_ai",
          {
            p_mission: missionId,
            p_crew: crewMemberId,
          },
        );
        const quota = reservation as { allowed?: boolean; reservationId?: string } | null;
        if (quotaError || !quota)
          return fail("Atomic quota service unavailable; no data sent", 503);
        if (quota.allowed !== true || !quota.reservationId)
          return Response.json(
            { error: "AI request quota exhausted" },
            {
              status: 429,
              headers: { ...noStore, "Retry-After": "60" },
            },
          );
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);
        try {
          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: process.env["MITO_MEDICAL_AI_MODEL"] || "gpt-4.1-mini",
              store: false,
              max_output_tokens: 1500,
              instructions: AI_DRAFT_INSTRUCTIONS,
              input: JSON.stringify({ provenance: "synthetic", evidence: snapshot.evidence }),
              text: {
                format: {
                  type: "json_schema",
                  name: "research_draft",
                  strict: true,
                  schema: AI_DRAFT_SCHEMA,
                },
              },
            }),
          });
          if (!response.ok) return fail("AI provider unavailable; no draft generated", 502);
          const result = (await response.json()) as {
            output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
          };
          const rawText =
            result.output
              ?.flatMap((x) => x.content ?? [])
              .filter((x) => x.type === "output_text")
              .map((x) => x.text ?? "")
              .join("\n")
              .trim() ?? "";
          let structured: unknown;
          try {
            structured = JSON.parse(rawText);
          } catch {
            return fail("AI draft was not valid structured output; rejected", 422);
          }
          const text = renderStructuredDraft(structured) ?? "";
          if (!text || text.length > 12000) return fail("AI draft missing or oversized", 502);
          const check = validateAIDraft(text, snapshot.evidence);
          if (!check.ok)
            return Response.json(
              {
                error: "AI draft failed evidence validation; rejected",
                violations: check.violations.slice(0, 20),
              },
              { status: 422, headers: noStore },
            );
          return Response.json(
            {
              draft: text,
              source: "server-ai",
              model: process.env["MITO_MEDICAL_AI_MODEL"] || "gpt-4.1-mini",
              generatedAt: new Date().toISOString(),
              warning: "Unverified AI research draft; independent medical advisor review required.",
            },
            { headers: noStore },
          );
        } catch {
          return fail("AI request timed out or failed", 502);
        } finally {
          clearTimeout(timeout);
          await supabase.rpc("medical_v3_release_ai", { p_reservation: quota.reservationId });
        }
      },
    },
  },
});
