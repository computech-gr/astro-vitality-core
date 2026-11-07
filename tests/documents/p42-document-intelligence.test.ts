import { describe, expect, it, beforeAll } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extractPdfGeometry, repoPath } from "./p42-pdf-helpers";
import {
  documentLinesFromText,
  inferDecimalConvention,
  parseResultValue,
  reconstructDocumentTables,
  type DocumentReconstruction,
  type ReconstructedObservation,
} from "@/domain/health-intelligence/document-table-reconstruction";
import {
  applyDocumentTimestamp,
  canResolveIdentityConflict,
  compareDocumentIdentity,
  diagnoseDocumentIntake,
  diagnoseExtractionError,
  extractionBlockingReason,
  identityHoldReason,
  isBulkSelectable,
  rowExtractionEvidence,
  summarizeDocumentRows,
} from "@/domain/health-intelligence/document-intake-review";
import {
  intakeRowExclusionReason,
  intakeSelectionCounts,
  isIntakeRowEligible,
  setIntakeReviewSelection,
  type IntakeReviewRow,
} from "@/domain/health-intelligence/intake-review-selection";
import {
  buildUnknownBiomarkerTerms,
  classifyWithGovernedExtensions,
} from "@/domain/health-intelligence/unknown-biomarker-review";

// P42 regression on the owner-supplied SYNTHETIC examination ("SIMULATED DATA — NOT A
// CLINICAL RECORD"): real PDF bytes → the app's PDF.js geometry path → table reconstruction.
const PDF = repoPath("tests/fixtures/p42/Alex_Morgan_Complete_Examination_2026-11-07.pdf");
const PDF_SHA = "d1bd6d9fa7efe52187e8dd9f861fe0917c016440a61a78074027f60cbdcabdfb";

type Row = IntakeReviewRow & { documentSha256: string; excerpt: string };
const toRow = (o: ReconstructedObservation, i: number, r: DocumentReconstruction): Row => {
  const value = o.value || (o.valueKind === "ambiguous_number" ? "" : o.rawValue);
  return {
    key: `r${i}`,
    label: o.label,
    value,
    unit: o.unit,
    observedAt: "",
    classification: classifyWithGovernedExtensions({ label: o.label, unit: o.unit }).classification,
    selected: false,
    documentSha256: PDF_SHA,
    excerpt: o.excerpt,
    extraction: { ...rowExtractionEvidence(o, r.rulesVersion), proposedValue: value },
  };
};

let recon: DocumentReconstruction;
let byNo: Map<string, ReconstructedObservation>;
beforeAll(async () => {
  const g = await extractPdfGeometry(PDF);
  expect(g.pages).toBe(9);
  recon = reconstructDocumentTables(documentLinesFromText(g.text, g.linePages, g.geometry));
  byNo = new Map(recon.observations.map((o) => [o.sourceRowNumber ?? "", o]));
});

