import { describe, expect, test } from "bun:test";
import { validateResearchAggregate } from "../../src/domain/research/privacy";
const safe = { schema: "mitochondria.research.aggregate.v1", cohort: "3_or_more", event_count_lower_bound: 20, event_count_bucket_width: 10, suppression_policy: "minimum_3_crew_and_10_events", classification: "aggregate_only" };
describe("P28 privacy contract", () => {
  test("accepts aggregate or suppression", () => { expect(validateResearchAggregate([safe])).toHaveLength(1); expect(validateResearchAggregate([])).toEqual([]); });
  test("rejects row-level and identifying fields", () => { expect(() => validateResearchAggregate([{ ...safe, participant_id: "p_1" }])).toThrow(); expect(() => validateResearchAggregate([{ ...safe, occurred_at: "2026-01-01" }])).toThrow(); });
  test("rejects invalid count and multiple rows", () => { expect(() => validateResearchAggregate([{ ...safe, event_count_lower_bound: 11 }])).toThrow(); expect(() => validateResearchAggregate([safe, safe])).toThrow(); });
});
