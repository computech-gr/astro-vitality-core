/**
 * P72.10 — Deterministic scientific interpretation inputs (SYNTHETIC / FABRICATED OBJECTS ONLY).
 * Rules (owner, P72.10): server-confirmed reports never substitute device-local scientific decisions
 * for an authoritative source; identical authorized data + rules + engine give identical scientific
 * inputs on every device; a local offline report uses and labels this device's decisions, waits while
 * they load and is blocked (never silently reduced) when they cannot be read; clinical and scientific
 * fingerprints are separate. Nothing here reads or writes any store.
 */
import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
  buildScientificSnapshot,
  describeScientificInputs,
  deviceDecisionsNotAppliedStatement,
  DEVICE_DECISIONS_LABEL,
  scientificFingerprint,
  sharedRuleSetIdentities,
  sharedScientificState,
  SHARED_RULE_SETS,
  SHARED_RULES_LABEL,
  summarizeDeviceDecisions,
  withScientificReadiness,
  type ReportScientificSnapshot,
} from "../../src/domain/health-intelligence/p7210-scientific-snapshot";
import { canonicalJson } from "../../src/domain/health-intelligence/observation-envelope";
import { reportProvenanceLines } from "../../src/domain/health-intelligence/p728-report-readiness";
import type { InterpretationSnapshot } from "../../src/domain/health-intelligence/biomarker-interpretation";
import type { CriteriaReviewResolution } from "../../src/domain/health-intelligence/p57-criteria-review";
import type { DatasetReadiness } from "../../src/domain/health-intelligence/p729-report-dataset";

const OFF = { provisionalLiteratureDemonstration: false };
const ON = { provisionalLiteratureDemonstration: true };

/** A device snapshot holding one server-attested device approval (fabricated; never stored). */
async function deviceWithApproval(events = 26): Promise<InterpretationSnapshot> {
  const { interpretation } = await sharedScientificState();
  const base = interpretation.records[0]!;
  return {
    ...interpretation,
    ledger: { events, head: "f".repeat(64), verified: true, note: null },
    records: [...interpretation.records.slice(1), { ...base, key: `${base.key}#device`, status: "approved", basis: "device_local", lifecycle: "approved" }],
    digest: "d".repeat(64),
  };
}
/** A device snapshot holding only opened review tasks (what fresh Researcher browsers had: 26 / 9 events). */
async function deviceTasksOnly(events: number): Promise<InterpretationSnapshot> {
  const { interpretation } = await sharedScientificState();
  return { ...interpretation, ledger: { events, head: "e".repeat(64), verified: true, note: null }, digest: `${events}`.padStart(64, "0") };
}
const criteriaWithApproval = (): CriteriaReviewResolution =>
  ({
    chainOk: true,
    problem: null,
    states: [],
    approved: [{ criterion: { id: "fabricated-criterion" }, fingerprint: "a".repeat(64), missions: [{ missionId: "m1", conditions: [] }], approvedAt: "2026-11-01T00:00:00Z", approverUserId: "u1", approvalRef: "ref-1" }],
  }) as unknown as CriteriaReviewResolution;
const emptyCriteria: CriteriaReviewResolution = { chainOk: true, problem: null, states: [], approved: [] };

const device = (interpretation: InterpretationSnapshot, criteria: CriteriaReviewResolution, iState: "registry_only" | "verified" | "error" = "verified", cState: "loading" | "verified" | "error" = "verified") => ({
  interpretation: { snapshot: interpretation, state: iState },
  criteria: { resolution: criteria, state: cState },
});

async function ready(source: "server_confirmed" | "local_offline", d: ReturnType<typeof device>): Promise<ReportScientificSnapshot> {
  const r = await buildScientificSnapshot({ source, datasetToken: 7, datasetFingerprint: "9".repeat(64), device: d });
  if (r.kind !== "ready") throw new Error(`expected ready, got ${r.kind}`);
  return r.snapshot;
}