describe("P42 Alex Morgan examination (actual PDF fixture)", () => {
  it("is the exact supplied document", () => {
    expect(createHash("sha256").update(readFileSync(PDF)).digest("hex")).toBe(PDF_SHA);
  });

  it("reconstructs exactly 328 numbered source rows, each once, with no gaps", () => {
    expect(recon.observations.length).toBe(328);
    expect(recon.observations.map((o) => Number(o.sourceRowNumber))).toEqual(
      Array.from({ length: 328 }, (_, i) => i + 1),
    );
    expect(recon.rowNumbers).toEqual({ max: 328, missing: [], duplicated: [] });
    expect(recon.headers.length).toBeGreaterThanOrEqual(9); // repeated on every page
    expect(recon.decimalConvention).toBe("dot");
  });

  it("assigns the four medical sections with the expected counts and source pages", () => {
    expect(recon.sections.map((s) => [s.heading, s.domain, s.rows])).toEqual([
      ["BONE HEALTH", "bone", 54],
      ["CARDIOVASCULAR HEALTH", "cardiovascular", 94],
      // P39 heading rules v1 are frozen: "Immune Monitoring" is kept verbatim but not mapped.
      ["IMMUNE MONITORING", null, 81],
      ["BEHAVIORAL HEALTH", "behavioral", 99],
    ]);
    const at = (n: string) => {
      const o = byNo.get(n)!;
      return [o.label, o.rawValue, o.unit, o.page, o.section.heading];
    };
    expect(at("1")).toEqual(["CTX / β-CTX", "1.82", "ng/mL", 1, "BONE HEALTH"]);
    expect(at("33")).toEqual(["Urinary Uric Acid", "910", "mg/24 h", 1, "BONE HEALTH"]);
    expect(at("54")).toEqual(["Microgravity Exposure", "118", "days", 2, "BONE HEALTH"]);
    expect(at("55")).toEqual(["HR", "132", "beats/min", 2, "CARDIOVASCULAR HEALTH"]);
    expect(at("148")).toEqual(["Cortisol", "31", "μg/dL at 08:00", 4, "CARDIOVASCULAR HEALTH"]);
    expect(at("149")).toEqual(["WBC", "2.1", "×10³/μL", 5, "IMMUNE MONITORING"]);
    expect(at("229")).toEqual(["Symptom diary", "Present", "yes/no", 7, "IMMUNE MONITORING"]);
    expect(at("230")).toEqual(["Total sleep time", "3.1", "h/night", 7, "BEHAVIORAL HEALTH"]);
    expect(at("328")).toEqual(["Data completeness", "76", "% complete", 9, "BEHAVIORAL HEALTH"]);
    expect(recon.observations.every((o) => o.excerpt.startsWith(`${o.sourceRowNumber} | `))).toBe(
      true,
    );
  });

  it("handles negative, thousands-separated, clock-time, categorical and Unicode values without coercion", () => {
    const v = (n: string) => {
      const o = byNo.get(n)!;
      return [o.rawValue, o.value, o.valueKind, o.unit];
    };
    expect(v("25")).toEqual(["−0.8", "-0.8", "numeric", "‰"]);
    expect(v("91")).toEqual(["−28", "-28", "numeric", "mmHg"]);
    expect(v("34")).toEqual(["1,400", "1400", "numeric", "mg/24 h"]);
    expect(v("310")).toEqual(["5,200", "5200", "numeric", "ppm"]);
    expect(v("66")).toEqual(["1,100", "1100", "numeric", "dyn·s/cm⁵"]);
    expect(v("233")).toEqual(["02:10", "", "time_of_day", "hh:mm"]);
    expect(v("77")).toEqual(["Sinus tachycardia", "", "categorical", "ECG finding"]);
    expect(v("107")).toEqual(["Present", "", "yes_no", "yes/no"]);
    expect(v("227")).toEqual(["Detected", "", "yes_no", "PCR result"]);
    expect(v("244")).toEqual(["0", "0", "numeric", "min"]);
    const kinds: Record<string, number> = {};
    for (const o of recon.observations) kinds[o.valueKind] = (kinds[o.valueKind] ?? 0) + 1;
    expect(kinds).toEqual({ numeric: 316, yes_no: 7, time_of_day: 4, categorical: 1 });
    expect(
      recon.observations.filter((o) => o.issues.some((i) => i.code === "unsupported_result_type"))
        .length,
    ).toBe(12);
    expect(recon.observations.filter((o) => o.confidence === "high").length).toBe(316);
  });

  it("keeps repeated measurements with their own provenance and never merges them", () => {
    const repeats = recon.observations
      .filter((o) => o.repeat)
      .map((o) => [o.sourceRowNumber, o.label, o.repeat!.firstRowNumber, o.repeat!.sameValue]);
    expect(repeats).toEqual([
      ["184", "IL-6", "144", true],
      ["190", "TNF-α", "145", true],
      ["196", "hsCRP", "143", true],
      ["219", "25(OH) vitamin D", "18", true],
      ["221", "PTH", "17", true],
      ["232", "Sleep efficiency", "210", true],
    ]);
    // Same label, different unit: noted, never combined.
    expect(byNo.get("116")!.sameLabelOtherUnits).toEqual(["NASA-TLX/100"]);
    expect(byNo.get("213")!.repeat).toBeNull();
  });

  it("reads identity and the stated examination time without guessing the date order", () => {
    const id = recon.identity;
    expect([id.patientName, id.recordId, id.examDateText, id.examTimeText]).toEqual([
      "Alex Morgan",
      "SIM-261107-0042",
      "07/11/2026",
      "09:30 UTC",
    ]);
    expect(id.declaresSimulated).toBe(true);
    expect(id.timestampCandidates.map((c) => [c.value, c.precision])).toEqual([
      ["2026-11-07T09:30:00Z", "instant"],
      ["2026-11-07", "date"],
      ["2026-07-11T09:30:00Z", "instant"],
      ["2026-07-11", "date"],
    ]);
    expect(id.timestampNote).toContain("choose explicitly");
  });

  it("separates extraction from catalog matching and bulk selection", () => {
    const rows = recon.observations.map((o, i) => toRow(o, i, recon));
    const status: Record<string, number> = {};
    for (const r of rows)
      status[r.classification.status] = (status[r.classification.status] ?? 0) + 1;
    expect(status).toEqual({ matched: 56, unit_review_required: 97, unclassified: 175 });
    // Nothing is eligible before an observation time is applied explicitly.
    expect(rows.filter(isIntakeRowEligible).length).toBe(0);
    const instant = recon.identity.timestampCandidates[0]!;
    const dated = applyDocumentTimestamp(rows, PDF_SHA, instant);
    expect(dated.applied).toBe(328);
    expect(
      dated.rows.every(
        (r) => r.observedAt === "2026-11-07T09:30:00Z" && r.datePrecision === "instant",
      ),
    ).toBe(true);
    expect(dated.rows.every((r) => !r.selected)).toBe(true);
    // 56 matched − 1 yes/no result (Thrombus on ultrasound) = 55 eligible.
    expect(dated.rows.filter(isIntakeRowEligible).length).toBe(55);
    expect(
      intakeRowExclusionReason(dated.rows.find((r) => r.label === "Thrombus on ultrasound")!),
    ).toContain("Unsupported result type");
    // Bulk selection skips the 3 matched in-document repeats (IL-6, TNF-α, hsCRP).
    const bulk = setIntakeReviewSelection(dated.rows, true);
    expect(bulk.rows.filter((r) => r.selected).length).toBe(52);
    expect(bulk.rows.filter((r) => r.selected && r.extraction?.repeat).length).toBe(0);
    expect(bulk.reviewerConfirmed).toBe(false);
    expect(intakeSelectionCounts(bulk.rows)).toMatchObject({
      selected: 52,
      eligible: 55,
      bulkEligible: 52,
      allSelected: true,
    });
    const summary = summarizeDocumentRows(dated.rows, 328);
    expect(summary).toMatchObject({
      sourceRows: 328,
      extracted: 328,
      safelyMatched: 55,
      ambiguous: 0,
      unitReview: 97,
      unknown: 175,
      unsupportedResultTypes: 12,
      potentialDuplicates: 6,
    });
    expect(
      diagnoseDocumentIntake({
        textLength: 1,
        reconstruction: recon,
        rows: dated.rows,
        identity: null,
      }).code,
    ).toBe("review_required");
  });

  it("links unknown rows to one Unknown Biomarker term per label + exact unit", () => {
    const rows = recon.observations.map((o, i) => ({
      ...toRow(o, i, recon),
      sourceKind: "pdf_text",
      sourceLabel: "Document",
    }));
    const terms = buildUnknownBiomarkerTerms(rows);
    // 25(OH) Vitamin D (row 18) and 25(OH) vitamin D (row 219) are one term with two observations.
    const vitd = terms.filter(
      (t) => t.normalizedLabel === "25(oh) vitamin d" && t.originalUnit === "ng/mL",
    );
    expect(vitd.length).toBe(1);
    expect(new Set(terms.map((t) => t.termId)).size).toBe(terms.length);
    expect(terms.length).toBeLessThan(
      rows.filter((r) => r.classification.status !== "matched").length,
    );
  });
});

