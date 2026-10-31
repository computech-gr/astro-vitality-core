import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildSyntheticBatch,
  P48_SYNTHETIC_LABEL,
  P48_SYNTHETIC_MISSION_CODE,
  syntheticIntakeEligibility,
  syntheticScenario,
  tallyIngestStatuses,
  type EligibilityFacts,
  type SyntheticReadingInput,
} from "@/domain/companion/synthetic-intake";

const NOW = new Date("2026-10-31T06:00:00Z");
const scope = { missionId: "mission-abc123", crewMemberId: "crew-a1" };
const reading = (patch: Partial<SyntheticReadingInput> = {}): SyntheticReadingInput => ({
  metricCode: "phys.heart_rate",
  value: 64,
  unit: "bpm",
  observedAt: "2026-10-30T08:00:00.000Z",
  source: "alpha",
  quality: "good",
  ...patch,
});
const issuesOf = (r: ReturnType<typeof buildSyntheticBatch>) => (r.ok ? [] : r.issues);

describe("P48 FINAL synthetic batch — RPC contract", () => {
  it("builds the exact ingest_mission_event shape with classification fixed to synthetic", () => {
    const r = buildSyntheticBatch(scope, [reading()], NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { event, idempotencyKey } = r.events[0]!;
    expect(Object.keys(event).sort()).toEqual(
      ["classification", "createdAt", "eventTimestamp", "id", "kind", "mission", "payload", "sourceId", "sourcePriority", "sourceVersion"].sort(),
    );
    expect(event.classification).toBe("synthetic");
    expect(event.kind).toBe("observation");
    expect(event.mission).toEqual(scope);
    expect(event.sourceId).toBe("p48-synthetic-source-alpha");
    expect(idempotencyKey.length).toBeGreaterThanOrEqual(16);
    expect(idempotencyKey.length).toBeLessThanOrEqual(256);
    expect(event.id.length).toBeLessThanOrEqual(160);
    const payload = event.payload as {
      observation: { metric: { code: string; unit: string }; value: { number: number }; classification: string };
      syntheticDemonstration: { label: string; synthetic: boolean };
    };
    // Shape read by the Companion and the database index trigger.
    expect(payload.observation.metric.code).toBe("phys.heart_rate");
    expect(payload.observation.metric.unit).toBe("{beats}/min");
    expect(payload.observation.value.number).toBe(64);
    expect(payload.observation.classification).toBe("synthetic");
    expect(payload.syntheticDemonstration).toMatchObject({ label: P48_SYNTHETIC_LABEL, synthetic: true });
  });

  it("uses deterministic ids so a retried reading is a database duplicate, not a new record", () => {
    const a = buildSyntheticBatch(scope, [reading()], NOW);
    const b = buildSyntheticBatch(scope, [reading()], new Date("2026-10-31T07:00:00Z"));
    expect(a.ok && b.ok && a.events[0]!.idempotencyKey === b.events[0]!.idempotencyKey).toBe(true);
    const other = buildSyntheticBatch({ ...scope, crewMemberId: "crew-b1" }, [reading()], NOW);
    expect(a.ok && other.ok && a.events[0]!.event.id !== other.events[0]!.event.id).toBe(true);
  });
});

describe("P48 FINAL synthetic batch — validation", () => {
  it("accepts only catalog metrics with catalog units", () => {
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ metricCode: "lab.wbc", unit: "10^9/L" })], NOW))[0]).toContain("metric is not allowed");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ unit: "Hz" })], NOW))[0]).toContain("unit must be one of");
    expect(buildSyntheticBatch(scope, [reading({ metricCode: "sleep.duration", unit: "h", value: 7.1 })], NOW).ok).toBe(true);
    expect(buildSyntheticBatch(scope, [reading({ metricCode: "phys.hrv_rmssd", unit: "ms", value: 52 })], NOW).ok).toBe(true);
  });
  it("rejects non-finite, non-positive and impossible values", () => {
    for (const value of [NaN, Infinity, 0, -3])
      expect(issuesOf(buildSyntheticBatch(scope, [reading({ value })], NOW))[0]).toContain("finite number");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ metricCode: "sleep.duration", unit: "h", value: 25 })], NOW))[0]).toContain("24 hours");
  });
  it("rejects invalid, future and too-old timestamps", () => {
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ observedAt: "yesterday" })], NOW))[0]).toContain("invalid");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ observedAt: "2026-11-02T00:00:00Z" })], NOW))[0]).toContain("future");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ observedAt: "2025-01-01T00:00:00Z" })], NOW))[0]).toContain("older than");
  });
  it("rejects duplicates, unknown sources/quality, empty and oversized batches", () => {
    expect(issuesOf(buildSyntheticBatch(scope, [reading(), reading()], NOW))[0]).toContain("duplicates");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ source: "real-watch" })], NOW))[0]).toContain("source");
    expect(issuesOf(buildSyntheticBatch(scope, [reading({ quality: "excellent" })], NOW))[0]).toContain("quality");
    expect(buildSyntheticBatch(scope, [], NOW).ok).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => reading({ observedAt: new Date(NOW.getTime() - (i + 1) * 3_600_000).toISOString() }));
    expect(issuesOf(buildSyntheticBatch(scope, many, NOW))[0]).toContain("At most 12");
  });
  it("rejects malformed scope identifiers", () => {
    expect(buildSyntheticBatch({ missionId: "", crewMemberId: "c" }, [reading()], NOW).ok).toBe(false);
    expect(buildSyntheticBatch({ missionId: "m'; drop", crewMemberId: "c" }, [reading()], NOW).ok).toBe(false);
  });
});

