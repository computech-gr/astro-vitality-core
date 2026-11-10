/**
 * P60 — deterministic cross-domain clinical pattern engine (pure, no I/O, no AI).
 *
 * Runs ONLY in the literature-based synthetic demonstration (the caller passes `active: true` only
 * for synthetic provenance with provisional literature mode on). It reads report rows that the
 * premium model has already built — values exactly as recorded, never converted — and binds them to
 * concepts by EXACT identity + unit from data/scientific/p60-clinical-pattern-library.v1.json.
 *
 * For each pattern it keeps five kinds of statement apart:
 *   observed     — a recorded value compared with a cited threshold (or with no threshold, as context)
 *   measurement  — measurement-quality concerns that must be resolved before interpretation
 *   pattern      — the clinically meaningful combination, phrased as a pattern for review, never a diagnosis
 *   hypotheses   — explicitly labelled possible explanations
 *   missing      — clinical context that is not recorded and would change the interpretation
 * Every confirmation step is conditioned on Ground Medical judgement. A pattern never changes a
 * result's clinical class; its warning priority is a separate axis (rules PP-1..PP-5 in the library).
 */
import library from "../../../data/scientific/p60-clinical-pattern-library.v1.json";
import { WARNING_PRIORITY_LABEL, type WarningPriority } from "./p59-warning-priority";

export const P60_PATTERN_LIBRARY_SCHEMA = "mitochondria.p60-clinical-pattern-library.v1" as const;

/** Minimal row shape (structurally satisfied by the premium model's ResultRow). */
export interface PatternRow {
  recordId: string;
  metricId: string;
  unit: string;
  valueText: string;
  date: string; // YYYY-MM-DD
  name: string;
  displayClass: "RED" | "AMBER" | "NORMAL" | "NEUTRAL";
  basis: "approved" | "provisional" | "none";
  bandLabel: string | null;
  /** Significant-change (trend review) flag from the existing P56.1 rules — not a medical-review priority. */
  reviewHigh: boolean;
  /** Held for measurement verification (data-quality warning or P57.1 hold). */
  held: boolean;
}

export type PatternDomain = "electrolytes" | "cardiovascular" | "inflammation" | "coagulation" | "metabolic" | "bone" | "recovery";
export type LinkKind = "established" | "co-occurrence" | "hypothesis";
export interface PatternLink { from: string; to: string; kind: LinkKind; label: string; sourceId: string | null }

export interface ClinicalPattern {
  id: string;
  title: string;
  domains: PatternDomain[];
  priority: WarningPriority;
  priorityLabel: string;
  rules: string[];
  /** A measurement check applies (shown as a separate badge; never lowers the priority). */
  dataCheck: boolean;
  /**
   * P60.1: the results the pattern-level DATA CHECK refers to (empty when no check applies). A pattern-level
   * check is never an observation-level data-quality flag; it only marks which series must be verified.
   */
  dataCheckRecordIds?: string[];
  /** One-paragraph card evidence: the key values with dates. */
  headline: string;
  /** Why this priority (rule + the converging items). */
  rationale: string;
  observed: string[];
  measurement: string[];
  pattern: string;
  hypotheses: string[];
  supporting: string[];
  contradicting: string[];
  missing: string[];
  confirm: string[];
  nextStep: string;
  sources: string[];
  recordIds: string[];
  concepts: string[];
}
export interface PatternResult {
  active: boolean;
  patterns: ClinicalPattern[];
  links: PatternLink[];
  /** Short statement for the methodology section. */
  basis: string;
}

// ------------------------------------------------------------------ library access (fail closed)

interface Band { min?: number; max?: number; points: number }
interface Library {
  schema: string;
  status: string;
  concepts: { key: string; label: string; members: { id: string; unit: string }[] }[];
  sources: { id: string; citation: string; url: string; tier: string; quote?: string }[];
  thresholds: Record<string, Record<string, unknown>>;
  priorityRules: { id: string; priority: WarningPriority; text: string }[];
}
export function patternLibrary(raw: unknown = library): Library | null {
  const l = raw as Partial<Library> | null;
  if (!l || l.schema !== P60_PATTERN_LIBRARY_SCHEMA || !Array.isArray(l.concepts) || !Array.isArray(l.sources) || !l.thresholds || !Array.isArray(l.priorityRules)) return null;
  // Each identity+unit may belong to one concept only (no ambiguous binding).
  const seen = new Set<string>();
  for (const c of l.concepts) for (const m of c.members) {
    const k = `${m.id}|${m.unit}`;
    if (seen.has(k)) return null;
    seen.add(k);
  }
  return l as Library;
}
export function sourceCitation(id: string, raw: unknown = library): string | null {
  return patternLibrary(raw)?.sources.find((s) => s.id === id)?.citation ?? null;
}
const SHORT: Record<string, string> = {
  "rcp-news2-2017": "NEWS2, RCP 2017",
  "singer-2016-sepsis3": "Sepsis-3, 2016",
  "evans-2021-ssc": "SSC 2021",
  "cdc-fever": "CDC",
  "pearson-2003-cdc-aha": "CDC/AHA 2003",
  "bts-2017-oxygen": "BTS 2017",
  "drew-2010-tdp": "AHA/ACCF 2010",
  "sfe-2022-hyponatraemia": "Society for Endocrinology 2022",
  "esc-2019-pe": "ESC 2019",
  "khovidhunkit-2004": "Khovidhunkit 2004",
  "esc-2021-hf": "ESC 2021",
  "nagueh-2016-diastolic": "ASE/EACVI 2016",
  "ada-standards-glycemic": "ADA Standards of Care",
  "vasikaran-2011-iof": "IOF-IFCC 2011",
  "task-force-1996-hrv": "ESC/NASPE 1996",
  "gabay-1999": "Gabay 1999",
  "statpearls-hyperkalemia": "StatPearls",
  "nih-ods-vitd": "NIH ODS",
  "nsf-2017-sleep": "NSF 2017",
};
export const shortSource = (id: string) => SHORT[id] ?? id;

// ------------------------------------------------------------------ helpers

const NUMERIC = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
interface Obs { row: PatternRow; v: number }
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const dayText = (d: string) => `${Number(d.slice(8, 10))} ${MONTH[Number(d.slice(5, 7)) - 1]}`;
const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const near = (a: string, b: string, days = 1) => Math.abs(dayNum(a) - dayNum(b)) <= days;
const uniq = <T,>(xs: T[]) => xs.filter((x, i) => xs.indexOf(x) === i);
const val = (o: Obs) => `${o.row.valueText} ${o.row.unit}`;
const at = (o: Obs) => `${val(o)} on ${dayText(o.row.date)}`;
const fmtNum = (v: number) => String(Number(v.toFixed(3)));
/** P61.2: stable observation order — date, then biomarker identity and value; record IDs only as the last tie-breaker. */
const byStableObservationOrder = (a: Obs, b: Obs) =>
  a.row.date.localeCompare(b.row.date) || a.row.name.localeCompare(b.row.name) || a.row.metricId.localeCompare(b.row.metricId) ||
  a.row.unit.localeCompare(b.row.unit) || a.v - b.v || a.row.recordId.localeCompare(b.row.recordId);
