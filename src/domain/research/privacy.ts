export interface ResearchAggregate {
  schema: "mitochondria.research.aggregate.v1";
  cohort: "3_or_more";
  event_count_lower_bound: number;
  event_count_bucket_width: 10;
  suppression_policy: "minimum_3_crew_and_10_events";
  classification: "aggregate_only";
}
/** Do not trust a remote RPC response to be privacy-safe without validating its shape. */
export function validateResearchAggregate(rows: unknown): ResearchAggregate[] {
  if (!Array.isArray(rows) || rows.length > 1) throw new Error("Research export rejected: unexpected row count");
  return rows.map((value): ResearchAggregate => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Research export rejected: invalid aggregate");
    const row = value as Record<string, unknown>;
    const allowed = ["schema", "cohort", "event_count_lower_bound", "event_count_bucket_width", "suppression_policy", "classification"];
    if (Object.keys(row).some(key => !allowed.includes(key)) || Object.keys(row).length !== allowed.length ||
        row["schema"] !== "mitochondria.research.aggregate.v1" || row["cohort"] !== "3_or_more" ||
        row["classification"] !== "aggregate_only" || row["event_count_bucket_width"] !== 10 ||
        row["suppression_policy"] !== "minimum_3_crew_and_10_events" ||
        typeof row["event_count_lower_bound"] !== "number" || !Number.isSafeInteger(row["event_count_lower_bound"]) ||
        (row["event_count_lower_bound"] as number) < 10 || (row["event_count_lower_bound"] as number) % 10 !== 0) {
      throw new Error("Research export rejected: privacy contract mismatch");
    }
    return row as unknown as ResearchAggregate;
  });
}