describe("P48 FINAL planned scenario", () => {
  it("has six valid readings per crew, two sources and more than 90 days of coverage", () => {
    for (const v of ["A", "B"] as const) {
      const rows = syntheticScenario(v, NOW);
      expect(rows).toHaveLength(6);
      expect(new Set(rows.map((r) => r.source))).toEqual(new Set(["alpha", "beta"]));
      const times = rows.map((r) => Date.parse(r.observedAt));
      expect((Math.max(...times) - Math.min(...times)) / 86_400_000).toBeGreaterThan(90);
      expect(buildSyntheticBatch(scope, rows, NOW).ok).toBe(true);
    }
    const a = syntheticScenario("A", NOW).map((r) => r.value);
    const b = syntheticScenario("B", NOW).map((r) => r.value);
    expect(a.some((x, i) => x === b[i])).toBe(false); // distinguishable crews
  });
});

describe("P48 FINAL eligibility (no operator/researcher/medical bypass)", () => {
  const facts = (patch: Partial<EligibilityFacts> = {}): EligibilityFacts => ({
    flagEnabled: true,
    mission: { code: P48_SYNTHETIC_MISSION_CODE, status: "planning" },
    memberships: [{ role: "crew_self", crewMemberId: "crew-a1" }],
    ...patch,
  });
  it("is eligible only for the dedicated open mission's own crew_self", () => {
    expect(syntheticIntakeEligibility(facts(), "crew-a1")).toBe("eligible");
    expect(syntheticIntakeEligibility(facts({ flagEnabled: false }), "crew-a1")).toBe("disabled");
    expect(syntheticIntakeEligibility(facts({ mission: { code: "MISSION_TEST", status: "active" } }), "crew-a1")).toBe("not_synthetic_mission");
    expect(syntheticIntakeEligibility(facts({ mission: null }), "crew-a1")).toBe("not_synthetic_mission");
    expect(syntheticIntakeEligibility(facts({ mission: { code: P48_SYNTHETIC_MISSION_CODE, status: "completed" } }), "crew-a1")).toBe("mission_closed");
    expect(syntheticIntakeEligibility(facts(), "crew-b1")).toBe("not_crew_self");
    expect(syntheticIntakeEligibility(facts({ memberships: [] }), "crew-a1")).toBe("not_crew_self");
  });
  it("refuses a crew_self who also holds another role in the mission", () => {
    for (const role of ["mission_operator", "researcher", "ground_medical"])
      expect(
        syntheticIntakeEligibility(
          facts({ memberships: [{ role: "crew_self", crewMemberId: "crew-a1" }, { role, crewMemberId: null }] }),
          "crew-a1",
        ),
      ).toBe("other_role_present");
  });
});

describe("P48 FINAL counts and server guard", () => {
  it("reports counts only", () => {
    expect(tallyIngestStatuses(["accepted", "accepted", "duplicate"], 6)).toEqual({
      accepted: 2, duplicate: 1, conflict: 0, rejected: 0, notAttempted: 3,
    });
  });
  const server = readFileSync("src/lib/p48-synthetic-intake.functions.ts", "utf8");
  it("is default-off, authenticated, RPC-only and never privileged", () => {
    expect(server).toContain('process.env["P48_SYNTHETIC_INTAKE_ENABLED"] === "true"');
    expect(server.match(/middleware\(\[requireSupabaseAuth\]\)/g)?.length).toBe(2);
    expect(server).toContain('rpc("ingest_mission_event"');
    expect(server).not.toContain("client.server");
    expect(server).not.toMatch(/SERVICE_ROLE|supabaseAdmin/);
    expect(server).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(server).toContain("irreversible: z.literal(true)");
    expect(server).toContain("plannedCount !== data.readings.length");
  });
  it("never seeds automatically from the Companion page", () => {
    const panel = readFileSync("src/components/p48-synthetic-intake-panel.tsx", "utf8");
    const submitCalls = panel.match(/submitP48SyntheticReadings\(/g)?.length ?? 0;
    expect(submitCalls).toBe(1);
    expect(panel).toMatch(/const submit = async \(\) => \{\s*if \(!ready\) return;/);
  });
});
