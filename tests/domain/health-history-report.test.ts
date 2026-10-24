import { describe, expect, test } from "bun:test";
import { buildHealthHistoryReport, healthReportPlainText } from "@/domain/health-intelligence/health-history-report";
import { UNIFIED_OBSERVATION_SCHEMA, type UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
const sample = (id:string, value:string, missionId="mission-a", provenance:"real"|"synthetic"="real"): UnifiedObservation => ({schema:UNIFIED_OBSERVATION_SCHEMA,id,missionId,crewMemberId:"crew-a",metricId:"lab.ctx",domain:"bone",value,originalUnit:"pg/mL",observedAt:id==="obs-0001"?"2026-01-01T00:00:00Z":"2026-02-01T00:00:00Z",recordedAt:"2026-02-02T00:00:00Z",source:{kind:"manual",label:"Lab report"},provenance,quality:{reviewerConfirmed:true},reviewState:"accepted",status:"active"});
describe("health history report",()=>{
 test("mission isolation and provenance separation",()=>{const r=buildHealthHistoryReport([sample("obs-0001","1"),sample("obs-0002","2","mission-b"),sample("obs-0003","3","mission-a","synthetic")],"mission-a","crew-a","real");expect(r.observations).toHaveLength(1);expect(r.excluded.otherProvenance).toBe(1)});
 test("no diagnosis or fabricated history",()=>{const r=buildHealthHistoryReport([],"mission-a","crew-a","real");expect(r.observations).toHaveLength(0);expect(healthReportPlainText(r)).toContain("Not a medical diagnosis");expect(r.findings.some(f=>f.kind==="limitation")).toBe(true)});
 test("trends cite actual evidence IDs",()=>{const r=buildHealthHistoryReport([sample("obs-0001","1"),sample("obs-0002","2")],"mission-a","crew-a","real");expect(r.findings.some(f=>f.kind==="exploratory"&&f.observationIds.length===2)).toBe(true)});
});