/** P61.2: whole days between the earliest and latest observation. */
const spanDays = (xs: readonly Obs[]) => (xs.length ? Math.max(...xs.map((o) => dayNum(o.row.date))) - Math.min(...xs.map((o) => dayNum(o.row.date))) : 0);
/** P61.2: shortest gap (days) from a high potassium (>= 5.5) to a later low one. */
const kSwingGap = (k: readonly Obs[], lowCut: number) => {
  let best = Infinity;
  for (const h of k) if (h.v >= 5.5) for (const l of k) if (l.v < lowCut && dayNum(l.row.date) >= dayNum(h.row.date)) best = Math.min(best, dayNum(l.row.date) - dayNum(h.row.date));
  return best;
};
/** P61.2: "16 Nov, 4 days later" for the observation following `o` in its chronological series. */
const nextAfter = (xs: readonly Obs[], o: Obs) => {
  const n = xs[xs.indexOf(o) + 1];
  if (!n) return "no later value";
  const d = dayNum(n.row.date) - dayNum(o.row.date);
  return `${n.row.valueText} ${n.row.unit} on ${dayText(n.row.date)}, ${d === 1 ? "the next day" : `${d} days later`}`;
};
/** P61.2: largest absolute change between consecutive results. */
const largestStep = (xs: readonly Obs[]) => {
  let best: { a: Obs; b: Obs } | null = null;
  for (let i = 1; i < xs.length; i++) if (!best || Math.abs(xs[i]!.v - xs[i - 1]!.v) > Math.abs(best.b.v - best.a.v)) best = { a: xs[i - 1]!, b: xs[i]! };
  return best;
};
/** P61.2: fold change described against the first value — peak/trough for 3+ results, first-to-last for two. */
const foldText = (xs: readonly Obs[]) => {
  const first = xs[0]!, last = xs.at(-1)!;
  if (xs.length <= 2 || first.v <= 0) {
    const r = last.v / first.v;
    return r >= 1 ? `${r.toFixed(1)}-fold rise` : `${(1 / r).toFixed(1)}-fold fall`;
  }
  const peak = xs.reduce((m, o) => (o.v > m.v ? o : m), first);
  const trough = xs.reduce((m, o) => (o.v < m.v ? o : m), first);
  const ext = peak.v / first.v >= first.v / trough.v ? peak : trough;
  const r = ext.v / first.v;
  return `${r >= 1 ? `${r.toFixed(1)}-fold rise to a peak` : `${(1 / r).toFixed(1)}-fold fall to a low`} on ${dayText(ext.row.date)}; last value ${last.row.valueText} ${last.row.unit} on ${dayText(last.row.date)}, ${fmtNum(last.v / first.v)}× the first`;
};
/** P61.2: one chronological series per biomarker + unit, ordered by name. */
const seriesOf = (xs: readonly Obs[]): Obs[][] => {
  const m = new Map<string, Obs[]>();
  for (const o of xs) m.set(`${o.row.name}|${o.row.metricId}|${o.row.unit}`, [...(m.get(`${o.row.name}|${o.row.metricId}|${o.row.unit}`) ?? []), o]);
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
};
/** P61.2: an applied (approved or provisional) criterion classifies the value above its limit. */
const classifiedHigh = (o: Obs) =>
  (o.row.displayClass === "AMBER" || o.row.displayClass === "RED") && /\b(above|high|raised|elevated)\b/i.test(o.row.bandLabel ?? "") && !/\b(below|low)\b/i.test(o.row.bandLabel ?? "");
const rank: Record<WarningPriority, number> = { HIGH_PRIORITY_MEDICAL_REVIEW: 0, DATA_CHECK: 1, MONITORING: 2, WITHIN_CRITERIA: 3, INSUFFICIENT_EVIDENCE: 4 };

function bandPoints(bands: Band[], v: number): number {
  for (const b of bands) if ((b.min === undefined || v >= b.min) && (b.max === undefined || v <= b.max)) return b.points;
  // Values between integer bands (e.g. 91.5 % SpO2) take the band of the nearest lower bound, never invented.
  const below = bands.filter((b) => b.min !== undefined && v >= b.min).sort((a, b) => (b.min ?? 0) - (a.min ?? 0))[0];
  return below?.points ?? 0;
}

// ------------------------------------------------------------------ engine

