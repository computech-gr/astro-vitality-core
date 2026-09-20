import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

interface MembershipRow {
  mission_id: string;
  crew_member_id: string | null;
  role: string;
  active: boolean;
}

export default defineTool({
  name: "list_my_missions",
  title: "List my missions",
  description:
    "List the missions the signed-in user is an active member of, with their mission role. Scoped by mission row-level security — never returns other users' missions.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_args, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("mission_memberships")
      .select("mission_id, crew_member_id, role, active")
      .eq("active", true);

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const memberships = ((data ?? []) as MembershipRow[]).map((row) => ({
      missionId: row.mission_id,
      crewMemberId: row.crew_member_id ?? null,
      role: row.role,
    }));

    return {
      content: [
        {
          type: "text",
          text: memberships.length
            ? `Active mission memberships: ${memberships.map((m) => `${m.missionId} (${m.role})`).join(", ")}.`
            : "No active mission memberships for this account.",
        },
      ],
      structuredContent: { memberships },
    };
  },
});