describe("P42 identity and examination integrity", () => {
  const identity = () => recon.identity;
  it("matches the selected crew label and blocks other astronauts", () => {
    expect(
      compareDocumentIdentity(identity(), {
        crewLabel: "Alex Morgan — Synthetic Astronaut",
        provenance: "synthetic",
      }).status,
    ).toBe("match");
    expect(
      compareDocumentIdentity(identity(), { crewLabel: "Alex Morganson", provenance: "synthetic" })
        .status,
    ).toBe("conflict");
    const other = compareDocumentIdentity(identity(), {
      crewLabel: "Astronaut Test 01",
      provenance: "synthetic",
    });
    expect(other).toMatchObject({ status: "conflict", resolvable: true });
    expect(identityHoldReason(other, false)).toContain("Ground Medical must resolve");
    expect(identityHoldReason(other, true)).toBeNull();
    expect(canResolveIdentityConflict(["crew_self"])).toBe(false);
    expect(canResolveIdentityConflict(["ground_medical"])).toBe(true);
  });
  it("never lets a simulated document be saved as a real measurement", () => {
    const check = compareDocumentIdentity(identity(), {
      crewLabel: "Alex Morgan — Synthetic Astronaut",
      provenance: "real",
    });
    expect(check).toMatchObject({ status: "conflict", resolvable: false });
    expect(identityHoldReason(check, true)).not.toBeNull();
  });
  it("holds rows with an unresolved identity conflict", () => {
    const row = { ...toRow(byNo.get("59")!, 0, recon), observedAt: "2026-11-07T09:30:00Z" };
    expect(isIntakeRowEligible(row)).toBe(true);
    expect(isIntakeRowEligible({ ...row, identityHold: "Identity conflict" })).toBe(false);
    expect(isIntakeRowEligible({ ...row, rejected: true })).toBe(false);
    expect(isBulkSelectable({ ...row, rejected: true })).toBe(false);
  });
  it("reports two patients in one document as a conflict", () => {
    const r = reconstructDocumentTables([
      { text: "Patient: A. Person | Record: X1", page: 1 },
      { text: "Test | Result | Unit", page: 1 },
      { text: "HR | 60 | bpm", page: 1 },
      { text: "Patient: B. Other", page: 2 },
    ]);
    expect(r.identity.patientNames).toEqual(["A. Person", "B. Other"]);
    expect(
      compareDocumentIdentity(r.identity, { crewLabel: "A. Person", provenance: "synthetic" })
        .status,
    ).toBe("conflict");
  });
});

