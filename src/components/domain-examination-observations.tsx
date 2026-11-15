import { useEffect, useMemo, useState } from "react";

import type { BoneHealthEntry } from "@/domain/bone-health/history";
import type { MeasurementProfile } from "@/domain/health-measurements/profiles";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";
import { listUnifiedObservations } from "@/domain/health-intelligence/observation-store";
import { observationDateLabel } from "@/domain/health-intelligence/observation-date";
import { projectDomainExaminations } from "@/domain/health-domains/examination-projection";

/**
 * P72.4 read-only list of existing Examination observations for this domain, for the
 * already-authorized mission + crew selected above. Reads this device's encrypted local
 * records only (the same records the Full Health Report reads); never writes, syncs,
 * confirms, approves or reclassifies anything.
 */
export function DomainExaminationObservations({
  profile,
  missionId,
  crewMemberId,
  domainEntries,
}: {
  profile: MeasurementProfile;
  missionId: string;
  crewMemberId: string;
  domainEntries: readonly BoneHealthEntry[];
}) {
  const [observations, setObservations] = useState<UnifiedObservation[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setObservations(null);
    setFailed(false);
    listUnifiedObservations(missionId, crewMemberId)
      .then((rows) => active && setObservations(rows))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [missionId, crewMemberId]);
  const projection = useMemo(
    () =>
      observations
        ? projectDomainExaminations({
            domainId: profile.domainId,
            missionId,
            crewMemberId,
            provenance: "synthetic",
            domainEntries,
            unifiedObservations: observations,
          })
        : null,
    [observations, profile.domainId, missionId, crewMemberId, domainEntries],
  );
  return (
    <section
      className="mt-8 rounded-xl border border-border p-5"
      aria-label={`${profile.title} examination observations`}
    >
      <h2 className="text-xl font-semibold">{profile.title} · Examination observations (read-only)</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Synthetic records confirmed at Examinations for the mission and crew selected above, shown next to this page&apos;s
        own records with the same inclusion and duplicate rules as the Full Health Report. Each record keeps the domain
        assigned by its catalog entry at import; nothing is reclassified, confirmed, approved or saved here. Real-origin
        records are not shown.
      </p>
      {failed ? (
        <p role="alert" className="mt-4 text-sm">Encrypted local Examination records are unavailable on this device.</p>
      ) : !projection ? (
        <p role="status" className="mt-4 text-sm text-muted-foreground">Reading encrypted local records…</p>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3" aria-label={`${profile.title} examination counts`}>
            <div>
              <dt className="font-medium">Examination observations</dt>
              <dd data-count="examination">{projection.counts.examination}</dd>
            </div>
            <div>
              <dt className="font-medium">Domain-native records</dt>
              <dd data-count="domain-native">{projection.counts.domainNative}</dd>
            </div>
            <div>
              <dt className="font-medium">Distinct biomarker series (ID + unit)</dt>
              <dd data-count="series">{projection.counts.series}</dd>
            </div>
            <div>
              <dt className="font-medium">Not scientifically validated (synthetic demo catalog)</dt>
              <dd data-count="unvalidated">{projection.counts.notScientificallyValidated}</dd>
            </div>
            <div>
              <dt className="font-medium">Pending review / excluded / duplicates counted once</dt>
              <dd data-count="held">
                {projection.counts.pendingReview} / {projection.counts.excluded} / {projection.counts.duplicateProjections}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Unclassified (no health-domain mapping, all domains)</dt>
              <dd data-count="unclassified">{projection.counts.unclassified}</dd>
            </div>
          </dl>
          {projection.rows.length ? (
            <div className="mt-4 max-h-[32rem] overflow-auto rounded border border-border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr>
                    <th className="p-2">Biomarker</th>
                    <th className="p-2">Value</th>
                    <th className="p-2">Unit</th>
                    <th className="p-2">Observed</th>
                    <th className="p-2">Origin</th>
                    <th className="p-2">Scientific status</th>
                    <th className="p-2">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.rows.map((r) => (
                    <tr key={`${r.origin}:${r.recordId}`} className="border-t border-border align-top">
                      <td className="p-2">{r.label}</td>
                      <td className="p-2 font-mono">{r.value}</td>
                      <td className="p-2">{r.unit}</td>
                      <td className="p-2">{observationDateLabel(r)}</td>
                      <td className="p-2">
                        {r.origin === "examination" ? "Examination (reviewer-confirmed at import)" : "Domain-native record"}
                        {" · "}SYNTHETIC
                      </td>
                      <td className="p-2">
                        {r.validation === "synthetic_demo_not_scientifically_validated" ? (
                          <strong>NOT SCIENTIFICALLY VALIDATED · synthetic demo catalog</strong>
                        ) : (
                          "Handbook catalog entry · pending independent scientific review"
                        )}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {r.sourceLabel}
                        <span className="block font-mono">{r.evidence}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No reviewer-confirmed synthetic {profile.title.toLowerCase()} records for this mission and crew on this device.
              Zero is not a negative finding.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Values, units and dates exactly as stored; no conversion, reference range, threshold, alert or diagnosis.
            Reviewer confirmation at import is data-entry confirmation, not scientific or clinical approval, and demo scope
            approval is not scientific validation. Ground Medical attestations are shown in the Full Health Report.
          </p>
        </>
      )}
    </section>
  );
}
