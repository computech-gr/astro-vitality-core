import { MedicalAdvisorWorkbench } from "@/components/medical-advisor-workbench";
import { SyntheticMedicalReview } from "@/components/synthetic-medical-review";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import {
  buildHealthHistoryReport,
  healthReportPlainText,
  REPORT_DISCLAIMER,
} from "@/domain/health-intelligence/health-history-report";
import {
  buildUnifiedHealthReport,
  REPORT_SOURCE_BADGES,
  REPORT_SOURCE_LABELS,
  unifiedReportPlainText,
  type ReportSourceBadge,
  type UnifiedReportInputs,
} from "@/domain/health-intelligence/unified-health-report";
import { loadUnifiedReportInputs } from "@/domain/health-intelligence/unified-health-report-loader";

const EMPTY_INPUTS: UnifiedReportInputs = {
  domainEntries: {},
  unifiedObservations: [],
  deviceRecords: [],
};

export function AstronautHealthReport() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [key, setKey] = useState("");
  const [provenance, setProvenance] = useState<"synthetic" | "real">("synthetic");
  const [inputs, setInputs] = useState<UnifiedReportInputs>(EMPTY_INPUTS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sources, setSources] = useState<ReportSourceBadge[]>([...REPORT_SOURCE_BADGES]);
  const [status, setStatus] = useState(
    "Select an authorized crew member to load locally stored observations.",
  );
  const userRef = useRef<string | undefined>(undefined);

  // Fresh server-backed identity on mount, auth change and tab return.
  // The visible report stays while revalidating; it is cleared immediately
  // when the account changes or the scope is no longer authorized.
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((v) => {
          if (!active) return;
          if (!v.signedIn || v.error || v.userId !== userRef.current) {
            setInputs(EMPTY_INPUTS);
            setKey("");
          }
          userRef.current = v.signedIn && !v.error ? v.userId : undefined;
          setIdentity(v);
        })
        .catch(() => {
          if (!active) return;
          userRef.current = undefined;
          setInputs(EMPTY_INPUTS);
          setKey("");
          setIdentity(null);
        });
    };
    refresh();
    const unsub = subscribeMissionIdentity(refresh);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      unsub();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const members = useMemo(
    () =>
      identity?.signedIn && !identity.error
        ? identity.memberships
            .filter(
              (m) => (m.role === "crew_self" || m.role === "ground_medical") && m.crewMemberId,
            )
            .flatMap((m) =>
              m.crewMemberId
                ? [
                    {
                      key: `${m.missionId}|${m.crewMemberId}`,
                      missionId: m.missionId,
                      crewMemberId: m.crewMemberId,
                      label: `${m.missionName ?? m.missionCode ?? m.missionId} — ${m.crewDisplayName ?? m.crewMemberId}`,
                    },
                  ]
                : [],
            )
        : [],
    [identity],
  );
  const member = members.find((m) => m.key === key);

  // Denied scope: clear immediately.
  useEffect(() => {
    if (key && identity && !member) {
      setKey("");
      setInputs(EMPTY_INPUTS);
      setStatus("Selected scope is no longer authorized. Report cleared.");
    }
  }, [key, identity, member]);

  useEffect(() => {
    setInputs(EMPTY_INPUTS);
    if (!member) return;
    let active = true;
    setStatus("Reading encrypted local records…");
    void loadUnifiedReportInputs(member.missionId, member.crewMemberId)
      .then((v) => {
        if (active) {
          setInputs(v);
          setStatus("Encrypted local records read for this mission and crew member.");
        }
      })
      .catch(() => {
        if (active) setStatus("Unable to read encrypted local records. No report generated.");
      });
    return () => {
      active = false;
    };
  }, [member?.missionId, member?.crewMemberId]);

  const report = useMemo(
    () =>
      member
        ? buildHealthHistoryReport(
            inputs.unifiedObservations,
            member.missionId,
            member.crewMemberId,
            provenance,
          )
        : null,
    [inputs, member?.missionId, member?.crewMemberId, provenance],
  );
  const unified = useMemo(
    () =>
      member
        ? buildUnifiedHealthReport(
            inputs,
            { missionId: member.missionId, crewMemberId: member.crewMemberId, provenance },
            { from: from || undefined, to: to || undefined, sources },
          )
        : null,
    [inputs, member?.missionId, member?.crewMemberId, provenance, from, to, sources],
  );

  const printReport = () => window.print();
  const exportText = () => {
    if (!report || !unified) return;
    const text = `${unifiedReportPlainText(unified)}\n\n${healthReportPlainText(report)}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitochondria-astronaut-health-research-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  const toggleSource = (badge: ReportSourceBadge) =>
    setSources((current) =>
      current.includes(badge) ? current.filter((b) => b !== badge) : [...current, badge],
    );

  return (
    <main className="report-root mx-auto w-full max-w-5xl space-y-6 px-4 py-10 print:max-w-none print:p-0">
      <header className="print:hidden">
        <h1 className="text-3xl font-bold">Astronaut Health History &amp; Research Assessment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Unified Bone, Immune, Cardiovascular, Behavioral, wearable and device records from
          authorized encrypted local storage only. Use Print / Save as PDF for an A4 PDF; nothing
          is uploaded.
        </p>
      </header>
      <section className="space-y-3 rounded-lg border p-4 print:hidden">
        <label className="block text-sm" htmlFor="report-crew">
          Authorized mission and crew
        </label>
        <select
          id="report-crew"
          className="w-full rounded border bg-background p-2"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        >
          <option value="">Select crew member</option>
          {members.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <label className="block text-sm" htmlFor="report-origin">
          Data provenance — never mix synthetic and real
        </label>
        <select
          id="report-origin"
          className="w-full rounded border bg-background p-2"
          value={provenance}
          onChange={(e) => setProvenance(e.target.value as "synthetic" | "real")}
        >
          <option value="synthetic">Synthetic / demonstration</option>
          <option value="real">Real / recorded</option>
        </select>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm" htmlFor="report-from">
              From (UTC date)
            </label>
            <input
              id="report-from"
              type="date"
              className="w-full rounded border bg-background p-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm" htmlFor="report-to">
              To (UTC date)
            </label>
            <input
              id="report-to"
              type="date"
              className="w-full rounded border bg-background p-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-3 text-sm">
          <legend className="mb-1 text-sm">Sources</legend>
          {REPORT_SOURCE_BADGES.map((badge) => (
            <label key={badge} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={sources.includes(badge)}
                onChange={() => toggleSource(badge)}
              />
              {REPORT_SOURCE_LABELS[badge]}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-muted-foreground" role="status">
          {status}
        </p>
        {!identity?.signedIn && (
          <Link className="underline" to="/mission/identity">
            Mission identity &amp; sign-in
          </Link>
        )}
      </section>
      {identity?.signedIn && (
        <div className="print:hidden">
          <SyntheticMedicalReview />
        </div>
      )}
      {report && unified && (
        <article className="report-print space-y-5 rounded-lg border bg-card p-5 print:border-0 print:bg-transparent print:p-0">
          <div className="flex flex-wrap justify-between gap-3 print:hidden">
            <Button onClick={printReport}>Print / Save as PDF</Button>
            <Button variant="outline" onClick={exportText}>
              Export evidence text
            </Button>
          </div>
          <div className="report-print-header hidden print:flex">
            <span>MITOCHONDRIA · Unified Health &amp; Device Report</span>
            <span>RESEARCH USE ONLY · {unified.scope.provenance.toUpperCase()}</span>
          </div>
          <div className="report-print-footer hidden print:flex">
            <span>
              {unified.scope.missionId} / {unified.scope.crewMemberId}
            </span>
            <span>Generated {unified.generatedAt} UTC · not a diagnosis</span>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              MITOCHONDRIA
            </p>
            <h2 className="text-xl font-semibold">Unified Health &amp; Device Report</h2>
            <p className="text-sm">
              Mission: {unified.scope.missionId} · Crew: {unified.scope.crewMemberId}
            </p>
            <p className="text-sm">
              Provenance: {unified.scope.provenance.toUpperCase()} · Generated (UTC):{" "}
              {unified.generatedAt}
            </p>
            <p className="text-sm">
              Period: {unified.filters.from ?? "earliest record"} —{" "}
              {unified.filters.to ?? "latest record"} · Sources:{" "}
              {unified.filters.sources.map((s) => REPORT_SOURCE_LABELS[s]).join(", ")}
            </p>
          </div>
          <p className="rounded border p-3 text-sm font-semibold">{REPORT_DISCLAIMER}</p>

          <section aria-label="Domain overview" className="report-avoid-break space-y-2">
            <h3 className="font-semibold">Domain overview</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {unified.summaries.map((s) => (
                <div key={s.badge} className="report-avoid-break rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{REPORT_SOURCE_LABELS[s.badge]}</p>
                  <p className="text-2xl font-semibold tabular-nums">{s.included}</p>
                  <p className="text-xs">
                    included · {s.metrics} metric(s) · {s.pending} pending · {s.excluded} excluded
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.missing
                      ? "No included data — not a negative finding"
                      : `${s.firstAt} → ${s.lastAt}`}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Coverage: {unified.coverage.included} included, {unified.coverage.pendingReview}{" "}
              pending review, {unified.coverage.excluded} excluded (including{" "}
              {unified.coverage.duplicateProjections} duplicate projection(s)),{" "}
              {unified.coverage.outOfFilter} outside filters,{" "}
              {unified.coverage.otherProvenanceIgnored} other-provenance and{" "}
              {unified.coverage.nonObservationMetadata} non-observation metadata record(s) not
              shown.
            </p>
          </section>

          <section aria-label="Chronological history" className="space-y-2">
            <h3 className="font-semibold">Chronological history</h3>
            {unified.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No included observations for this selection. Nothing is inferred.
              </p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="report-table w-full text-left text-xs">
                  <thead>
                    <tr>
                      <th>Date (UTC)</th>
                      <th>Source</th>
                      <th>Metric</th>
                      <th>Result</th>
                      <th>Provenance / status</th>
                      <th>Origin &amp; evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unified.rows.map((r) => (
                      <tr key={`${r.badge}:${r.recordId}`} className="border-t align-top">
                        <td className="py-2 pr-2 tabular-nums">{r.observedAt}</td>
                        <td className="pr-2">
                          <span className="rounded border px-1.5 py-0.5 font-medium">
                            {REPORT_SOURCE_LABELS[r.badge]}
                          </span>
                        </td>
                        <td className="pr-2">
                          {r.metricId}
                          {r.metricLabel !== r.metricId && (
                            <span className="block text-muted-foreground">{r.metricLabel}</span>
                          )}
                        </td>
                        <td className="pr-2 tabular-nums">
                          {r.value} {r.unit}
                        </td>
                        <td className="pr-2">
                          {r.provenance} · {r.status}
                        </td>
                        <td className="break-all">
                          {r.sourceLabel}
                          <span className="block text-muted-foreground">
                            ID {r.recordId} · {r.evidence}
                          </span>
                          {r.qualityNote && (
                            <span className="block text-muted-foreground">{r.qualityNote}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-label="Excluded and pending records" className="space-y-2">
            <h3 className="font-semibold">Excluded and pending records</h3>
            {unified.exclusions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None in this selection.</p>
            ) : (
              <table className="report-table w-full text-left text-xs">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Record ID</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {unified.exclusions.map((e, i) => (
                    <tr key={`${e.recordId}:${i}`} className="border-t align-top">
                      <td className="py-1 pr-2">
                        {e.category === "pending_review" ? "Pending review" : "Excluded"}
                      </td>
                      <td className="pr-2">
                        {e.badge === "unclassified"
                          ? "Unclassified"
                          : REPORT_SOURCE_LABELS[e.badge]}
                      </td>
                      <td className="break-all pr-2">{e.recordId}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-label="Intake research observations" className="space-y-3">
            <h3 className="font-semibold">Medical Intake research observations</h3>
            {report.findings.map((f, i) => (
              <div key={i} className="report-avoid-break break-words text-sm">
                <strong>
                  {f.domain.toUpperCase()} — {f.kind}:
                </strong>{" "}
                {f.text}
                {f.observationIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Evidence IDs: {f.observationIds.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </section>

          <div className="print:hidden">
            <MedicalAdvisorWorkbench
              key={`${report.missionId}:${report.crewMemberId}:${report.provenance}`}
              report={report}
              authorizedMedicalRole={Boolean(
                identity?.memberships.some(
                  (m) =>
                    m.missionId === report.missionId &&
                    m.crewMemberId === report.crewMemberId &&
                    m.role === "ground_medical",
                ),
              )}
              advisorLabel="Authenticated ground-medical reviewer"
            />
          </div>

          <section aria-label="Limitations" className="report-avoid-break space-y-1">
            <h3 className="font-semibold">Limitations</h3>
            <ul className="list-disc space-y-1 pl-5 text-xs">
              {unified.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        </article>
      )}
    </main>
  );
}
