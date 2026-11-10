/**
 * P61.3 typographic unit-notation equivalence (owner-directed, synthetic only, pending Researcher confirmation).
 *
 * A closed list of rules for writing the SAME unit differently. Pure and fail-closed: two units are
 * notation-equivalent only when every difference is explained by one of these rules. Never a conversion,
 * never a change of scale (10^3/μL is NOT 10^9/L here), never fuzzy matching, and never applied to real data
 * by the callers (synthetic demo recognition only). The verbatim reported unit is always kept.
 */

export const P613_UNIT_NOTATION_VERSION = "p61.3-unit-notation.v1";
export const P613_UNIT_NOTATION_STATUS = "OWNER_DIRECTED_SYNTHETIC_ONLY_PENDING_RESEARCHER_CONFIRMATION";

export type UnitNotationRuleId = "UN-1" | "UN-2" | "UN-3";
export const UNIT_NOTATION_RULES: readonly { id: UnitNotationRuleId; text: string }[] = [
  { id: "UN-1", text: "Degree Celsius written in plain text (\"deg C\", \"degC\", \"° C\") is the unit °C." },
  { id: "UN-2", text: "A power of ten written with a caret (10^9) is the same exponent written as a superscript (10⁹)." },
  { id: "UN-3", text: "The micro sign µ (U+00B5) and the Greek letter μ (U+03BC) denote the same prefix." },
];

const CELSIUS_FORMS = new Set(["deg C", "degC", "° C"]);
const SUPERSCRIPT: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };

/** Canonical notation of one unit string plus the rules that changed it. */
function canonicalNotation(unit: string): { text: string; rules: Set<UnitNotationRuleId> } {
  const rules = new Set<UnitNotationRuleId>();
  let text = unit.trim();
  if (CELSIUS_FORMS.has(text)) {
    text = "°C";
    rules.add("UN-1");
  }
  const caret = text.replace(/10\^(\d{1,2})(?!\d)/g, (_, d: string) => `10${[...d].map((c) => SUPERSCRIPT[c]).join("")}`);
  if (caret !== text) rules.add("UN-2");
  text = caret;
  const micro = text.replace(/\u00B5/g, "\u03BC");
  if (micro !== text) rules.add("UN-3");
  return { text: micro, rules };
}

export interface UnitNotationMatch {
  reportedUnit: string;
  catalogUnit: string;
  ruleIds: UnitNotationRuleId[];
}

/**
 * The notation rules that make `reported` the same unit as `catalog`, or null when the strings are
 * identical (no rule needed) or differ in anything the closed rule list does not explain.
 */
export function unitNotationMatch(reported: string, catalog: string): UnitNotationMatch | null {
  const r = reported.trim(), c = catalog.trim();
  if (!r || !c || r === c) return null;
  const a = canonicalNotation(r), b = canonicalNotation(c);
  if (a.text !== b.text) return null;
  const ruleIds = [...new Set([...a.rules, ...b.rules])].sort() as UnitNotationRuleId[];
  return ruleIds.length ? { reportedUnit: r, catalogUnit: c, ruleIds } : null;
}