export function evaluateClinicalPatterns(rows: readonly PatternRow[], opts: { active: boolean; library?: unknown }): PatternResult {
  const off = (basis: string): PatternResult => ({ active: false, patterns: [], links: [], basis });
  if (!opts.active) return off("Cross-domain pattern analysis (P60) runs only in the literature-based synthetic demonstration; it is not applied to real data or without provisional literature mode.");
  const lib = patternLibrary(opts.library ?? library);
  if (!lib) return off("Cross-domain pattern library failed validation; no pattern analysis was performed (fail closed).");

  const conceptOf = new Map<string, string>();
  for (const c of lib.concepts) for (const m of c.members) conceptOf.set(`${m.id}|${m.unit}`, c.key);
  const byConcept = new Map<string, Obs[]>();
  const rowsByConcept = new Map<string, PatternRow[]>();
  for (const r of rows) {
    const k = conceptOf.get(`${r.metricId}|${r.unit}`);
    if (!k) continue;
    rowsByConcept.set(k, [...(rowsByConcept.get(k) ?? []), r]);
    if (!NUMERIC.test(r.valueText.trim())) continue;
    byConcept.set(k, [...(byConcept.get(k) ?? []), { row: r, v: Number(r.valueText) }]);
  }
  // P61.2: same-day members of one concept (e.g. P1NP and CTX) order by stable identity, never by random record IDs.
  for (const xs of byConcept.values()) xs.sort(byStableObservationOrder);
  const obs = (k: string) => byConcept.get(k) ?? [];
  const usable = (k: string) => obs(k).filter((o) => !o.row.held);
  const present = (k: string) => (rowsByConcept.get(k) ?? []).length > 0;
  const T = lib.thresholds as Record<string, Record<string, unknown>>;
  const num = (group: string, key: string) => Number((T[group] ?? {})[key]);
  const news = (T["news2"]?.["bands"] ?? {}) as Record<string, Band[]>;
  const newsPts = (k: "rr" | "spo2" | "sbp" | "hr" | "temp", o: Obs) => bandPoints(news[k] ?? [], o.v);
  const label = (k: string) => lib.concepts.find((c) => c.key === k)?.label ?? k;

  const patterns: ClinicalPattern[] = [];
  const make = (p: Omit<ClinicalPattern, "priorityLabel">): ClinicalPattern => ({ ...p, priorityLabel: WARNING_PRIORITY_LABEL[p.priority], recordIds: uniq(p.recordIds), sources: uniq(p.sources), missing: uniq(p.missing), confirm: uniq(p.confirm), dataCheckRecordIds: p.dataCheck ? uniq(p.dataCheckRecordIds ?? p.recordIds) : [] });
  const notRecorded = (k: string, text: string) => (present(k) ? [] : [`${text} — not recorded in this period.`]);

  // ---------------------------------------------------------------- 1. acute physiology + inflammation
  {
    const vitals: { k: "rr" | "spo2" | "sbp" | "hr" | "temp"; o: Obs; pts: number }[] = [];
    for (const k of ["rr", "spo2", "sbp", "hr", "temp"] as const) for (const o of usable(k)) vitals.push({ k, o, pts: newsPts(k, o) });
    const v3 = vitals.filter((x) => x.pts === 3);
    const v2 = vitals.filter((x) => x.pts === 2);
    const feverMin = num("fever", "min");
    const fever = usable("temp").filter((o) => o.v >= feverMin);
    const crpAbove = num("crpInflammation", "above");
    const crp = usable("hscrp").filter((o) => o.v > crpAbove);
    const il6 = usable("il6");
    const il6Rise = il6.length >= 2 && il6.some((o) => o.row.reviewHigh) && il6.at(-1)!.v > il6[0]!.v;
    const lact = usable("lactate").filter((o) => o.v > num("lactate", "above"));
    const qs = (() => {
      const out: string[] = [];
      for (const r of usable("rr").filter((o) => o.v >= num("qsofa", "rrMin")))
        for (const s of usable("sbp").filter((o) => o.v <= num("qsofa", "sbpMax") && o.row.date === r.row.date))
          out.push(`${dayText(r.row.date)}: respiratory rate ${val(r)} and systolic pressure ${val(s)} meet 2 of the 3 qSOFA criteria (mentation not recorded) (${shortSource("singer-2016-sepsis3")}).`);
      return uniq(out);
    })();
    const inflam = fever.length > 0 || crp.length > 0 || il6Rise;
    if (v3.length || v2.length || inflam || lact.length) {
      const convergeInfl = fever.some((f) => crp.some((c) => near(f.row.date, c.row.date)));
      const priority: WarningPriority = v3.length || convergeInfl ? "HIGH_PRIORITY_MEDICAL_REVIEW" : "MONITORING";
      const rules = [...(v3.length ? ["PP-1"] : []), ...(convergeInfl ? ["PP-2"] : []), ...(priority === "MONITORING" ? ["PP-4"] : [])];
      const vText = (x: (typeof vitals)[number]) => `${label(x.k)} ${at(x.o)} (NEWS2 ${x.pts}-point band; RCP 2017)`;
      const observed = [
        ...v3.map((x) => `${vText(x)}.`),
        ...v2.map((x) => `${vText(x)}.`),
        ...fever.map((o) => `Body temperature ${at(o)} — at or above ${feverMin} °C, the CDC fever definition.`),
        ...crp.map((o) => `${o.row.name} ${at(o)} — above ${crpAbove} mg/L; CDC/AHA advise repeating the test and looking for a source of infection or inflammation.`),
        ...(il6Rise ? [`IL-6 ${il6.map(val).join(" → ")} (${dayText(il6[0]!.row.date)} → ${dayText(il6.at(-1)!.row.date)}) — significant change (trend review); no criterion classifies IL-6.`] : []),
        ...lact.map((o) => `Lactate ${at(o)} — above ${num("lactate", "above")} mmol/L (${shortSource("singer-2016-sepsis3")}); interpret with the sampling conditions.`),
        ...usable("pao2").map((o) => `Arterial oxygen (PaO2) ${at(o)} — recorded; no criterion is applied in this report.`),
        ...usable("spo2").filter((o) => o.v < num("spo2Target", "min")).map((o) => `SpO2 ${at(o)} is below the 94–98 % target range used for acutely ill adults (${shortSource("bts-2017-oxygen")}).`),
      ];
      const sameDay = uniq([...v3, ...v2].map((x) => x.o.row.date).filter((d) => fever.some((f) => f.row.date === d) || crp.some((c) => c.row.date === d)));
      const parts = uniq([
        ...(fever.length ? ["fever"] : []),
        ...(crp.length || il6Rise ? ["raised inflammatory markers"] : []),
        ...(v3.length || v2.length ? ["vital signs in NEWS2 warning bands"] : []),
        ...(lact.length ? ["a raised lactate"] : []),
      ]);
      // The title names fever only when a body temperature at or above the fever criterion is recorded.
      const title = inflam && (v3.length || v2.length)
        ? fever.length ? "Fever and inflammation with abnormal vital signs" : "Raised inflammatory markers with abnormal vital signs"
        : inflam ? "Raised inflammatory markers" : "Abnormal vital signs (early-warning parameters)";
      const later = vitals.filter((x) => [...v3, ...v2].some((y) => y.k === x.k && x.o.row.date > y.o.row.date && x.pts < y.pts));
      const crpIds = uniq(usable("hscrp").map((o) => o.row.metricId));
      const pattern = `${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "abnormal values"}`.replace(/^./, (c) => c.toUpperCase()) +
        `${sameDay.length ? ` were recorded together on ${sameDay.map(dayText).join(" and ")}` : " were recorded in this period"}. ` +
        (inflam && (v3.length || v2.length)
          ? "Together they describe an acute systemic physiological stress pattern that warrants prompt clinical assessment, including assessment for infection. This is a pattern for review, not a diagnosis."
          : inflam ? "Raised inflammatory markers indicate an inflammatory response whose source is not recorded; they do not identify a cause." : "Vital-sign values in NEWS2 warning bands call for clinical re-assessment; the cause is not established by the measurements.");
      patterns.push(make({
        id: "p60-acute-physiology", title, domains: ["inflammation", "cardiovascular"], priority, rules, dataCheck: false,
        headline: uniq(v3.map((x) => `${label(x.k).replace(/ \(SpO2\)/, "")} ${val(x.o)}`).concat(fever.map((o) => `temperature ${val(o)}`), crp.map((o) => `${o.row.name.replace(/\s*\(.*\)$/, "")} ${val(o)}`), il6Rise ? [`IL-6 ${il6.map((o) => o.row.valueText).join(" → ")} ${il6[0]!.row.unit}`] : [], lact.map((o) => `lactate ${val(o)}`))).join("; ").replace(/^./, (c) => c.toUpperCase()) + (sameDay.length ? ` (${sameDay.map(dayText).join(", ")}).` : "."),
        rationale: [
          v3.length ? `PP-1: ${uniq(v3.map((x) => label(x.k))).join(", ")} in a NEWS2 3-point band.` : "",
          convergeInfl ? "PP-2: fever and CRP above 10 mg/L on the same or adjacent dates." : "",
          priority === "MONITORING" ? "PP-4: single finding(s) without convergence." : "",
        ].filter(Boolean).join(" "),
        observed,
        measurement: [
          "Measurements carry calendar dates only; whether the vital signs were taken at the same time is not established.",
          ...(present("spo2") ? ["Pulse oximetry can read falsely low with poor perfusion, motion or cold extremities; the device and probe site are not recorded."] : []),
          ...(present("temp") ? ["Temperature measurement site and method are not recorded."] : []),
          ...(lact.length ? ["Lactate rises with exertion, tourniquet time and delayed analysis; sampling conditions are not recorded."] : []),
          ...(crpIds.length > 1 ? ["CRP results come from different identities (high-sensitivity and standard assays); they are listed separately and not compared as a trend."] : []),
        ],
        pattern,
        hypotheses: [
          ...(inflam ? ["Hypothesis: acute infection with a systemic inflammatory response (no source is recorded)."] : []),
          ...(inflam ? ["Hypothesis: non-infectious inflammation, such as tissue injury or strenuous exertion."] : []),
          ...(v3.length + v2.length >= 2 ? ["Hypothesis: a measurement or transcription error affecting several vital signs (less likely if they come from independent devices; devices are not recorded)."] : []),
        ],
        supporting: [...observed.slice(0, 6), ...qs],
        contradicting: later.length
          ? uniq(later.map((x) => `${label(x.k)} ${at(x.o)} is in a lower NEWS2 band than earlier — a possible improvement, not a resolution.`))
          : ["No recorded observation contradicts this pattern; the absence of a contradicting result is not evidence against it."],
        missing: [
          "Level of consciousness / mentation and supplemental oxygen — needed for NEWS2 and qSOFA.",
          "Symptoms, examination findings and time course.",
          ...notRecorded("wbc", "White-cell count and differential"),
          ...notRecorded("lactate", "Lactate"),
          ...(qs.length ? ["qSOFA is not recommended as a single screening tool (SSC 2021); it is shown only as context."] : []),
        ],
        confirm: [
          "Ground Medical to assess the crew member clinically: symptoms, mentation and a full repeated set of vital signs at the same time.",
          "If Ground Medical judges it appropriate: repeat CRP and a full blood count, and investigate a possible source of infection according to the clinical findings.",
          "Record supplemental oxygen and consciousness so that an aggregate NEWS2 score can be calculated.",
        ],
        nextStep: "Ground Medical clinical assessment now: symptoms, mentation and a complete repeated set of vital signs.",
        sources: ["rcp-news2-2017", ...(fever.length ? ["cdc-fever"] : []), ...(crp.length ? ["pearson-2003-cdc-aha"] : []), ...(qs.length || lact.length ? ["singer-2016-sepsis3", "evans-2021-ssc"] : []), ...(present("spo2") ? ["bts-2017-oxygen"] : [])],
        recordIds: [...vitals.filter((x) => x.pts >= 2).map((x) => x.o.row.recordId), ...fever.map((o) => o.row.recordId), ...crp.map((o) => o.row.recordId), ...(il6Rise ? il6.map((o) => o.row.recordId) : []), ...lact.map((o) => o.row.recordId)],
        concepts: uniq([...vitals.filter((x) => x.pts >= 2).map((x) => x.k), ...(fever.length ? ["temp"] : []), ...(crp.length ? ["hscrp"] : []), ...(il6Rise ? ["il6"] : []), ...(lact.length ? ["lactate"] : [])]),
      }));
    }
  }

  // ---------------------------------------------------------------- 2. electrolytes + QTc
  {
    const na = usable("sodium"), k = usable("potassium");
    const maxRise = num("sodiumRate", "maxRisePer24h");
    const naJumps: { a: Obs; b: Obs }[] = [];
    for (let i = 1; i < na.length; i++) if (dayNum(na[i]!.row.date) - dayNum(na[i - 1]!.row.date) <= 1 && Math.abs(na[i]!.v - na[i - 1]!.v) > maxRise) naJumps.push({ a: na[i - 1]!, b: na[i]! });
    const abnormal = (o: Obs) => o.row.displayClass === "AMBER" || o.row.displayClass === "RED";
    const naAbn = na.filter(abnormal), kAbn = k.filter(abnormal);
    const kLowCut = num("hypokalaemia", "below");
    const kLow = k.filter((o) => o.v < kLowCut);
    const kSwing = k.length >= 2 && kAbn.length >= 2 && Math.max(...k.map((o) => o.v)) >= 5.5 && Math.min(...k.map((o) => o.v)) < kLowCut;
    const qtcCut = num("qtc", "above");
    const qtc = usable("qtc").filter((o) => o.v > qtcCut);
    if (naAbn.length || kAbn.length || naJumps.length || qtc.length) {
      const pp3 = naJumps.some((j) => abnormal(j.a) && abnormal(j.b));
      const pp2 = qtc.some((q) => kLow.some((x) => near(q.row.date, x.row.date)));
      const priority: WarningPriority = pp3 || pp2 ? "HIGH_PRIORITY_MEDICAL_REVIEW" : "MONITORING";
      const rules = [...(pp3 ? ["PP-3"] : []), ...(pp2 ? ["PP-2"] : []), ...(priority === "MONITORING" ? ["PP-4"] : [])];
      const series = (xs: Obs[]) => `${xs.map((o) => o.row.valueText).join(" → ")} ${xs[0]!.row.unit}`;
      const observed = [
        ...(na.length ? [`Sodium ${series(na)} (${na.map((o) => dayText(o.row.date)).join(", ")})${naAbn.length ? `: ${uniq(naAbn.map((o) => `${o.row.valueText} — ${o.row.bandLabel ?? o.row.displayClass}`)).join("; ")} (provisional)` : ""}.`] : []),
        ...(k.length ? [`Potassium ${series(k)} (${k.map((o) => dayText(o.row.date)).join(", ")})${kAbn.length ? `: ${uniq(kAbn.map((o) => `${o.row.valueText} — ${o.row.bandLabel ?? o.row.displayClass}`)).join("; ")} (provisional)` : ""}.`] : []),
        ...naJumps.map((j) => `Sodium changed by ${Math.abs(j.b.v - j.a.v)} mmol/L between ${dayText(j.a.row.date)} and ${dayText(j.b.row.date)}; a rise of more than ${maxRise} mmol/L in 24 hours is the limit used to avoid osmotic demyelination when hyponatraemia is corrected (${shortSource("sfe-2022-hyponatraemia")}).`),
        ...qtc.map((o) => `QTc ${at(o)} — above ${qtcCut} ms, regarded as highly abnormal and associated with a higher risk of torsade de pointes (${shortSource("drew-2010-tdp")}).`),
      ];
      const title = qtc.length ? "Electrolyte shifts with a prolonged QTc" : "Possible electrolyte disturbance (sodium / potassium)";
      patterns.push(make({
        id: "p60-electrolytes", title, domains: ["electrolytes", "cardiovascular"], priority, rules,
        dataCheck: naJumps.length > 0 || kSwing,
        dataCheckRecordIds: [...naJumps.flatMap((j) => [j.a.row.recordId, j.b.row.recordId]), ...(kSwing ? k.map((o) => o.row.recordId) : [])],
        headline: [na.length ? `Sodium ${series(na)}` : "", k.length ? `potassium ${series(k)}` : "", ...qtc.map((o) => `QTc ${val(o)}`)].filter(Boolean).join("; ").replace(/^./, (c) => c.toUpperCase()) + ` (${uniq([...na, ...k, ...qtc].map((o) => o.row.date)).sort().map(dayText).join(", ")}).`,
        rationale: [
          pp3 ? `PP-3: sodium change above ${maxRise} mmol/L within one day with provisional abnormal values at both ends; a DATA CHECK also applies.` : "",
          pp2 ? `PP-2: QTc above ${qtcCut} ms with potassium below ${kLowCut} mmol/L within one day (both are recognised torsade de pointes risk factors).` : "",
          priority === "MONITORING" ? "PP-4: abnormal value(s) without convergence." : "",
        ].filter(Boolean).join(" "),
        observed,
        measurement: [
          ...(kSwing ? [kSwingGap(k, kLowCut) <= 1
            ? `A high potassium followed by a low value within one day is typical of in-vitro haemolysis or delayed processing of the first sample (pseudohyperkalaemia) (${shortSource("statpearls-hyperkalemia")}); the haemolysis index is not recorded.`
            : `High (${k.filter((o) => o.v >= 5.5).map(at).join(", ")}) and low (${k.filter((o) => o.v < kLowCut).map(at).join(", ")}) potassium results were recorded on different examinations; in-vitro haemolysis or delayed processing can falsely raise an individual result (pseudohyperkalaemia) (${shortSource("statpearls-hyperkalemia")}), and the haemolysis index is not recorded.`] : []),
          ...(naJumps.length ? ["A sodium change of this size without documented treatment first requires checking sample identity, intravenous-line contamination and the analyser method (direct or indirect ion-selective electrode)."] : []),
          ...(qtc.length ? ["The QT correction formula and the heart rate at the time of the ECG are not recorded; Bazett's formula overestimates QTc at faster heart rates, so manual re-measurement matters."] : []),
        ],
        pattern: [
          // P61.2: timing words follow the recorded dates ("within about one day" only when that is what the dates show).
          naAbn.length && kAbn.length ? (spanDays([...naAbn, ...kAbn]) <= 1 ? "Sodium and potassium moved in opposite directions across the abnormal range within about one day." : `Sodium and potassium were both outside the provisional reference range on more than one examination (sodium ${naAbn.map((o) => dayText(o.row.date)).join(", ")}; potassium ${kAbn.map((o) => dayText(o.row.date)).join(", ")}), over ${spanDays([...naAbn, ...kAbn])} days.`) : naAbn.length ? "Sodium is outside the provisional reference range." : kAbn.length ? "Potassium is outside the provisional reference range." : "",
          qtc.length && kLow.length ? `Low potassium (${kLow.map(at).join(", ")}) and a QTc of ${qtc.map((o) => o.row.valueText).join("/")} ms are both recognised risk factors for torsade de pointes${qtc.some((q) => kLow.some((x) => x.row.date === q.row.date)) ? "" : "; they were recorded on different days, so their co-existence is not established"}.` : qtc.length ? "A prolonged QTc is recorded without a simultaneous potassium result." : "",
          "If confirmed, these changes matter for heart rhythm and neurological safety; the measurements alone do not establish a cause.",
        ].filter(Boolean).join(" "),
        hypotheses: [
          "Hypothesis: pre-analytical or sample-handling error (haemolysis, line contamination, sample mix-up).",
          "Hypothesis: a true shift from fluid balance, treatment or illness (treatment and fluid balance are not recorded).",
          ...(qtc.length ? ["Hypothesis: QT-prolonging medicines (medication list not recorded)."] : []),
        ],
        supporting: observed,
        contradicting: [
          ...(naJumps.length ? ["The size and speed of the changes make measurement error at least as likely as a physiological change."] : []),
          ...(present("creatinine") ? [] : ["Without kidney-function results the electrolyte changes cannot be placed in context."]),
        ],
        missing: [
          ...notRecorded("magnesium", "Magnesium"),
          ...notRecorded("creatinine", "Creatinine / eGFR (kidney function)"),
          "Haemolysis index, sample processing time and analyser method.",
          "Fluid intake/output, intravenous therapy and medications.",
          ...(qtc.length ? ["ECG rhythm, heart rate at recording and QT correction formula."] : []),
        ],
        confirm: [
          "Do not change fluid, salt or potassium intake before Ground Medical review.",
          "If Ground Medical judges it appropriate: repeat sodium and potassium on a new, promptly processed sample with the haemolysis index, and add magnesium and kidney function.",
          ...(qtc.length ? ["If Ground Medical judges it appropriate: repeat a 12-lead ECG with manual QT measurement and the correction formula recorded."] : []),
        ],
        nextStep: qtc.length ? "Ground Medical review of electrolytes and ECG: repeat sodium, potassium and magnesium on a new sample and a 12-lead ECG if the clinician judges it appropriate." : "Repeat sodium and potassium on a new, promptly processed sample under Ground Medical supervision.",
        sources: ["sfe-2022-hyponatraemia", ...(kSwing ? ["statpearls-hyperkalemia"] : []), ...(qtc.length ? ["drew-2010-tdp"] : [])],
        recordIds: [...na, ...k, ...qtc].map((o) => o.row.recordId),
        concepts: uniq([...(na.length ? ["sodium"] : []), ...(k.length ? ["potassium"] : []), ...(qtc.length ? ["qtc"] : [])]),
      }));
    }
  }

  // ---------------------------------------------------------------- 3. coagulation markers
  {
    const cut = num("ddimer", "conventionalCutoff");
    const dd = usable("ddimer").filter((o) => o.v > cut);
    if (dd.length) {
      const fib = usable("fibrinogen");
      // P61.2: fibrinogen is called "raised" only when an applied criterion classifies it above its limit.
      const fibRaised = fib.filter(classifiedHigh);
      const resp = [...usable("spo2").filter((o) => newsPts("spo2", o) >= 2), ...usable("rr").filter((o) => newsPts("rr", o) >= 2)].filter((o) => dd.some((d) => near(d.row.date, o.row.date)));
      const inflam = [...usable("hscrp").filter((o) => o.v > num("crpInflammation", "above")), ...usable("temp").filter((o) => o.v >= num("fever", "min"))];
      const priority: WarningPriority = resp.length ? "HIGH_PRIORITY_MEDICAL_REVIEW" : "MONITORING";
      const observed = [
        ...dd.map((o) => `D-dimer ${at(o)} — above the conventional ${cut} mg/L FEU cut-off; cut-offs are assay-specific and age-adjusted above 50 years (${shortSource("esc-2019-pe")}); age is not recorded.`),
        ...fib.map((o) => fibRaised.includes(o) ? `Fibrinogen ${at(o)} — above the applied criterion (${o.row.bandLabel}).` : `Fibrinogen ${at(o)} — no criterion is applied; interpret against the performing laboratory's reference interval (not recorded).`),
        ...resp.map((o) => `${o.row.name} ${at(o)} (NEWS2 ${o.row.metricId && newsPts(conceptOf.get(`${o.row.metricId}|${o.row.unit}`) as "spo2" | "rr", o)}-point band).`),
      ];
      patterns.push(make({
        id: "p60-coagulation", title: fibRaised.length ? "Raised D-dimer with raised fibrinogen" : fib.length ? "Raised D-dimer; fibrinogen without an applicable criterion" : "Raised D-dimer", domains: ["coagulation"], priority, rules: [priority === "HIGH_PRIORITY_MEDICAL_REVIEW" ? "PP-2" : "PP-4"], dataCheck: false,
        headline: `${dd.map((o) => `D-dimer ${val(o)}`).concat(fib.map((o) => `fibrinogen ${val(o)}`)).join("; ")}${resp.length ? `, with ${uniq(resp.map((o) => `${o.row.name.replace(/\s*\(.*\)$/, "")} ${val(o)}`)).join(" and ")}` : ""} (${uniq([...dd, ...fib, ...resp].map((o) => o.row.date)).sort().map(dayText).join(", ")}).`,
        rationale: resp.length ? "PP-2: D-dimer above the cut-off converges with SpO2 or respiratory rate in a NEWS2 ≥2-point band within one day." : "PP-4: D-dimer above the cut-off without a converging respiratory finding.",
        observed,
        measurement: ["The D-dimer assay, its own cut-off and the sampling conditions are not recorded."],
        pattern: `${resp.length ? "A raised D-dimer together with low oxygen saturation or fast breathing is a combination clinicians weigh when estimating the probability of venous thromboembolism, including pulmonary embolism. " : "A raised D-dimer is non-specific. "}D-dimer and fibrinogen also rise with infection and inflammation (fibrinogen is an acute-phase protein; ${shortSource("gabay-1999")}), so these results cannot indicate thrombosis on their own (${shortSource("esc-2019-pe")}).`,
        hypotheses: [
          ...(inflam.length ? ["Hypothesis: acute-phase response to the inflammation recorded in the same period."] : []),
          "Hypothesis: venous thromboembolism — to be assessed clinically; not indicated by the measurements alone.",
        ],
        supporting: observed,
        contradicting: inflam.length ? [`Concurrent inflammation (${uniq(inflam.map((o) => `${o.row.name.replace(/\s*\(.*\)$/, "")} ${val(o)}`)).join("; ")}) is an alternative reason for the raised D-dimer${fib.length ? (fibRaised.length ? " and the raised fibrinogen" : " and for the fibrinogen values") : ""}.`] : ["No recorded result contradicts the finding; D-dimer specificity is low."],
        missing: ["Clinical probability assessment with a validated score (symptoms, signs, risk factors).", "Age (for the age-adjusted D-dimer cut-off) and the assay's own cut-off.", ...notRecorded("platelets", "Platelet count")],
        confirm: ["Ground Medical to estimate the clinical probability of venous thromboembolism with a validated score before deciding on further testing; imaging only if the clinician judges it indicated."],
        nextStep: "Ground Medical to assess the clinical probability of venous thromboembolism before any further testing.",
        sources: ["esc-2019-pe", "gabay-1999"],
        recordIds: [...dd, ...fib, ...resp].map((o) => o.row.recordId),
        concepts: ["ddimer", ...(fib.length ? ["fibrinogen"] : [])],
      }));
    }
  }

  // ---------------------------------------------------------------- 4. cardiac function and strain
  {
    const lvef = usable("lvef").filter((o) => o.v <= num("lvef", "mildlyReducedMax"));
    const ee = usable("ee").filter((o) => o.v > num("ee", "above"));
    const bnp = usable("ntprobnp").filter((o) => o.v >= num("ntprobnp", "nonAcuteRuleOut"));
    const st = usable("st");
    if (lvef.length + ee.length + bnp.length >= 1) {
      const reduced = lvef.some((o) => o.v < num("lvef", "mildlyReducedMin"));
      const bnpAcute = bnp.some((o) => o.v >= num("ntprobnp", "acuteRuleOut"));
      const converge = reduced || (ee.length > 0 && bnpAcute);
      const priority: WarningPriority = converge ? "HIGH_PRIORITY_MEDICAL_REVIEW" : "MONITORING";
      const observed = [
        ...lvef.map((o) => `Ejection fraction ${at(o)} — ${o.v < num("lvef", "mildlyReducedMin") ? "at or below 40 %, the reduced range" : "in the 41–49 % mildly reduced range"} (${shortSource("esc-2021-hf")}).`),
        ...ee.map((o) => `E/e′ ${at(o)} — above 14, one ASE/EACVI criterion for raised filling pressure; septal, lateral or average e′ is not recorded (${shortSource("nagueh-2016-diastolic")}).`),
        ...bnp.map((o) => `NT-proBNP ${at(o)} — above the ${num("ntprobnp", "nonAcuteRuleOut")} pg/mL non-acute exclusion threshold${o.v < num("ntprobnp", "acuteRuleOut") ? ` but below the ${num("ntprobnp", "acuteRuleOut")} pg/mL acute-setting threshold` : ""} (${shortSource("esc-2021-hf")}).`),
        ...st.map((o) => `ST-segment change ${at(o)} — recorded without lead or context; its significance cannot be assessed from the value alone.`),
      ];
      patterns.push(make({
        id: "p60-cardiac", title: "Cardiac function and strain markers", domains: ["cardiovascular"], priority, rules: [converge ? "PP-2" : "PP-4"], dataCheck: false,
        headline: [...lvef.map((o) => `LVEF ${val(o)}`), ...ee.map((o) => `E/e′ ${o.row.valueText}`), ...bnp.map((o) => `NT-proBNP ${val(o)}`), ...st.map((o) => `ST ${val(o)}`)].join("; ") + ` (${uniq([...lvef, ...ee, ...bnp, ...st].map((o) => o.row.date)).sort().map(dayText).join(", ")}).`,
        rationale: converge ? "PP-2: reduced ejection fraction, or raised filling-pressure ratio with NT-proBNP at or above the acute threshold." : "PP-4: borderline findings that do not converge (see the library's cardiac convergence rule).",
        observed,
        measurement: ["Echocardiographic method, image quality and loading conditions are not recorded; measurements during an acute illness may not reflect the baseline."],
        pattern: `${observed.length > 1 ? "Several measures of heart pumping and filling are borderline-abnormal" : "A measure of heart function is borderline-abnormal"}${present("temp") || present("rr") ? ", recorded during the acute physiological pattern, so they may be transient" : ""}. They are findings for clinical correlation, not a diagnosis of heart failure.`,
        hypotheses: ["Hypothesis: transient cardiac strain during acute illness.", "Hypothesis: pre-existing cardiac change (no baseline echocardiogram is recorded)."],
        supporting: observed,
        contradicting: bnp.length && !bnpAcute ? ["NT-proBNP is below the acute-setting threshold, which argues against acute heart failure."] : [],
        missing: [...notRecorded("troponin", "Troponin"), "A baseline echocardiogram for comparison.", "Full echocardiographic diastolic assessment (left-atrial volume, tricuspid regurgitation velocity)."],
        confirm: ["Ground Medical to decide whether a repeat echocardiogram after recovery from the acute illness, and troponin, are needed."],
        nextStep: "Ground Medical to correlate the cardiac findings clinically and decide on repeat assessment after the acute illness.",
        sources: ["esc-2021-hf", ...(ee.length ? ["nagueh-2016-diastolic"] : [])],
        recordIds: [...lvef, ...ee, ...bnp, ...st].map((o) => o.row.recordId),
        concepts: uniq([...(lvef.length ? ["lvef"] : []), ...(ee.length ? ["ee"] : []), ...(bnp.length ? ["ntprobnp"] : [])]),
      }));
    }
  }

  // ---------------------------------------------------------------- 5. lipids (with inflammation link)
  {
    const tg = usable("triglycerides"), hdl = usable("hdl"), ldl = usable("ldl");
    const abn = [...tg, ...hdl, ...ldl].filter((o) => o.row.displayClass === "AMBER" || o.row.displayClass === "RED");
    if (abn.length) {
      const peak = tg.length >= 3 ? tg.slice(1, -1).find((o, i) => o.v > tg[i]!.v && o.v > tg[i + 2]!.v) ?? null : null;
      const inflamDays = [...usable("hscrp").filter((o) => o.v > num("crpInflammation", "above")), ...usable("temp").filter((o) => o.v >= num("fever", "min"))].map((o) => o.row.date);
      const peakWithInfl = peak && inflamDays.some((d) => near(d, peak.row.date, 0));
      const observed = [
        ...(tg.length ? [`Triglycerides ${tg.map((o) => o.row.valueText).join(" → ")} mg/dL (${tg.map((o) => dayText(o.row.date)).join(", ")})${peak ? `, peak ${peak.row.valueText} on ${dayText(peak.row.date)}` : ""}; ${uniq(tg.filter((o) => o.row.bandLabel).map((o) => o.row.bandLabel!)).join(" / ")} (provisional; fasting not recorded).`] : []),
        ...[...hdl, ...ldl].filter((o) => o.row.displayClass !== "NEUTRAL").map((o) => `${o.row.name} ${at(o)} — ${o.row.bandLabel ?? o.row.displayClass} (provisional).`),
      ];
      patterns.push(make({
        id: "p60-lipids", title: "Raised triglycerides with an unfavourable cholesterol profile", domains: ["metabolic"], priority: "MONITORING", rules: ["PP-4"], dataCheck: false,
        headline: [tg.length ? `Triglycerides ${tg.map((o) => o.row.valueText).join(" → ")} mg/dL` : "", ...[...hdl, ...ldl].filter((o) => o.row.displayClass !== "NEUTRAL").map((o) => `${o.row.name.replace(/ cholesterol/i, "")} ${val(o)}`)].filter(Boolean).join("; ") + ".",
        rationale: "PP-4: provisional AMBER lipid values; fasting status is not recorded, so the triglyceride bands cannot support high priority.",
        observed,
        measurement: ["Fasting status and time since the last meal are not recorded; triglycerides rise for several hours after eating."],
        pattern: peak
          ? `Triglycerides peaked on ${dayText(peak.row.date)} and fell at the next measurement (${nextAfter(tg, peak)}). A transient peak of this shape fits an acute effect — a recent meal${peakWithInfl ? ", or the inflammatory response recorded on the same day, which raises plasma triglycerides (" + shortSource("khovidhunkit-2004") + ")" : ""} — better than a stable lipid disorder. Low HDL and raised LDL, if confirmed when fasting and well, are long-term cardiovascular risk factors.`
          : "Lipid values are in provisional risk bands. If confirmed when fasting and well, they are long-term cardiovascular risk factors.",
        hypotheses: [...(peakWithInfl ? ["Hypothesis: inflammation-related rise in triglycerides (acute-phase lipid changes)."] : []), "Hypothesis: non-fasting samples."],
        supporting: observed,
        contradicting: peak ? [`The fall after ${dayText(peak.row.date)} argues against a stable, severe hypertriglyceridaemia.`] : [],
        missing: ["Fasting status for each lipid sample.", "Total cholesterol and non-HDL cholesterol."],
        confirm: ["Repeat a fasting lipid profile once the acute illness has resolved, if Ground Medical agrees."],
        nextStep: "Repeat a fasting lipid profile after the acute illness, if Ground Medical agrees.",
        sources: ["khovidhunkit-2004"],
        recordIds: [...tg, ...hdl, ...ldl].map((o) => o.row.recordId),
        concepts: uniq([...(tg.length ? ["triglycerides"] : []), ...(hdl.length ? ["hdl"] : []), ...(ldl.length ? ["ldl"] : [])]),
      }));
    }
  }

  // ---------------------------------------------------------------- 6. HbA1c measurement check
  {
    const a = obs("hba1c");
    if (a.some((o) => o.row.held)) {
      const hb = usable("hb");
      const days = a.length >= 2 ? dayNum(a.at(-1)!.row.date) - dayNum(a[0]!.row.date) : 0;
      patterns.push(make({
        id: "p60-hba1c-check", title: "HbA1c results need verification", domains: ["metabolic"], priority: "DATA_CHECK", rules: ["PP-5"], dataCheck: true,
        headline: `HbA1c ${a.map((o) => o.row.valueText).join(" → ")} % (${a.map((o) => dayText(o.row.date)).join(", ")}) — held for measurement verification.`,
        rationale: "PP-5: every HbA1c result is held by the existing measurement-consistency rule; no clinical statement is made until it is repeated.",
        observed: [`HbA1c ${a.map(at).join(" → ")}.`],
        // P61.2: describe the largest change between consecutive results (first-to-last can be zero in a long series).
        measurement: [(() => {
          const j = largestStep(a);
          return j && a.length > 2
            ? `HbA1c reflects average glucose over about 2–3 months (${shortSource("ada-standards-glycemic")}), so the change of ${Math.abs(j.b.v - j.a.v).toFixed(1)} percentage points between ${dayText(j.a.row.date)} and ${dayText(j.b.row.date)} (${dayNum(j.b.row.date) - dayNum(j.a.row.date)} ${dayNum(j.b.row.date) - dayNum(j.a.row.date) === 1 ? "day" : "days"}) cannot be physiological.`
            : `HbA1c reflects average glucose over about 2–3 months (${shortSource("ada-standards-glycemic")}), so a change of ${Math.abs(a.at(-1)!.v - a[0]!.v).toFixed(1)} percentage points within ${days} ${days === 1 ? "day" : "days"} cannot be physiological.`;
        })()],
        pattern: a.length > 2
          ? `These ${a.length} HbA1c results are not mutually consistent; until they are verified, none of them supports or excludes a disorder of blood-sugar regulation.`
          : "The two HbA1c results cannot both be correct; until one is confirmed, neither supports or excludes a disorder of blood-sugar regulation.",
        hypotheses: ["Hypothesis: sample mix-up or transcription error.", "Hypothesis: different analytical methods.", ...(hb.length ? [`Hypothesis: altered red-cell turnover affecting HbA1c (haemoglobin ${hb.map(val).join(" → ")} recorded).`] : [])],
        supporting: [], contradicting: [],
        missing: [...notRecorded("glucose", "Fasting plasma glucose"), "HbA1c method and laboratory."],
        confirm: ["Repeat HbA1c on a new sample with the method recorded, together with a fasting plasma glucose, if Ground Medical agrees."],
        nextStep: "Repeat HbA1c on a new sample with the method recorded, plus fasting glucose.",
        sources: ["ada-standards-glycemic"],
        recordIds: a.map((o) => o.row.recordId),
        concepts: ["hba1c"],
      }));
    }
  }

  // ---------------------------------------------------------------- 7. bone turnover + vitamin D
  {
    const oc = usable("osteocalcin"), vd = usable("vitd");
    const ocChange = oc.length >= 2 && oc.some((o) => o.row.reviewHigh);
    const vdLow = vd.filter((o) => o.row.displayClass === "AMBER" || o.row.displayClass === "RED");
    if (ocChange || vdLow.length) {
      const ratio = ocChange ? oc.at(-1)!.v / oc[0]!.v : 1;
      const days = ocChange ? dayNum(oc.at(-1)!.row.date) - dayNum(oc[0]!.row.date) : 0;
      const ref = obs("p1np_ctx");
      // P61.2: describe each reference marker as the series it is (one line per biomarker + unit), never "single measurement" for a series.
      const refSeries = seriesOf(ref);
      const refMulti = refSeries.some((x) => x.length >= 2);
      patterns.push(make({
        // The title names low vitamin D only when a classified low vitamin D result is recorded.
        id: "p60-bone", title: vdLow.length ? (ocChange ? "Bone-turnover change and low vitamin D" : "Low vitamin D") : "Bone-turnover change", domains: ["bone"], priority: "MONITORING", rules: ["PP-4"], dataCheck: ocChange && days <= 2 && (ratio >= 2 || ratio <= 0.5),
        dataCheckRecordIds: oc.map((o) => o.row.recordId),
        headline: [ocChange ? `Osteocalcin ${oc.map((o) => o.row.valueText).join(" → ")} ng/mL within ${days} ${days === 1 ? "day" : "days"}` : "", ...[...new Set(vdLow.map((o) => val(o)))].map((v) => `vitamin D ${v} (${vdLow.filter((o) => val(o) === v).map((o) => dayText(o.row.date)).join(", ")})`)].filter(Boolean).join("; ").replace(/^./, (c) => c.toUpperCase()) + ".",
        rationale: "PP-4: a significant change (trend review) and/or a provisional AMBER vitamin D value; no threshold supports high priority.",
        observed: [
          ...(ocChange ? [`Osteocalcin ${oc.map(at).join(" → ")} (${foldText(oc)}).`] : []),
          ...vdLow.map((o) => `25-hydroxyvitamin D ${at(o)} — ${o.row.bandLabel ?? "AMBER"} (provisional; ${shortSource("nih-ods-vitd")}).`),
          ...refSeries.map((xs) => xs.length === 1
            ? `${xs[0]!.row.name} ${at(xs[0]!)} — single measurement; no criterion applied.`
            : `${xs[0]!.row.name} ${xs.map((o) => o.row.valueText).join(" → ")} ${xs[0]!.row.unit} (${xs.length} measurements, ${dayText(xs[0]!.row.date)}–${dayText(xs.at(-1)!.row.date)}; range ${fmtNum(Math.min(...xs.map((o) => o.v)))}–${fmtNum(Math.max(...xs.map((o) => o.v)))}) — no criterion applied.`),
        ],
        measurement: ocChange ? [`Osteocalcin is unstable after sampling and varies through the day; the IOF-IFCC recommend P1NP and CTX as the reference bone-turnover markers (${shortSource("vasikaran-2011-iof")}). A change of this size within ${days} ${days === 1 ? "day" : "days"} should be verified before biological interpretation.`] : [],
        pattern: `${ocChange ? (refMulti ? "A large, rapid osteocalcin change cannot yet be read as a change in bone formation; the reference markers (P1NP, CTX) were measured repeatedly but have no applicable criterion, so their series are listed for Ground Medical comparison rather than interpreted. " : "A large, rapid osteocalcin change with single measurements of the reference markers cannot yet be read as a change in bone formation. ") : ""}${vdLow.length ? "Vitamin D in the range generally considered inadequate is relevant to bone health in long-duration spaceflight and should be reviewed by Ground Medical." : ""}`.trim(),
        hypotheses: [...(ocChange ? ["Hypothesis: pre-analytical variation (sample handling, time of day, assay)."] : []), ...(vdLow.length ? ["Hypothesis: limited sunlight exposure or intake (intake not recorded)."] : [])],
        supporting: [], contradicting: ocChange && ref.length ? [refMulti ? "The reference markers (P1NP, CTX) have no applicable criterion, so their repeated measurements cannot yet confirm or refute the osteocalcin change." : "The reference markers (P1NP, CTX) were measured only once, so they cannot confirm or refute the osteocalcin change."] : [],
        missing: ["Calcium, phosphate and parathyroid hormone measured together with the bone markers.", "Sampling time (fasting morning samples are recommended for CTX)."],
        confirm: ["Repeat bone-turnover markers (P1NP, CTX, osteocalcin) on fasting morning samples together with calcium, phosphate and PTH, if Ground Medical agrees; Ground Medical to review vitamin D adequacy."],
        nextStep: "Repeat bone markers on fasting morning samples with calcium, phosphate and PTH, if Ground Medical agrees.",
        sources: [...(ocChange ? ["vasikaran-2011-iof"] : []), ...(vdLow.length ? ["nih-ods-vitd"] : [])],
        recordIds: [...oc, ...vd, ...ref].map((o) => o.row.recordId),
        concepts: uniq([...(ocChange ? ["osteocalcin"] : []), ...(vdLow.length ? ["vitd"] : [])]),
      }));
    }
  }

  // ---------------------------------------------------------------- 8. sleep, recovery and autonomic signal
  {
    const se = usable("sleep_eff").filter((o) => o.row.displayClass === "AMBER" || o.row.displayClass === "RED");
    const hrv = usable("rmssd");
    const hrvDrop = hrv.length >= 2 && hrv.some((o) => o.row.reviewHigh) && hrv.at(-1)!.v < hrv[0]!.v;
    if (se.length || hrvDrop) {
      const acuteDays = patterns.find((p) => p.id === "p60-acute-physiology")?.recordIds.length ? uniq(rows.filter((r) => patterns.find((p) => p.id === "p60-acute-physiology")!.recordIds.includes(r.recordId)).map((r) => r.date)) : [];
      const overlap = [...se, ...hrv].some((o) => acuteDays.includes(o.row.date));
      patterns.push(make({
        id: "p60-recovery", title: "Poor sleep efficiency and reduced heart-rate variability", domains: ["recovery"], priority: "MONITORING", rules: ["PP-4"], dataCheck: false,
        headline: [...se.map((o) => `Sleep efficiency ${val(o)}`), ...(hrvDrop ? [`RMSSD ${hrv.map((o) => o.row.valueText).join(" → ")} ms`] : [])].join("; ") + ` (${uniq([...se, ...hrv].map((o) => o.row.date)).sort().map(dayText).join(", ")}).`,
        rationale: "PP-4: provisional AMBER sleep efficiency and/or a significant HRV change (trend review); no threshold supports high priority.",
        observed: [
          ...se.map((o) => `Sleep efficiency ${at(o)} — ${o.row.bandLabel ?? "AMBER"} (provisional; ${shortSource("nsf-2017-sleep")}).`),
          ...(hrvDrop ? [`RMSSD ${hrv.map(at).join(" → ")} — significant change (trend review); no criterion classifies HRV.`] : []),
        ],
        measurement: [`HRV depends strongly on recording length, posture, breathing and time of day (${shortSource("task-force-1996-hrv")}); these conditions are not recorded.`],
        pattern: `Disturbed sleep and lower parasympathetic (vagal) activity${overlap ? " coincide with the acute physiological pattern" : " were recorded in this period"}; they indicate reduced recovery but do not identify a cause.`,
        hypotheses: [...(overlap ? ["Hypothesis: acute illness, fever and stress reducing sleep quality and HRV."] : []), "Hypothesis: workload, schedule or environmental disruption (not recorded)."],
        supporting: [], contradicting: [],
        missing: ["Sleep log, workload and schedule; HRV recording conditions."],
        confirm: ["If Ground Medical agrees, repeat HRV under standardised conditions (same time of day, posture and duration) once the acute illness has resolved."],
        nextStep: "If Ground Medical agrees, repeat HRV under standardised conditions after the acute illness; keep a sleep log.",
        sources: ["task-force-1996-hrv", ...(se.length ? ["nsf-2017-sleep"] : [])],
        recordIds: [...se, ...hrv].map((o) => o.row.recordId),
        concepts: uniq([...(se.length ? ["sleep_eff"] : []), ...(hrvDrop ? ["rmssd"] : [])]),
      }));
    }
  }

  patterns.sort((a, b) => rank[a.priority] - rank[b.priority] || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

  // ---------------------------------------------------------------- links between patterns
  const has = (id: string) => patterns.some((p) => p.id === id);
  const datesOf = (id: string) => new Set(rows.filter((r) => patterns.find((p) => p.id === id)?.recordIds.includes(r.recordId)).map((r) => r.date));
  const overlapDates = (a: string, b: string) => [...datesOf(a)].some((d) => datesOf(b).has(d));
  const links: PatternLink[] = [];
  const acute = patterns.find((p) => p.id === "p60-acute-physiology");
  const acuteInflam = Boolean(acute && acute.concepts.some((c) => ["temp", "hscrp", "il6"].includes(c)));
  if (acuteInflam && has("p60-lipids")) links.push({ from: "p60-acute-physiology", to: "p60-lipids", kind: "established", label: "Inflammation raises plasma triglycerides", sourceId: "khovidhunkit-2004" });
  if (acuteInflam && has("p60-coagulation")) links.push({ from: "p60-acute-physiology", to: "p60-coagulation", kind: "established", label: "Acute-phase response raises fibrinogen; D-dimer is non-specific", sourceId: "gabay-1999" });
  if (has("p60-acute-physiology") && has("p60-recovery") && overlapDates("p60-acute-physiology", "p60-recovery")) links.push({ from: "p60-acute-physiology", to: "p60-recovery", kind: "hypothesis", label: "Illness may reduce sleep quality and HRV", sourceId: null });
  if (has("p60-acute-physiology") && has("p60-electrolytes") && overlapDates("p60-acute-physiology", "p60-electrolytes")) links.push({ from: "p60-acute-physiology", to: "p60-electrolytes", kind: "co-occurrence", label: "Same dates — co-occurrence, not cause", sourceId: null });
  if (has("p60-acute-physiology") && has("p60-cardiac") && overlapDates("p60-acute-physiology", "p60-cardiac")) links.push({ from: "p60-acute-physiology", to: "p60-cardiac", kind: "co-occurrence", label: "Cardiac findings measured during the acute pattern", sourceId: null });
  if (has("p60-coagulation") && has("p60-acute-physiology") && patterns.find((p) => p.id === "p60-coagulation")!.rules.includes("PP-2")) links.push({ from: "p60-coagulation", to: "p60-acute-physiology", kind: "co-occurrence", label: "Raised D-dimer with low SpO2 / fast breathing", sourceId: null });

  return {
    active: true,
    patterns,
    links,
    basis: `Cross-domain pattern analysis (P60, ${lib.status.replace(/_/g, " ").toLowerCase()}): ${patterns.length} pattern(s) from ${lib.concepts.length} concepts bound by exact identity and unit; priorities by rules ${lib.priorityRules.map((r) => r.id).join(", ")}. Patterns never change a result's clinical class.`,
  };
}

const ORDER = ["p60-acute-physiology", "p60-electrolytes", "p60-coagulation", "p60-cardiac", "p60-hba1c-check", "p60-lipids", "p60-bone", "p60-recovery"];
export const P60_PATTERN_ORDER = ORDER;
