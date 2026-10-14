import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import cvSource from "../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import cvEn from "../../data/scientific/cardiovascular-handbook.en.v1.json";
import boneSource from "../../data/scientific/bone-health-handbook-v7.catalog.json";
import boneEn from "../../data/scientific/bone-health-handbook-v7.en.json";
import {
  BONE_CATEGORY_LABELS,
  DEFAULT_SCIENTIFIC_LOCALE,
  containsUntranslatedGreek,
  localizedBoneVariables,
  localizedCardiovascularMetrics,
  localizedCardiovascularRelationships,
} from "../../src/domain/scientific-localization/handbooks";

const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("P35.4.1 unified handbook English localization", () => {
  it("leaves the Greek source catalogs byte-identical", () => {
    expect(sha("data/scientific/cardiovascular-handbook.catalog.v1.json")).toBe(
      "4e08ddac0d53801c1fcac1d2e315fa216b709ff170397a8ce0d8616155988bb8",
    );
    expect(sha("data/scientific/bone-health-handbook-v7.catalog.json")).toBe(
      "13cadc0007684958c979645a262a66b28dd71ae1e9cdf24f923a618166b5b413",
    );
    expect(cvEn.sourceSha256).toBe(cvSource.sourceSha256);
    expect(boneEn.sourceSha256).toBe(boneSource.source.sha256);
  });
  it("defaults to English", () => expect(DEFAULT_SCIENTIFIC_LOCALE).toBe("en"));
  it("covers all 96 cardiovascular markers and 8 relationships with Greek-free English", () => {
    const m = localizedCardiovascularMetrics();
    expect(m).toHaveLength(96);
    expect(new Set(cvEn.metrics.map((x) => x.id))).toEqual(
      new Set(cvSource.metrics.map((x) => x.id)),
    );
    for (const x of m) {
      expect(x.biology && x.context && x.linkage).toBeTruthy();
      for (const t of [x.unit, x.biology!, x.context!, x.linkage!, x.reviewFlag ?? ""])
        expect(containsUntranslatedGreek(t)).toBe(false);
      const src = cvSource.metrics.find((s) => s.id === x.id)!;
      expect([x.name, x.group, x.sourceUnit, x.source.biology_el, x.source.context_el]).toEqual([
        src.name,
        src.group,
        src.unit,
        src.biology,
        src.context,
      ]);
    }
    const r = localizedCardiovascularRelationships();
    expect(r).toHaveLength(8);
    expect(
      r.every(
        (x) => x.combination && x.interpretationAndLimits && x.activation === "research_only",
      ),
    ).toBe(true);
  });
  it("covers all 63 bone variables with Greek-free English and preserved metadata", () => {
    const v = localizedBoneVariables();
    expect(v).toHaveLength(63);
    for (const x of v) {
      for (const t of [x.what, x.specimen, x.unit, x.increase, x.decrease, x.implementationNotes]) {
        expect(t).toBeTruthy();
        expect(containsUntranslatedGreek(t!)).toBe(false);
      }
      expect(BONE_CATEGORY_LABELS[x.category]).toBeTruthy();
      const src = boneSource.variables.find((s) => s.id === x.id)!;
      expect(x.source.measurementDescription_el).toBe(src.measurementDescription);
      expect(x.operationalStatus).toBe("reference_only");
    }
  });
  it("keeps representative terminology, formulas and limitations", () => {
    const m = localizedCardiovascularMetrics();
    expect(m.find((x) => x.id === "cv-007")!.context).toContain("MAP≈DBP+(SBP−DBP)/3");
    expect(m.find((x) => x.id === "cv-021")!.biology).toBe("(EDV−ESV)/EDV×100");
    expect(m.find((x) => x.id === "cv-057")!.context).toContain("FEU≠DDU");
    expect(m.find((x) => x.id === "cv-074")!.linkage).toBe("Bone module");
    expect(localizedBoneVariables().find((x) => x.id === "bone-026")!.unit).toBe("δ44/42Ca ‰");
    expect(m.find((x) => x.id === "cv-015")!.reviewFlag).toBeTruthy();
  });
  it("detects untranslated Greek but allows scientific notation", () => {
    expect(containsUntranslatedGreek("Πίεση")).toBe(true);
    expect(containsUntranslatedGreek("TNF-α and β-CTX, δ44/42Ca ‰, ΔHR, μIU/mL")).toBe(false);
  });
  it("keeps clinical activation disabled", () => {
    expect(cvEn.clinicalActivation).toBe(false);
    expect(boneEn.operationalActivation).toBe(false);
  });
});