describe("P42 alternative layouts (clearly labelled SYNTHETIC test text)", () => {
  const lines = (text: string, page = 1) => text.split("\n").map((t) => ({ text: t, page }));

  it("reordered columns with a reference interval kept verbatim", () => {
    const r = reconstructDocumentTables(
      lines(
        "Unit | Result | Reference range | Analyte\nmg/L | 3.1 | 0.0-5.0 | CRP\nbpm | 61 | — | HR",
      ),
    );
    expect(r.observations.map((o) => [o.label, o.value, o.unit, o.referenceInterval])).toEqual([
      ["CRP", "3.1", "mg/L", "0.0-5.0"],
      ["HR", "61", "bpm", "—"],
    ]);
  });

  it("Greek headings, decimal commas and dot thousands", () => {
    const r = reconstructDocumentTables(
      lines(
        "Α/Α | Εξέταση | Αποτέλεσμα | Μονάδα | Τιμές αναφοράς\n1 | Ασβέστιο | 9,8 | mg/dL | 8,5-10,5\n2 | Αιμοπετάλια | 1.250 | /μL | —\n3 | CTX | 0,45 | ng/mL | —",
      ),
    );
    expect(r.decimalConvention).toBe("comma");
    expect(r.observations.map((o) => [o.label, o.value, o.unit])).toEqual([
      ["Ασβέστιο", "9.8", "mg/dL"],
      ["Αιμοπετάλια", "1250", "/μL"],
      ["CTX", "0.45", "ng/mL"],
    ]);
  });

  it("multi-page table with repeated header, page furniture and a wrapped label", () => {
    const r = reconstructDocumentTables([
      { text: "No. | Test | Result | Unit", page: 1 },
      { text: "1 | Serum calcium total | 9.1 | mg/dL", page: 1 },
      { text: "2 | Urinary calcium per", page: 1 },
      { text: "creatinine ratio", page: 1 },
      { text: "Lab footer | Page 1", page: 1 },
      { text: "No. | Test | Result | Unit", page: 2 },
      { text: "3 | Phosphate | 3.4 | mg/dL", page: 2 },
      { text: "Lab footer | Page 2", page: 2 },
    ]);
    expect(r.observations.map((o) => [o.sourceRowNumber, o.label, o.page])).toEqual([
      ["1", "Serum calcium total", 1],
      ["2", "Urinary calcium per creatinine ratio", 1],
      ["3", "Phosphate", 2],
    ]);
    // Row 2 had too few cells: kept and flagged, never dropped.
    expect(r.observations[1]!.issues.map((i) => i.code)).toEqual([
      "column_mismatch",
      "wrapped_row_merged",
      "missing_unit",
    ]);
    expect(r.rowNumbers.missing).toEqual([]);
  });

  it("missing, ambiguous and alternative units are never inferred", () => {
    const r = reconstructDocumentTables(
      lines(
        "Test | Result | Unit\nVitamin D | 31 | ng/mL ή nmol/L\nFerritin | 80 | —\nCRP | 1,400 | mg/L",
      ),
    );
    expect(
      r.observations.map((o) => o.issues.filter((i) => i.blocking).map((i) => i.code)),
    ).toEqual([["ambiguous_unit"], ["missing_unit"], ["ambiguous_number"]]);
    expect(r.observations[1]!.unit).toBe("");
  });

  it("multiple result columns require an explicit choice", () => {
    const r = reconstructDocumentTables(lines("Test | Result | Result | Unit\nHR | 60 | 62 | bpm"));
    expect(r.observations[0]!.issues.some((i) => i.code === "multiple_results" && i.blocking)).toBe(
      true,
    );
  });

  it("explicit offsets are kept; time without timezone yields a date only", () => {
    const withOffset = reconstructDocumentTables(
      lines("Date: 2026-11-07 | Time: 11:30 +02:00\nTest | Result | Unit\nHR | 60 | bpm"),
    );
    expect(withOffset.identity.timestampCandidates.map((c) => c.value)).toEqual([
      "2026-11-07T11:30:00+02:00",
      "2026-11-07",
    ]);
    const noZone = reconstructDocumentTables(
      lines("Date: 25/11/2026 | Time: 09:30\nTest | Result | Unit\nHR | 60 | bpm"),
    );
    expect(noZone.identity.timestampCandidates.map((c) => c.value)).toEqual(["2026-11-25"]);
    expect(noZone.identity.timestampNote).toContain("no stated timezone");
  });

  it("a page without any table yields an actionable diagnosis, not a generic zero", () => {
    const r = reconstructDocumentTables(lines("Discharge letter\nThe patient is well."));
    expect(
      diagnoseDocumentIntake({ textLength: 30, reconstruction: r, rows: [], identity: null }).code,
    ).toBe("table_reconstruction_failed");
    expect(
      diagnoseDocumentIntake({ textLength: 0, reconstruction: r, rows: [], identity: null }).code,
    ).toBe("no_extractable_text");
    expect(diagnoseExtractionError("On-device OCR unavailable: x").code).toBe("ocr_unavailable");
    expect(diagnoseExtractionError("Unsupported file type. Supported: .csv").code).toBe(
      "unsupported_format",
    );
    const unknownOnly = reconstructDocumentTables(
      lines("Test | Result | Unit\nZeta marker | 4 | AU"),
    );
    const rows = unknownOnly.observations.map((o, i) => toRow(o, i, unknownOnly));
    expect(
      diagnoseDocumentIntake({ textLength: 10, reconstruction: unknownOnly, rows, identity: null })
        .code,
    ).toBe("no_catalog_matches");
  });
});

