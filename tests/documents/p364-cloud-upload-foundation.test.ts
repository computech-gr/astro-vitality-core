import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateSyntheticCloudHandoff, type SyntheticCloudHandoff } from "../../src/domain/biomarkers/p364-cloud-handoff-contract";
const component = readFileSync("src/components/mission-document-review-workbench.tsx", "utf8");
const valid: SyntheticCloudHandoff = {schema:"mitochondria.p36.4.synthetic-cloud-handoff.v1",syntheticOnly:true,missionId:"test",crewMemberId:"crew",observedOn:"2026-10-15",sourceFilename:"synthetic.pdf",sourceSha256:"a".repeat(64),observations:[{metricId:"cv-001",value:"72",unit:"bpm",sourceExcerpt:"HR: 72 bpm"}]};
describe("P36.4 synthetic cloud foundation",()=>{
 it("has an accessible upload control with the existing local processing gate",()=>{expect(component).toContain("Upload Laboratory Report");expect(component).toContain("fileInputRef.current?.click()");expect(component).toContain("disabled={!eligible || !consent || busy}");});
 it("does not misrepresent cloud submission as active",()=>{expect(component).toContain("Cloud submission is not active");expect(component).toContain("Submit reviewed synthetic measurements to Cloud — pending activation");});
 it("validates bounded, synthetic, unique handoffs",()=>{expect(validateSyntheticCloudHandoff(valid)).toBe(true);expect(validateSyntheticCloudHandoff({...valid,syntheticOnly:false} as unknown as SyntheticCloudHandoff)).toBe(false);expect(validateSyntheticCloudHandoff({...valid,observations:[...valid.observations,...valid.observations]})).toBe(false);});
});
