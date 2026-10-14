import { useState } from "react";
import {
  boneCategoryLabel,
  localizedBoneVariables,
  localizedCardiovascularMetrics,
  localizedCardiovascularRelationships,
  type ScientificLocale,
} from "@/domain/scientific-localization/handbooks";

const REVIEW = "Translation review required — English text not shown.";

function LocaleToggle({
  locale,
  onChange,
}: {
  locale: ScientificLocale;
  onChange: (l: ScientificLocale) => void;
}) {
  return (
    <label className="mt-3 inline-flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="checkbox"
        checked={locale === "el"}
        onChange={(e) => onChange(e.target.checked ? "el" : "en")}
      />
      Also show original Greek source text (traceability)
    </label>
  );
}

function Flag({ text }: { text?: string }) {
  return text ? <p className="mt-1 text-xs text-muted-foreground">Review note: {text}</p> : null;
}

function Source({ show, lines }: { show: boolean; lines: string[] }) {
  if (!show) return null;
  return (
    <div lang="el" className="mt-1 border-l border-border pl-2 text-xs text-muted-foreground">
      {lines.map((l, i) => (
        <p key={i} className="[overflow-wrap:anywhere]">
          {l}
        </p>
      ))}
    </div>
  );
}

export function CardiovascularHandbookReference() {
  const [locale, setLocale] = useState<ScientificLocale>("en");
  const metrics = localizedCardiovascularMetrics();
  const relationships = localizedCardiovascularRelationships();
  const groups = [...new Set(metrics.map((m) => m.group))];
  const showEl = locale === "el";
  return (
    <section
      className="mt-8 rounded-xl border border-border p-5"
      aria-label="Cardiovascular handbook reference"
      lang="en"
    >
      <h2 className="text-xl font-semibold">
        Cardiovascular scientific handbook · research reference
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Nikolas' cardiovascular handbook: {metrics.length} catalogued measurements across{" "}
        {groups.length} groups, shown in English. The original Greek handbook is preserved
        unchanged. Translation and scientific review are pending; no clinical thresholds, diagnoses
        or alerts are enabled by this reference.
      </p>
      <LocaleToggle locale={locale} onChange={setLocale} />
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer">Explore the source-derived measurement catalog</summary>
        <div className="mt-4 space-y-4">
          {groups.map((group) => (
            <div key={group}>
              <h3 className="font-semibold">{group}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {metrics
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <li key={m.id} className="[overflow-wrap:anywhere]">
                      <strong>{m.name}</strong> · {m.unit || "unit not specified"} —{" "}
                      {m.biology ?? REVIEW}
                      <span className="block text-muted-foreground">
                        {m.context ?? REVIEW}
                        {m.linkage ? ` Related: ${m.linkage}` : ""}
                      </span>
                      <Flag text={m.reviewFlag} />
                      <Source show={showEl} lines={[m.source.biology_el, m.source.context_el]} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer">
          Relationship examples ({relationships.length}, research-only)
        </summary>
        <ul className="mt-3 space-y-2">
          {relationships.map((r) => (
            <li
              key={r.index}
              className="rounded-md border border-border p-3 [overflow-wrap:anywhere]"
            >
              <strong>{r.combination ?? REVIEW}</strong>
              <p className="mt-1 text-muted-foreground">{r.interpretationAndLimits ?? REVIEW}</p>
              <Flag text={r.reviewFlag} />
              <Source
                show={showEl}
                lines={[r.source.combination_el, r.source.interpretationAndLimits_el]}
              />
            </li>
          ))}
        </ul>
      </details>
      <p className="mt-3 text-xs text-muted-foreground">
        Reference-only · pending independent review · not evidence of device availability or
        independent validation.
      </p>
    </section>
  );
}

export function BoneHandbookReference() {
  const [locale, setLocale] = useState<ScientificLocale>("en");
  const variables = localizedBoneVariables();
  const categories = [...new Set(variables.map((v) => v.category))];
  const showEl = locale === "el";
  return (
    <section
      className="mt-10 rounded-xl border border-border p-5"
      aria-label="Bone health handbook reference"
      lang="en"
    >
      <h2 className="text-xl font-semibold">
        Bone health scientific handbook · research reference
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Nikolas' Bone Health Handbook v7: {variables.length} variables across {categories.length}{" "}
        categories, shown in English. The original Greek handbook is preserved unchanged. Evidence
        tiers A/B/C are author-assigned; translation and scientific review are pending; no
        thresholds, diagnoses or fracture-risk predictions.
      </p>
      <LocaleToggle locale={locale} onChange={setLocale} />
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer">Explore the source-derived variable catalog</summary>
        <div className="mt-4 space-y-4">
          {categories.map((c) => (
            <div key={c}>
              <h3 className="font-semibold">{boneCategoryLabel(c)}</h3>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {variables
                  .filter((v) => v.category === c)
                  .map((v) => (
                    <li key={v.id} className="[overflow-wrap:anywhere]">
                      <strong>{v.name}</strong> · tier {v.handbookEvidenceTier} ·{" "}
                      {v.specimen ?? REVIEW} · {v.unit ?? REVIEW} — {v.what ?? REVIEW}
                      <span className="block text-muted-foreground">
                        ↑ Increase: {v.increase ?? REVIEW} ↓ Decrease: {v.decrease ?? REVIEW}
                      </span>
                      <Flag text={v.reviewFlag} />
                      <Source
                        show={showEl}
                        lines={[
                          v.source.measurementDescription_el,
                          v.source.biologicalInterpretation_el,
                        ]}
                      />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{variables[0]?.implementationNotes}</p>
      </details>
      <p className="mt-3 text-xs text-muted-foreground">
        Reference-only · pending independent review · direction words describe possible
        associations, not causes or clinical findings.
      </p>
    </section>
  );
}
