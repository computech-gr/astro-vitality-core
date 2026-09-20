import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_mission_snapshot",
  title: "Get ground mission snapshot",
  description:
    "Return the governed ground-console snapshot for one mission via the existing authorization-checked database function. Denied unless the signed-in user holds an authorized ground mission role.",
  inputSchema: {
    missionId: z.string().trim().min(1).describe("Mission id to summarize."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ missionId }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("get_ground_mission_snapshot", { p_mission_id: missionId });
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? null) }],
      structuredContent: { snapshot: (data ?? null) as never },
    };
  },
});
