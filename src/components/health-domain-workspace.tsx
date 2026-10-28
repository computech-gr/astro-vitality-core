"use client";

import { useEffect, useState } from "react";
import { loadMissionIdentity, subscribeMissionIdentity } from "@/infrastructure/mission-identity";
import { HealthDomainNavigation } from "@/components/health-domain-navigation";
import { ScientificCatalogPicker } from "@/components/scientific-catalog-picker";
import { supabase } from "@/integrations/supabase/client";

import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import {
  getHealthDomain,
  projectDomainEvidence,
  type HealthDomainId,
} from "@/domain/health-domains/registry";
import { REVIEWED_INTELLIGENCE_PATTERNS_V1_1 } from "@/domain/health-intelligence/patterns";
import proposedCatalog from "../../data/scientific/p355-proposed-domain-catalog.v1.json";
import { CardiovascularHandbookReference } from "@/components/scientific-handbook-reference";

export function HealthDomainWorkspace({ domainId }: { domainId: HealthDomainId }) {
  const domain = getHealthDomain(domainId);
  const draftCatalog = proposedCatalog.entries.filter((item) => item.domain === domainId);
  const [memberships, setMemberships] = useState<
    Array<{ missionId: string; crewMemberId: string; missionLabel: string; crewLabel: string }>
  >([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const [message, setMessage] = useState("Checking private Crew Self access...");
  useEffect(() => {
    let active = true;
    let generation = 0;
    const refresh = () => {
      const request = ++generation;
      void loadMissionIdentity().then(async (context) => {
        if (!active || request !== generation) return;
        const eligible = context.signedIn && !context.error
          ? context.memberships.filter((member) =>
              member.role === "crew_self" || member.role === "ground_medical")
          : [];
        const medicalMissionIds = [...new Set(eligible.filter((member) =>
          member.role === "ground_medical").map((member) => member.missionId))];
        const { data: roster, error: rosterError } = medicalMissionIds.length
          ? await supabase.from("mission_memberships")
              .select("mission_id, crew_member_id, role, active")
              .in("mission_id", medicalMissionIds).eq("active", true).eq("role", "crew_self")
          : { data: [], error: null };
        if (!active || request !== generation) return;
        if (rosterError) throw rosterError;
        const scoped = [
          ...eligible.filter((member) => member.role === "crew_self" && member.crewMemberId)
            .map((member) => ({ missionId: member.missionId, crewMemberId: member.crewMemberId! })),
          ...(roster ?? []).filter((member) => Boolean(member.crew_member_id))
            .map((member) => ({ missionId: member.mission_id, crewMemberId: member.crew_member_id! })),
        ];
        const unique = [...new Map(scoped.map((member) =>
          [`${member.missionId}|${member.crewMemberId}`, member])).values()];
        const missionIds = [...new Set(unique.map((member) => member.missionId))];
        const crewIds = [...new Set(unique.map((member) => member.crewMemberId))];
        const [missionsResult, crewResult] = await Promise.all([
          missionIds.length ? supabase.from("missions").select("id, code, name").in("id", missionIds) : Promise.resolve({ data: [], error: null }),
          crewIds.length ? supabase.from("crew_members").select("id, display_name").in("id", crewIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (!active || request !== generation) return;
        if (missionsResult.error || crewResult.error) throw new Error("Authorized roster labels unavailable.");
        const missionLabels = new Map((missionsResult.data ?? []).map((row) =>
          [row.id, row.name ?? row.code ?? row.id]));
        const crewLabels = new Map((crewResult.data ?? []).map((row) =>
          [row.id, row.display_name ?? row.id]));
        const options = unique.map((member) => ({
          ...member,
          missionLabel: missionLabels.get(member.missionId) ?? member.missionId,
          crewLabel: crewLabels.get(member.crewMemberId) ?? member.crewMemberId,
        }));
        setMemberships(options);
        setSelected((previous) => options.some((member) =>
          `${member.missionId}|${member.crewMemberId}` === previous)
          ? previous : options.length ? `${options[0]!.missionId}|${options[0]!.crewMemberId}` : "");
        if (!options.length) {
          setReport(null);
          setMessage("No authorized Crew Self or Ground Medical mission/crew selection is available.");
        }
      }).catch(() => {
        if (!active || request !== generation) return;
        setMemberships([]);
        setSelected("");
        setReport(null);
        setMessage("Mission authorization or roster unavailable. No private data loaded.");
      });
    };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { active = false; generation++; unsubscribe(); };
  }, []);
  useEffect(() => {
    const member = memberships.find(
      (item) => `${item.missionId}|${item.crewMemberId}` === selected,
    );
    setReport(null);
    if (!member) return;
    let active = true;
    setMessage("Loading authorized, read-only evidence...");
    void loadCrewScientificEvidence(member.missionId, member.crewMemberId)
      .then((result) => {
        if (!active) return;
        setReport(result.report);
        setMessage(
          result.reason ??
            (result.report
              ? "Mission evidence loaded; no health interpretation performed."
              : "Evidence unavailable."),
        );
      })
      .catch(() => {
        if (active) setMessage("Unable to load evidence. No interpretation performed.");
      });
    return () => {
      active = false;
    };
  }, [memberships, selected]);
  const summaries =
    report?.metrics.filter((metric) => domain.metricCodes.includes(metric.metricCode)) ?? [];
  const coverage = projectDomainEvidence(
    domain,
    summaries.map((metric) => metric.metricCode),
  );
  const patterns = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.filter((pattern) =>
    domain.patternIds.includes(pattern.id),
  );
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 text-foreground">
      <p className="section-kicker">P26 · Integrated Astronaut Health Domains</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">
        {domain.title} — Measurements &amp; Reference
      </h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">{domain.scope}</p>
      <p className="mt-3 rounded-md border border-border p-3 text-sm" role="status">
        {domainId === "immune" || domainId === "behavioral"
          ? "Scientific handbook integrated. Measurement-level validation is awaiting independent review. Research reference only."
          : domain.reviewState === "scientific_review_pending"
            ? "Scientific domain review pending. Existing evidence is displayed without clinical inference."
            : "Bone handbook mapping available. Clinical validation and approved thresholds are not established."}
      </p>
      <HealthDomainNavigation current={domainId} />
      {domainId === "cardiovascular" && <CardiovascularHandbookReference />}
      {(domainId === "immune" || domainId === "behavioral") && (
        <section
          className="mt-7 rounded-xl border border-border p-5"
          aria-label="Scientific draft catalog"
        >
          <h2 className="text-xl font-semibold">Scientific reference catalog · {domainId === "immune" ? "IMM" : "BSC"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            MITOCHONDRIA scientific reference proposals, with supporting Nikolas handbook sources.
            The project owner reports that Nikolas completed verbal review of these entries.
            Formal per-entry reconciliation and signed reviewer confirmation are not yet recorded;
            operational measurement activation and clinical validation are separate.
          </p>
          <ScientificCatalogPicker entries={draftCatalog} />
          <p className="mt-3 text-sm">
            Synthetic document review remains a separate, human-controlled process.{" "}
            <a className="underline" href="/mission/documents">
              Open Mission Documents
            </a>
            .
          </p>
        </section>
      )}

      <section
        className="mt-8 rounded-xl border border-border p-5"
        aria-label="Private domain evidence"
      >
        <h2 className="text-xl font-semibold">Mission-scoped measurements</h2>
        {memberships.length > 1 && (
          <label className="mt-3 block text-sm">
            Authorized mission / crew{" "}
            <select
              className="ml-2 rounded-md border border-border bg-background p-2"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {memberships.map((member) => (
                <option
                  key={`${member.missionId}|${member.crewMemberId}`}
                  value={`${member.missionId}|${member.crewMemberId}`}
                >
                  {member.missionLabel} — {member.crewLabel}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {message}
        </p>
        {report && (
          <section
            className="mt-4 rounded-lg border border-border p-4"
            aria-label="Domain research evidence summary"
          >
            <h3 className="font-semibold">Research evidence summary · read-only</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Mission-scoped synthetic observations only. This is not a medical report, diagnosis,
              clearance or approved baseline. Measurements are not automatically approved by
              appearing here.
            </p>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium">Available metric series</dt>
                <dd>
                  {summaries.length} of {domain.metricCodes.length} mapped signals
                </dd>
              </div>
              <div>
                <dt className="font-medium">Missing mapped signals</dt>
                <dd>{coverage.missing.length}</dd>
              </div>
              <div>
                <dt className="font-medium">Observed events</dt>
                <dd>
                  {summaries.reduce((total, metric) => total + metric.count, 0)} (series counts;
                  shared events may overlap domains)
                </dd>
              </div>
              <div>
                <dt className="font-medium">Quality-limited series</dt>
                <dd>{summaries.filter((metric) => metric.status === "quality_blocked").length}</dd>
              </div>
            </dl>
            {summaries.length > 0 && (
              <div className="mt-3 space-y-2">
                {summaries.map((metric) => (
                  <div
                    key={`${metric.metricCode}|${metric.unit}`}
                    className="rounded border border-border p-3 text-sm"
                  >
                    <p className="font-medium">
                      {metric.metricCode} · {metric.unit}
                    </p>
                    <p>
                      Latest: {metric.latest.value} · {metric.latest.quality} quality ·{" "}
                      {metric.status.replaceAll("_", " ")}
                    </p>
                    <p className="break-all text-muted-foreground">
                      Source: {metric.latest.sourceId} · {metric.latest.location} ·{" "}
                      {metric.latest.classification}
                    </p>
                    {metric.previous && (
                      <p>
                        Previous: {metric.previous.value} {metric.unit} · descriptive change:{" "}
                        {metric.changeFromPrevious ?? "unavailable"} {metric.unit}
                      </p>
                    )}
                    {!metric.previous && (
                      <p className="text-muted-foreground">
                        No previous observation for comparison.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {report.warnings.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="font-medium">Evidence limitations</p>
                <ul className="list-disc pl-5">
                  {report.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Scientific catalog entries remain inactive for operational ingestion pending documented reconciliation. Device readings are
              included only if they already exist in this authorized evidence projection; pending
              offline sync is not treated as cloud-confirmed.
            </p>
          </section>
        )}
        {report && (
          <>
            <p className="mt-3 text-sm">
              {summaries.length} domain series · {coverage.missing.length} mapped signals without
              evidence
            </p>
            {summaries.length ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {summaries.map((metric) => (
                  <article
                    key={`${metric.metricCode}|${metric.unit}`}
                    className="rounded-md border border-border p-3 text-sm"
                  >
                    <h3 className="font-semibold">{metric.metricCode}</h3>
                    <p>
                      Latest observed: {metric.latest.value} {metric.unit}
                    </p>
                    <p>
                      Quality: {metric.latest.quality} · {metric.count} observations
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(metric.latest.observedAt).toLocaleString()}
                    </p>
                    {metric.baseline && (
                      <p>
                        Historical mean (descriptive only): {metric.baseline.mean.toPrecision(4)}{" "}
                        {metric.unit}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No matching numeric measurements are available for this mission and domain.
              </p>
            )}
            {coverage.missing.length > 0 && (
              <details className="mt-4 text-sm">
                <summary>Missing mapped signals ({coverage.missing.length})</summary>
                <p className="mt-2 text-muted-foreground">{coverage.missing.join(" · ")}</p>
              </details>
            )}
          </>
        )}
      </section>
      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold">Scientific relationship registry</h2>
          {patterns.map((pattern) => (
            <div key={pattern.id} className="mt-4 border-t border-border pt-3 text-sm">
              <h3 className="font-semibold">{pattern.displayName}</h3>
              <p className="text-muted-foreground">{pattern.summary}</p>
              <p className="mt-2">
                {pattern.operationalStatus.replaceAll("_", " ")} · {pattern.sourceIds.join(", ")}
              </p>
              <p className="mt-1 text-muted-foreground">
                {report?.patterns
                  .find((entry) => entry.id === pattern.id)
                  ?.status.replaceAll("_", " ") ?? "Not evaluated"}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold">Interpretation boundaries</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {domain.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
            <li>
              Evidence presence does not prove a relationship, temporal coincidence, causation or
              health status.
            </li>
            <li>No autonomous diagnosis, alert, treatment or readiness decision.</li>
          </ul>
          <a className="mt-5 inline-block text-sm underline" href="/mission/intelligence">
            Open Health Intelligence
          </a>
        </div>
      </section>
      {domainId === "bone" && (
        <p className="mt-7 text-sm">
          For encrypted bone-health entry and document import,{" "}
          <a className="underline" href="/mission/bone-health">
            open the existing Bone Health workspace
          </a>
          .
        </p>
      )}
    </main>
  );
}