describe("P72.10 server-confirmed reports use only the shared versioned rules", () => {
  it("gives the same scientific fingerprint for devices with 26, 9 and 0 local events and with device approvals", async () => {
    const shared = (await sharedScientificState()).interpretation;
    const devices = [
      device(await deviceTasksOnly(26), emptyCriteria),
      device(await deviceTasksOnly(9), emptyCriteria),
      device(shared, emptyCriteria),
      device(await deviceWithApproval(), criteriaWithApproval()),
      device(shared, emptyCriteria, "error", "error"),
    ];
    const prints = new Set<string>();
    const texts = new Set<string>();
    for (const d of devices) {
      const s = await ready("server_confirmed", d);
      expect(s.basis).toBe("shared_versioned_rules");
      expect(s.interpretation.ledger.events).toBe(0);
      expect(s.interpretation.records.some((r) => r.basis === "device_local")).toBe(false);
      expect(s.criteria.approved).toHaveLength(0);
      prints.add(await scientificFingerprint(s, OFF));
      texts.add(describeScientificInputs(s, OFF));
    }
    expect(prints.size).toBe(1);
    expect(texts.size).toBe(1);
    expect([...texts][0]).toStartWith(SHARED_RULES_LABEL);
  });

  it("is immutable", async () => {
    const s = await ready("server_confirmed", device(await deviceTasksOnly(0), emptyCriteria));
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.interpretation.records)).toBe(true);
    expect(Object.isFrozen(s.criteria)).toBe(true);
  });

  it("identifies all 14 bundled rule sets by the SHA-256 of their content", async () => {
    const ids = await sharedRuleSetIdentities();
    expect(ids).toHaveLength(14);
    for (const r of SHARED_RULE_SETS) {
      const id = ids.find((x) => x.id === r.id)!;
      expect(id.sha256).toBe(createHash("sha256").update(canonicalJson(r.data)).digest("hex"));
    }
  });

  it("changes the scientific fingerprint when the literature demonstration option changes", async () => {
    const s = await ready("server_confirmed", device(await deviceTasksOnly(0), emptyCriteria));
    expect(await scientificFingerprint(s, ON)).not.toBe(await scientificFingerprint(s, OFF));
    expect(describeScientificInputs(s, ON)).toContain("ON (provisional, not clinically validated)");
  });
});

describe("P72.10 device-local decisions are disclosed, never applied, in server-confirmed reports", () => {
  it("says nothing when the device holds only opened tasks or drafts (they never change content)", async () => {
    expect(deviceDecisionsNotAppliedStatement(summarizeDeviceDecisions({ snapshot: await deviceTasksOnly(26), state: "verified" }, { resolution: emptyCriteria, state: "verified" }))).toBeNull();
  });
  it("names device approvals and approved criteria as NOT APPLIED", async () => {
    const note = deviceDecisionsNotAppliedStatement(summarizeDeviceDecisions({ snapshot: await deviceWithApproval(), state: "verified" }, { resolution: criteriaWithApproval(), state: "verified" }));
    expect(note).toStartWith("NOT APPLIED: 1 interpretation approval/revocation decision(s) and 1 approved reference criterion/criteria");
  });
});

describe("P72.10 local offline reports use and label this device's verified decisions", () => {
  it("applies the device decisions under the device-local label with a different fingerprint", async () => {
    const d = device(await deviceWithApproval(), criteriaWithApproval());
    const local = await ready("local_offline", d);
    const server = await ready("server_confirmed", d);
    expect(local.basis).toBe("device_local_decisions");
    expect(local.criteria.approved).toHaveLength(1);
    expect(describeScientificInputs(local, OFF)).toStartWith(DEVICE_DECISIONS_LABEL);
    expect(await scientificFingerprint(local, OFF)).not.toBe(await scientificFingerprint(server, OFF));
  });
  it("waits while the device decisions are loading", async () => {
    const r = await buildScientificSnapshot({ source: "local_offline", datasetToken: 1, datasetFingerprint: "x", device: device(await deviceTasksOnly(0), emptyCriteria, "registry_only") });
    expect(r.kind).toBe("waiting");
    const c = await buildScientificSnapshot({ source: "local_offline", datasetToken: 1, datasetFingerprint: "x", device: device(await deviceTasksOnly(0), emptyCriteria, "verified", "loading") });
    expect(c.kind).toBe("waiting");
  });
  it("is blocked with an actionable reason when the device decisions cannot be read", async () => {
    for (const d of [device(await deviceTasksOnly(0), emptyCriteria, "error"), device(await deviceTasksOnly(0), emptyCriteria, "verified", "error")]) {
      const r = await buildScientificSnapshot({ source: "local_offline", datasetToken: 1, datasetFingerprint: "x", device: d });
      expect(r.kind).toBe("blocked");
      if (r.kind === "blocked") expect(r.reason).toContain("Reload the page");
    }
  });
});

