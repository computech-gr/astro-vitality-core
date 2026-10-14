import { describe,expect,test } from "bun:test";
import { normalizeAccession,researchEndpoint,parseResearchSamples,createResearchExport } from "../../src/domain/nasa-research/import";
describe("P35.1 research-only NASA ingestion",()=>{
 test("validates accession before constructing fixed-host NASA URLs",()=>{expect(normalizeAccession(" osd-48 ")).toBe("OSD-48");expect(()=>normalizeAccession("OSD-48/../../admin")).toThrow();expect(researchEndpoint("OSD-48","dataset")).toBe("https://visualization.osdr.nasa.gov/biodata/api/v2/dataset/OSD-48/");});
 test("rejects untrusted rows and cross-accession payloads",()=>{expect(()=>parseResearchSamples([{ "id.accession":"OSD-49"}],"OSD-48")).toThrow();expect(()=>parseResearchSamples({bad:true},"OSD-48")).toThrow();});
 test("keeps imported NASA sample metadata research-only",()=>{const rows=parseResearchSamples([{"id.accession":"OSD-48","id.sample name":"sample1","study.characteristics.organism":"Mus musculus"}],"OSD-48");expect(rows[0].classification).toBe("research_only");const out=createResearchExport("OSD-48",rows,"2026-10-14T00:00:00.000Z");expect(out.clinicalActivation).toBe(false);expect(out.subjectBinding).toBe("none");});
});
