import {describe,it,expect} from "bun:test";
import {extractUniversalDocumentRows} from "@/domain/bone-health/universal-document-rows";
import {parseBoneCorrectedText} from "@/domain/bone-health/document-extraction";
import {IMMUNE_MEASUREMENT_PROFILE, BEHAVIORAL_MEASUREMENT_PROFILE} from "@/domain/health-measurements/profiles";

describe("P33 conservative universal document rows",()=>{
  it("does not invent dates or silently save extracted values",()=>{
    const r=parseBoneCorrectedText("bone-002 NTX 14 nmol 2026-10-28T10:32:22Z Synthetic Lab", "test.pdf");
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0]?.observedAt).toBe("");
    expect(r.matches[0]?.selected).toBe(false);
    expect(r.matches[0]?.value).toBe(14);
  });
  it("rejects mismatched catalog labels",()=>{
    const r=extractUniversalDocumentRows("IMM-001 Completely unrelated 6.2 mg/L",IMMUNE_MEASUREMENT_PROFILE);
    expect(r.rows).toHaveLength(0);
  });
  it("rejects missing unit",()=>{
    expect(extractUniversalDocumentRows("BSC-002 Sleep efficiency 86",BEHAVIORAL_MEASUREMENT_PROFILE).rows).toHaveLength(0);
  });
});
