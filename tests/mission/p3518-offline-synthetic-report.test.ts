import { describe, expect, test } from "bun:test";
import { buildSyntheticDemoDataset } from "../../src/domain/mission-access/synthetic-demo-dataset";
import { buildOfflineDemoReport, offlineDemoReportCsv } from "../../src/domain/mission-access/offline-demo-report";

describe("P35.18 synthetic offline report",()=>{
 const dataset=buildSyntheticDemoDataset("MISSION_TEST");
 test("covers all domains without claiming clinical authorization",()=>{const r=buildOfflineDemoReport(dataset);expect(r.metrics.length).toBe(6);expect(r.domainCount).toBe(4);expect(r.observationCount).toBe(18);expect(r.reportMode).toBe("non_clinical_offline_preview");expect(r.metrics.every(m=>m.points.length===3)).toBe(true);});
 test("deterministic arithmetic only",()=>{const r=buildOfflineDemoReport(dataset);expect(r.metrics.find(m=>m.metric==="resting_heart_rate")?.delta).toBe(1);expect(buildOfflineDemoReport(dataset)).toEqual(r);});
 test("CSV has 18 provenance-labelled observations",()=>{const csv=offlineDemoReportCsv(buildOfflineDemoReport(dataset));expect(csv.trim().split("\n").length).toBe(19);expect(csv).toContain("synthetic_generated");});
 test("fails closed for real-origin or import-enabled records",()=>{expect(()=>buildOfflineDemoReport({...dataset,importAuthorized:true})).toThrow();expect(()=>buildOfflineDemoReport({...dataset,observations:[{...dataset.observations[0],provenance:"real" as never}]})).toThrow();});
});