describe("P72.10 readiness requires scientific inputs bound to the displayed dataset", () => {
  const datasetReady: DatasetReadiness = {
    version: "p72.9-report-dataset.v1",
    state: "ready_server_confirmed",
    exportAllowed: true,
    source: "server_confirmed",
    dataStatus: "examinations_present",
    title: "Server-confirmed report",
    detail: "",
    offerLocalOffline: false,
  };
  const dataset = { token: 7, source: "server_confirmed" as const, datasetFingerprint: "9".repeat(64) };
  it("blocks while preparing, for another dataset, and when blocked; allows only the bound snapshot", async () => {
    const s = await ready("server_confirmed", device(await deviceTasksOnly(0), emptyCriteria));
    expect(withScientificReadiness(datasetReady, null, dataset).exportAllowed).toBe(false);
    expect(withScientificReadiness(datasetReady, { kind: "ready", snapshot: s }, { ...dataset, token: 8 }).state).toBe("scientific_preparing");
    expect(withScientificReadiness(datasetReady, { kind: "ready", snapshot: s }, { ...dataset, datasetFingerprint: "0" }).exportAllowed).toBe(false);
    const blocked = withScientificReadiness(datasetReady, { kind: "blocked", reason: "Unreadable." }, dataset);
    expect(blocked.state).toBe("scientific_blocked");
    expect(blocked.exportAllowed).toBe(false);
    const ok = withScientificReadiness(datasetReady, { kind: "ready", snapshot: s }, dataset);
    expect(ok.exportAllowed).toBe(true);
    expect(ok.scientific).toBe(s);
  });
  it("never upgrades a dataset that is not ready", async () => {
    const s = await ready("server_confirmed", device(await deviceTasksOnly(0), emptyCriteria));
    const r = withScientificReadiness({ ...datasetReady, exportAllowed: false, state: "server_failed" }, { kind: "ready", snapshot: s }, dataset);
    expect(r.exportAllowed).toBe(false);
    expect(r.state).toBe("server_failed");
  });
});

describe("P72.10 provenance prints separate clinical and scientific fingerprints", () => {
  it("lists both fingerprints, the rule sets and the AI statement", () => {
    const lines = reportProvenanceLines({
      missionId: "m1",
      crewMemberId: "c1",
      provenance: "synthetic",
      period: "2026-11-01 to 2026-11-07",
      examinationDates: ["2026-11-01"],
      observations: 1,
      series: 1,
      datasetFingerprint: "1".repeat(64),
      basis: "server_confirmed",
      serverRecords: 1,
      readinessVersion: "v",
      exportedAt: "2026-11-15T00:00:00Z",
      scientificFingerprint: "2".repeat(64),
      ruleSets: ["a v1", "b v1"],
      aiContent: "none — every statement in this report comes from the deterministic engine.",
    });
    expect(lines).toContain(`Clinical observations fingerprint (SHA-256 of exactly the observations evaluated): ${"1".repeat(64)}`);
    expect(lines.some((l) => l.startsWith("Scientific interpretation inputs fingerprint") && l.endsWith("2".repeat(64)))).toBe(true);
    expect(lines).toContain("Rule sets (2): a v1; b v1");
    expect(lines).toContain("Automated AI wording: none — every statement in this report comes from the deterministic engine.");
  });
});
