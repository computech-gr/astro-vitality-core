import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { listCanonicalMetrics } from "@/domain/metric-registry";

export default defineTool({
  name: "list_canonical_metrics",
  title: "List canonical metrics",
  description:
    "List the reviewed canonical health metric definitions (code, display name, domain, canonical unit, cadence, priority, interpretation tier). Reference metadata only — no physiological values and no clinical thresholds.",
  inputSchema: {
    domain: z.string().trim().min(1).optional().describe("Optional domain filter, e.g. laboratory or nutrition_hydration."),
    search: z.string().trim().min(1).optional().describe("Optional case-insensitive substring match on code or display name."),
    limit: z.number().int().min(1).max(200).optional().describe("Maximum definitions to return. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ domain, search, limit }) => {
    const needle = search?.toLowerCase();
    const matches = listCanonicalMetrics()
      .filter((metric) => (domain ? metric.domain === domain : true))
      .filter((metric) =>
        needle ? metric.code.toLowerCase().includes(needle) || metric.displayName.toLowerCase().includes(needle) : true,
      )
      .slice(0, limit ?? 50)
      .map((metric) => ({
        code: metric.code,
        displayName: metric.displayName,
        domain: metric.domain,
        canonicalUnit: metric.canonicalUnit,
        cadence: metric.cadence,
        priority: metric.priority,
        interpretationTier: metric.interpretationTier,
        personalBaseline: metric.personalBaseline,
      }));

    return {
      content: [{ type: "text", text: `${matches.length} canonical metric definition(s).` }],
      structuredContent: { metrics: matches },
    };
  },
});
