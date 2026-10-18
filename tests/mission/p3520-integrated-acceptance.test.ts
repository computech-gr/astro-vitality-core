import { describe, expect, test } from "bun:test";
import { buildIntegratedDemoBundle } from "../../src/domain/mission-access/offline-demo-workflow";
import { buildSyntheticDemoDataset } from "../../src/domain/mission-access/synthetic-demo-dataset";
import { getDemoAcceptanceGates, inspectOfflineDemoArtifact } from "../../src/domain/mission-access/offline-demo-acceptance";

describe("P35.20 integrated offline acceptance", () => {
  test("accepts exact generated bundle for current mission", () => {
    expect(inspectOfflineDemoArtifact(buildIntegratedDemoBundle("MISSION_TEST"), "MISSION_TEST")).toEqual({ok:true,kind:"integrated_bundle",missionCode:"MISSION_TEST",observationCount:18});
  });
  test("accepts exact generated dataset for current mission", () => {
    expect(inspectOfflineDemoArtifact(buildSyntheticDemoDataset("MISSION_TEST"), "MISSION_TEST").ok).toBe(true);
  });
  test("rejects altered report and additional fields", () => {
    const bundle=buildIntegratedDemoBundle("MISSION_TEST");
    expect(inspectOfflineDemoArtifact({...bundle, extra:"unexpected"},"MISSION_TEST").ok).toBe(false);
    expect(inspectOfflineDemoArtifact({...bundle, report:{...bundle.report, altered:true}},"MISSION_TEST").ok).toBe(false);
  });
  test("rejects cross-mission artifacts", () => {
    expect(inspectOfflineDemoArtifact(buildIntegratedDemoBundle("OTHER_DEMO"),"MISSION_TEST")).toEqual({ok:false,reason:"Mission mismatch: artifact belongs to another mission"});
  });
  test("rejects malformed, unsupported and altered dataset", () => {
    expect(inspectOfflineDemoArtifact(null,"MISSION_TEST").ok).toBe(false);
    expect(inspectOfflineDemoArtifact({missionCode:"MISSION_TEST",schema:"unknown"},"MISSION_TEST").ok).toBe(false);
    const dataset=buildSyntheticDemoDataset("MISSION_TEST");
    expect(inspectOfflineDemoArtifact({...dataset, observations:[...dataset.observations.slice(0,17), {...dataset.observations[17], value:999}]},"MISSION_TEST").ok).toBe(false);
  });
  test("does not misrepresent gated features as approved", () => {
    const gates=getDemoAcceptanceGates();
    expect(gates.length).toBe(6);
    expect(gates.filter(g=>g.status==="verified_local").map(g=>g.id)).toEqual(["offline"]);
    expect(gates.find(g=>g.id==="admin")?.status).toBe("requires_owner_approval");
    expect(gates.find(g=>g.id==="medical")?.status).toBe("requires_independent_acceptance");
  });
});
