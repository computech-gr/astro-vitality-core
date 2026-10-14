// P35.4.1 — English presentation layer for Nikolas' Greek scientific handbooks.
// The Greek source catalogs are never modified; English is joined by stable ID.
// Translation is reference-only and pending independent scientific review.
import cardiovascularSource from "../../../data/scientific/cardiovascular-handbook.catalog.v1.json";
import cardiovascularEn from "../../../data/scientific/cardiovascular-handbook.en.v1.json";
import boneSource from "../../../data/scientific/bone-health-handbook-v7.catalog.json";
import boneEn from "../../../data/scientific/bone-health-handbook-v7.en.json";

export type ScientificLocale = "en" | "el";
export const DEFAULT_SCIENTIFIC_LOCALE: ScientificLocale = "en";

/** Greek letters outside scientific notation. δ (delta notation) and α/β prefixes in marker names are allowed. */
const GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/;
const ALLOWED_SCIENTIFIC_GREEK = /δ44\/42Ca|β-CTX|TNF-α|Δ(?=[A-Z])|μ(?=[A-Za-z])/g;
export function containsUntranslatedGreek(text: string): boolean {
  return GREEK.test(text.replace(ALLOWED_SCIENTIFIC_GREEK, ""));
}

export interface LocalizedCardiovascularMetric {
  id: string;
  name: string;
  group: string;
  unit: string;
  sourceUnit: string;
  activation: string;
  reviewStatus: string;
  biology: string | null;
  context: string | null;
  linkage: string | null;
  reviewFlag?: string;
  source: { biology_el: string; context_el: string };
}

export interface LocalizedRelationship {
  index: number;
  activation: string;
  combination: string | null;
  interpretationAndLimits: string | null;
  reviewFlag?: string;
  source: { combination_el: string; interpretationAndLimits_el: string };
}

export interface LocalizedBoneVariable {
  id: string;
  name: string;
  category: string;
  handbookEvidenceTier: string;
  reviewStatus: string;
  operationalStatus: string;
  what: string | null;
  specimen: string | null;
  unit: string | null;
  increase: string | null;
  decrease: string | null;
  implementationNotes: string | null;
  reviewFlag?: string;
  source: {
    measurementDescription_el: string;
    biologicalInterpretation_el: string;
    implementationNotes_el: string;
  };
}

const safe = (text: string | undefined): string | null =>
  text && !containsUntranslatedGreek(text) ? text : null;

export function localizedCardiovascularMetrics(): LocalizedCardiovascularMetric[] {
  const en = new Map(
    cardiovascularEn.metrics.map((item) => [
      item.id,
      item as typeof item & { reviewFlag?: string },
    ]),
  );
  return cardiovascularSource.metrics.map((metric) => {
    const t = en.get(metric.id);
    return {
      id: metric.id,
      name: metric.name,
      group: metric.group,
      unit: metric.unit,
      activation: metric.activation,
      reviewStatus: metric.reviewStatus,
      biology: safe(t?.biology_en),
      context: safe(t?.context_en),
      linkage: safe(t?.linkage_en),
      ...(t?.reviewFlag ? { reviewFlag: t.reviewFlag } : {}),
      source: { biology_el: metric.biology, context_el: metric.context },
    };
  });
}

export function localizedCardiovascularRelationships(): LocalizedRelationship[] {
  return cardiovascularSource.relationshipExamples.map((rel, index) => {
    const t = cardiovascularEn.relationshipExamples.find((item) => item.index === index) as
      | { combination_en: string; interpretationAndLimits_en: string; reviewFlag?: string }
      | undefined;
    return {
      index,
      activation: rel.activation,
      combination: safe(t?.combination_en),
      interpretationAndLimits: safe(t?.interpretationAndLimits_en),
      ...(t?.reviewFlag ? { reviewFlag: t.reviewFlag } : {}),
      source: {
        combination_el: rel.combination,
        interpretationAndLimits_el: rel.interpretationAndLimits,
      },
    };
  });
}

export function localizedBoneVariables(): LocalizedBoneVariable[] {
  const en = new Map(
    boneEn.variables.map((item) => [item.id, item as typeof item & { reviewFlag?: string }]),
  );
  return boneSource.variables.map((variable) => {
    const t = en.get(variable.id);
    return {
      id: variable.id,
      name: variable.name,
      category: variable.category,
      handbookEvidenceTier: variable.handbookEvidenceTier,
      reviewStatus: variable.reviewStatus,
      operationalStatus: variable.operationalStatus,
      what: safe(t?.what_en),
      specimen: safe(t?.specimen_en),
      unit: safe(t?.unit_en),
      increase: safe(t?.increase_en),
      decrease: safe(t?.decrease_en),
      implementationNotes: safe(t?.implementationNotes_en),
      ...(t?.reviewFlag ? { reviewFlag: t.reviewFlag } : {}),
      source: {
        measurementDescription_el: variable.measurementDescription,
        biologicalInterpretation_el: variable.biologicalInterpretation,
        implementationNotes_el: variable.implementationNotes,
      },
    };
  });
}

export const HANDBOOK_LOCALIZATION_STATUS = {
  defaultLocale: DEFAULT_SCIENTIFIC_LOCALE,
  translationStatus: cardiovascularEn.translationStatus,
  cardiovascularSourceSha256: cardiovascularEn.sourceSha256,
  boneSourceSha256: boneEn.sourceSha256,
  clinicalActivation: false,
} as const;

export const BONE_CATEGORY_LABELS: Record<string, string> = {
  bone_resorption: "Bone resorption",
  bone_formation: "Bone formation",
  calcium_endocrine: "Calcium & endocrine regulation",
  urine_stone: "Urine chemistry & kidney-stone risk",
  imaging_strength: "Imaging & bone strength",
  exercise_nutrition_exposure: "Exercise, nutrition & exposure",
};
export const boneCategoryLabel = (category: string): string =>
  BONE_CATEGORY_LABELS[category] ??
  category.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
