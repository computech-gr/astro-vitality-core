import {describe,expect,test} from "bun:test";
import {extractCsvCandidates,extractTextTableCandidates} from "../../src/domain/health-intelligence/universal-intake-parser";
import {classifyIntakeObservation} from "../../src/domain/health-domains/unified-intake-classification";
describe("universal candidate extraction",()=>{
 test("variable header skipped and dates preserved",()=>{const r=extractCsvCandidates("variable,value,unit,observed_at\ncv-001,64,bpm,2026-10-20T08:00:00Z");expect(r.rows).toHaveLength(1);expect(r.rows[0]?.observedAt).toBe("2026-10-20T08:00:00Z");});
 test("quoted CSV and reordered columns",()=>{const r=extractCsvCandidates('unit,observed_at,label,value\nbpm,2026-10-20T08:00:00Z,"Heart rate",64');expect(r.rows[0]?.label).toBe("Heart rate");});
 test("invalid date cannot silently become an observation",()=>{expect(extractCsvCandidates('label,value,unit,observed_at\nHR,60,bpm,not-a-date').rows).toHaveLength(0);});
 test("P36 ID is matched only with approved unit",()=>{expect(classifyIntakeObservation({label:'cv-001',unit:'bpm'}).status).toBe('matched');expect(classifyIntakeObservation({label:'cv-001',unit:'ms'}).status).toBe('unit_review_required');});
 test("PDF text table row retains date",()=>{const r=extractTextTableCandidates('IMM-001 6.4 10^9/L 2026-10-20T09:00:00Z SYNTHETIC Lab');expect(r[0]?.observedAt).toBe('2026-10-20T09:00:00Z');});
});
