import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

interface MissionEventRow {
  id: string;
  mission_id: string;
  crew_member_id: string;
  kind: string;
  event_timestamp: string;
  source_id: string;
  source_version: string;
  classification: string;
}

export default defineTool({
  name: "list_mission_events",
  title: "List mission events",
  description:
    "List recorded mission event metadata (kind, timestamp, source, data classification) the signed-in user is authorized to read. Returns record metadata only, never raw physiological values, and never interprets or diagnoses.",
  inputSchema: {
    missionId: z.string().trim().min(1).optional().describe("Optional mission id filter; defaults to every authorized mission."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum events to return. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ missionId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("mission_events")
      .select("id, mission_id, crew_member_id, kind, event_timestamp, source_id, source_version, classification")
      .order("event_timestamp", { ascending: false })
      .limit(limit ?? 50);
    if (missionId) query = query.eq("mission_id", missionId);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }

    const events = ((data ?? []) as MissionEventRow[]).map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      crewMemberId: row.crew_member_id,
      kind: row.kind,
      eventTimestamp: row.event_timestamp,
      sourceId: row.source_id,
      sourceVersion: row.source_version,
      classification: row.classification,
    }));

    return {
      content: [
        {
          type: "text",
          text: events.length
            ? `${events.length} authorized mission event record(s). Payload values are intentionally omitted.`
            : "No authorized mission event records found.",
        },
      ],
      structuredContent: { events },
    };
  },
});
