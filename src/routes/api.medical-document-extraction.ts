import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { handleMedicalDocumentExtraction } from "@/lib/medical-document-extraction.server";

const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number) =>
  Response.json({ error: message }, { status, headers: noStore });
const MAX_BODY = 40_000;

export const Route = createFileRoute("/api/medical-document-extraction")({
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
        // Membership queries run as the caller (RLS), never as a broad service role.
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
        let input: unknown;
        try {
          input = JSON.parse(raw) as unknown;
        } catch {
          return fail("Invalid JSON", 400);
        }
        // Existing access policy: assigned Crew Self for this exact scope, or
        // Ground Medical in the mission with an active Crew Self roster match.
        const isAuthorizedScope = async (missionId: string, crewMemberId: string) => {
          const { data: self, error: selfError } = await supabase
            .from("mission_memberships")
            .select("id")
            .eq("user_id", userResult.user.id)
            .eq("mission_id", missionId)
            .eq("crew_member_id", crewMemberId)
            .eq("role", "crew_self")
            .eq("active", true)
            .limit(1);
          if (selfError) throw new Error("membership lookup failed");
          if (self?.length) return true;
          const { data: ground, error: groundError } = await supabase
            .from("mission_memberships")
            .select("id")
            .eq("user_id", userResult.user.id)
            .eq("mission_id", missionId)
            .eq("role", "ground_medical")
            .eq("active", true)
            .limit(1);
          if (groundError) throw new Error("membership lookup failed");
          if (!ground?.length) return false;
          const { data: roster, error: rosterError } = await supabase
            .from("mission_memberships")
            .select("id")
            .eq("mission_id", missionId)
            .eq("crew_member_id", crewMemberId)
            .eq("role", "crew_self")
            .eq("active", true)
            .limit(1);
          if (rosterError) throw new Error("membership lookup failed");
          return Boolean(roster?.length);
        };
        return handleMedicalDocumentExtraction(input, {
          env: (name) => process.env[name],
          userId: userResult.user.id,
          isAuthorizedScope,
          providerFetch: fetch,
          audit: (event) => console.info(JSON.stringify(event)),
        });
      },
    },
  },
});