describe("P42 stage D value normalization", () => {
  it("normalizes only safe, reversible forms and keeps the raw text", () => {
    const p = (raw: string, c: "dot" | "comma" | "unknown" = "unknown") => {
      const v = parseResultValue(raw, c);
      return [v.kind, v.normalized];
    };
    expect(p("1.2e3")).toEqual(["numeric", "1200"]);
    expect(p("4.5×10³")).toEqual(["numeric", "4500"]);
    expect(p("2.5 x 10^-3")).toEqual(["numeric", "0.0025"]);
    expect(p("<5")).toEqual(["comparator", ""]);
    expect(p("4.5–6.0")).toEqual(["range", ""]);
    expect(p("1,400")).toEqual(["ambiguous_number", ""]);
    expect(p("1,400", "dot")).toEqual(["numeric", "1400"]);
    expect(p("1,82")).toEqual(["numeric", "1.82"]);
    expect(p("1,82", "dot")).toEqual(["ambiguous_number", ""]);
    expect(p("12 500")).toEqual(["numeric", "12500"]);
    expect(p("−0.8")).toEqual(["numeric", "-0.8"]);
    expect(p("Not detected")).toEqual(["yes_no", ""]);
    expect(p("Αρνητικό")).toEqual(["yes_no", ""]);
    expect(inferDecimalConvention(["1.5", "2,5"])).toBe("conflicting");
  });

  it("an explicit reviewer edit clears a value hold; the unit hold needs a unit edit", () => {
    const r = reconstructDocumentTables([
      { text: "Test | Result | Unit", page: 1 },
      { text: "CRP | 1,400 | mg/L ή g/L", page: 1 },
    ]);
    const row = toRow(r.observations[0]!, 0, r);
    expect(row.value).toBe("");
    expect(extractionBlockingReason(row)).toContain("thousands separator or a decimal comma");
    expect(extractionBlockingReason({ ...row, value: "1400" })).toContain("alternative units");
    expect(extractionBlockingReason({ ...row, value: "1400", unit: "mg/L" })).toBeNull();
  });
});

