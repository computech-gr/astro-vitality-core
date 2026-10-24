import { MedicalAdvisorWorkbench } from "@/components/medical-advisor-workbench";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import { listUnifiedObservations } from "@/domain/health-intelligence/observation-store";
import {
  buildHealthHistoryReport,
  healthReportPlainText,
  REPORT_DISCLAIMER,
} from "@/domain/health-intelligence/health-history-report";
import type { UnifiedObservation } from "@/domain/health-intelligence/observation-envelope";

export function AstronautHealthReport() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [key, setKey] = useState("");
  const [provenance, setProvenance] = useState<"synthetic" | "real">("synthetic");
  const [records, setRecords] = useState<UnifiedObservation[]>([]);
  const [status, setStatus] = useState(
    "Select an authorized crew member to load locally stored observations.",
  );
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((v) => {
          if (active) setIdentity(v);
        })
        .catch(() => {
          if (active) setIdentity(null);
        });
    };
    refresh();
    const unsub = subscribeMissionIdentity(refresh);
    return () => {
      active = false;
      unsub();
    };
  }, []);
  const members = useMemo(
    () =>
      identity?.signedIn && !identity.error
        ? identity.memberships
            .filter(
              (m) => (m.role === "crew_self" || m.role === "ground_medical") && m.crewMemberId,
            )
            .map((m) => ({
              key: `${m.missionId}|${m.crewMemberId}`,
              missionId: m.missionId,
              crewMemberId: m.crewMemberId!,
              label: `${m.missionName ?? m.missionCode ?? m.missionId} — ${m.crewDisplayName ?? m.crewMemberId}`,
            }))
        : [],
    [identity],
  );
  const member = members.find((m) => m.key === key);
  useEffect(() => {
    setRecords([]);
    if (!member) return;
    let active = true;
    void listUnifiedObservations(member.missionId, member.crewMemberId)
      .then((v) => {
        if (active) {
          setRecords(v);
          setStatus(`${v.length} local observation record(s) loaded.`);
        }
      })
      .catch(() => {
        if (active) setStatus("Unable to read encrypted local records. No report generated.");
      });
    return () => {
      active = false;
    };
  }, [member?.missionId, member?.crewMemberId]);
  const report = member
    ? buildHealthHistoryReport(records, member.missionId, member.crewMemberId, provenance)
    : null;
  const printReport = () => window.print();
  const exportText = () => {
    if (!report) return;
    const blob = new Blob([healthReportPlainText(report)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitochondria-astronaut-health-research-report.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <header>
        <h1 className="text-3xl font-bold">Astronaut Health History &amp; Research Assessment</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          English-language, deterministic, evidence-linked research narrative based only on
          authorized encrypted local records. Use Print / Save as PDF for PDF export.
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
        <p className="text-xs text-muted-foreground">{status}</p>
        {!identity?.signedIn && (
          <Link className="underline" to="/mission/identity">
            Mission identity &amp; sign-in
          </Link>
        )}
      </section>
      {report && (
        <article className="space-y-5 rounded-lg border bg-card p-5 print:border-0 print:p-0">
          <div className="flex flex-wrap justify-between gap-3 print:hidden">
            <Button onClick={printReport} disabled={!report.observations.length}>
              Print / Save as PDF
            </Button>
            <Button variant="outline" onClick={exportText} disabled={!report.observations.length}>
              Export evidence text
            </Button>
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Health History &amp; Research Assessment</h2>
            <p className="text-sm">
              Mission: {report.missionId} · Crew: {report.crewMemberId}
            </p>
            <p className="text-sm">
              Source: {report.provenance.toUpperCase()} · Observations: {report.observations.length}{" "}
              · Generated: {report.generatedAt}
            </p>
            <p className="text-sm">
              Period: {report.periodStart ?? "No observations"} —{" "}
              {report.periodEnd ?? "No observations"}
            </p>
          </div>
          <p className="rounded border p-3 text-sm font-semibold">{REPORT_DISCLAIMER}</p>
          <h3 className="font-semibold">Research observations and limitations</h3>
          <div className="space-y-3">
            {report.findings.map((f, i) => (
              <div key={i} className="break-words text-sm">
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
          </div>
          <MedicalAdvisorWorkbench key={`${report.missionId}:${report.crewMemberId}:${report.provenance}`} report={report} authorizedMedicalRole={Boolean(identity?.memberships.some(m => m.missionId === report.missionId && m.crewMemberId === report.crewMemberId && m.role === "ground_medical"))} advisorLabel="Authenticated ground-medical reviewer" />
          <h3 className="font-semibold">Source measurements</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Domain / Metric</th>
                  <th>Result</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {report.observations.map((o) => (
                  <tr key={o.id} className="border-t align-top">
                    <td className="py-2">{o.observedAt}</td>
                    <td>
                      {o.domain} / {o.metricId}
                    </td>
                    <td>
                      {o.value} {o.originalUnit}
                    </td>
                    <td className="break-all">{o.source.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Excluded: {report.excluded.unreviewed} unreviewed, {report.excluded.erroneous}{" "}
            erroneous, {report.excluded.otherProvenance} other-provenance records. A missing entry
            is not a negative clinical finding.
          </p>
        </article>
      )}
    </main>
  );
}
