import { describe, expect, test } from "bun:test";
import { buildIntegratedDemoBundle, validateOfflineSyntheticDataset, DEMO_WORKFLOW_STAGES } from "../../src/domain/mission-access/offline-demo-workflow";
import { buildSyntheticDemoDataset } from "../../src/domain/mission-access/synthetic-demo-dataset";

describe("P35.19 integrated offline synthetic demo",()=>{
 test("five ordered stages are navigable",()=>{expect(DEMO_WORKFLOW_STAGES.map(s=>s.id)).toEqual(["identity","documents","devices","domains","report"]);});
 test("bundle includes report and 18 synthetic observations with no authority",()=>{const b=buildIntegratedDemoBundle("MISSION_TEST");expect(b.dataset.observations).toHaveLength(18);expect(b.report.observationCount).toBe(18);expect(b.administratorAccessGranted).toBe(false);expect(b.canonicalImportAuthorized).toBe(false);});
 test("only exact deterministic fixture can be inspected",()=>{const d=buildSyntheticDemoDataset("DEMO-LOCAL");expect(validateOfflineSyntheticDataset(d).ok).toBe(true);expect(validateOfflineSyntheticDataset({...d,observations:[...d.observations.slice(0,17),{...d.observations[17],value:99}]}).ok).toBe(false);});
 test("rejects real or untrusted data",()=>{expect(validateOfflineSyntheticDataset({synthetic:true}).ok).toBe(false);expect(validateOfflineSyntheticDataset(null).ok).toBe(false);});
});