describe("P42 real on-device OCR output (tesseract.js engine bundled with the app)", () => {
  // Verbatim OCR of the same PDF rasterized at 150 dpi with the app's local eng language pack.
  const fixture = JSON.parse(
    readFileSync(repoPath("tests/fixtures/p42/alex-morgan-ocr-tesseract.v1.json"), "utf8"),
  ) as {
    sourceSha256: string;
    lines: { page: number; text: string }[];
  };
  it("recovers rows only as low-confidence review rows and reports the gaps OCR introduced", () => {
    expect(fixture.sourceSha256).toBe(PDF_SHA);
    const r = reconstructDocumentTables(fixture.lines, { ocr: true });
    expect(r.headers.length).toBe(0); // OCR never read the table header rows
    expect(r.observations.length).toBe(319);
    expect(r.rowNumbers.missing).toEqual([17, 73, 114, 138, 139, 149, 181, 182, 187, 223]);
    expect(r.rowNumbers.duplicated).toEqual(["7"]);
    expect(r.observations.every((o) => o.confidence === "low")).toBe(true);
    const rows = r.observations.map((o, i) => ({
      ...toRow(o, i, r),
      observedAt: "2026-11-07T09:30:00Z",
    }));
    expect(rows.some(isBulkSelectable)).toBe(false);
    // Against the text layer, OCR changed values (e.g. lost decimal points), labels and units.
    const truth = new Map(recon.observations.map((o) => [o.sourceRowNumber, o]));
    const changedValues = r.observations.filter(
      (o) => truth.get(o.sourceRowNumber)?.value !== o.value,
    ).length;
    expect(changedValues).toBe(18);
    expect(r.identity.patientName).toBe("Alex Morgan");
  });
});

describe("P42 privacy and offline boundaries", () => {
  it("the reconstruction and review rules are pure and never transmit anything", () => {
    for (const file of [
      "src/domain/health-intelligence/document-table-reconstruction.ts",
      "src/domain/health-intelligence/document-intake-review.ts",
    ]) {
      const src = readFileSync(repoPath(file), "utf8");
      expect(src).not.toMatch(
        /\bfetch\(|supabase|XMLHttpRequest|localStorage|indexedDB|navigator\.sendBeacon/,
      );
    }
    const workspace = readFileSync(repoPath("src/components/unified-intake-workspace.tsx"), "utf8");
    expect(workspace).not.toContain("medical-document-extraction");
    expect(workspace).not.toContain("no matching candidate rows");
  });
});
