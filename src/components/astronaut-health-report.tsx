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
import { reportExportBasename } from "@/domain/health-intelligence/report-export-identity";
import { downloadReportBlob } from "@/domain/health-intelligence/report-pdf";
import { createTextReportPdf } from "@/domain/health-intelligence/report-text-pdf";
import { notifyReviewDataChanged, subscribeReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import { buildScientificFindings, scientificFindingsPlainText } from "@/domain/health-intelligence/scientific-findings";
import {
  buildScientificHealthSummary,
  EVIDENCE_TIER_LABELS,
  frontPageEvidenceLine,
  scientificHealthSummaryPlainText,
} from "@/domain/health-intelligence/scientific-health-summary";
import {
  ATTESTATION_REASON_MIN,
  ATTESTATION_STATUS_LABELS,
  attestationPlainText,
  attestationStateFor,
  canAttestEvidence,
  eligibleForAttestation,
  planAttestation,
  planRevocation,
  scopedAttestationEvents,
  summarizeAttestations,
  type AttestationEvent,
} from "@/domain/health-intelligence/evidence-attestation";
import { appendAttestationEvents, listAttestationEvents } from "@/domain/health-intelligence/review-ledger";
import { pdfExportErrorMessage } from "@/domain/health-intelligence/report-pdf";

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
  const reportRef = useRef<HTMLElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

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
                      missionName: m.missionName?.trim() || m.missionCode?.trim() || null,
                      crewDisplayName: m.crewDisplayName?.trim() || null,
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

  // Bumped when a correction, attestation, revocation or sync changes this scope (any tab).
  const [dataVersion, setDataVersion] = useState(0);
  const changeMissionId = member?.missionId;
  const changeCrewId = member?.crewMemberId;
  useEffect(() => {
    if (!changeMissionId || !changeCrewId) return;
    return subscribeReviewDataChanged((c) => {
      if (c.missionId === changeMissionId && c.crewMemberId === changeCrewId) setDataVersion((v) => v + 1);
    });
  }, [changeMissionId, changeCrewId]);

  const loadedScope = useRef("");
  useEffect(() => {
    const scopeKey = member ? `${member.missionId}|${member.crewMemberId}` : "";
    // A refresh for the same scope keeps the visible report until the new read completes.
    if (loadedScope.current !== scopeKey) setInputs(EMPTY_INPUTS);
    loadedScope.current = scopeKey;
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
  }, [member?.missionId, member?.crewMemberId, dataVersion]);

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
    [inputs, member, provenance],
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
    [inputs, member, provenance, from, to, sources],
  );

  // Roles held for exactly the selected mission + crew (never inferred from other memberships).
  const rolesForScope = useMemo(
    () =>
      member && identity?.signedIn && !identity.error
        ? identity.memberships
            .filter((m) => m.missionId === member.missionId && m.crewMemberId === member.crewMemberId)
            .map((m) => m.role)
        : [],
    [identity, member],
  );
  const canAttest = canAttestEvidence(rolesForScope) && Boolean(identity?.userId);
  const [attestations, setAttestations] = useState<AttestationEvent[]>([]);
  const [attestLoad, setAttestLoad] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attestReason, setAttestReason] = useState("");
  const [attestConfirmed, setAttestConfirmed] = useState(false);
  const [attestStatus, setAttestStatus] = useState("");
  const [attesting, setAttesting] = useState(false);

  const attestMissionId = member?.missionId;
  const attestCrewId = member?.crewMemberId;
  useEffect(() => {
    setAttestations([]);
    setSelected(new Set());
    setAttestConfirmed(false);
    setAttestStatus("");
    if (!attestMissionId || !attestCrewId) { setAttestLoad("idle"); return; }
    let active = true;
    setAttestLoad("loading");
    void listAttestationEvents({ missionId: attestMissionId, crewMemberId: attestCrewId, provenance })
      .then((events) => { if (active) { setAttestations(events); setAttestLoad("ready"); } })
      .catch(() => { if (active) setAttestLoad("error"); });
    return () => { active = false; };
  }, [attestMissionId, attestCrewId, provenance, identity?.userId, dataVersion]);

  const scopedAttestations = useMemo(() => (unified ? scopedAttestationEvents(attestations, unified.scope) : []), [attestations, unified]);
  const attestationSummary = useMemo(() => (unified ? summarizeAttestations(unified, scopedAttestations) : null), [unified, scopedAttestations]);
  const eligible = useMemo(() => (unified ? eligibleForAttestation(unified, scopedAttestations) : []), [unified, scopedAttestations]);

  const runAttestation = async (mode: "attest" | "revoke", recordId?: string) => {
    if (!member || !unified || attesting) return;
    const scope = { missionId: member.missionId, crewMemberId: member.crewMemberId, provenance };
    setAttesting(true);
    try {
      const fresh = await loadMissionIdentity();
      const freshRoles = fresh.signedIn && !fresh.error && fresh.userId === identity?.userId
        ? fresh.memberships.filter((m) => m.missionId === member.missionId && m.crewMemberId === member.crewMemberId).map((m) => m.role)
        : [];
      const ctx = { actorUserId: fresh.userId, rolesForScope: freshRoles, scope, decidedAt: new Date().toISOString() };
      const input = { reason: attestReason, confirmed: attestConfirmed };
      const plan = mode === "attest"
        ? planAttestation(unified, [...selected], scopedAttestations, ctx, input)
        : planRevocation(unified, recordId ?? "", scopedAttestations, ctx, input);
      if (!plan.ok) { setAttestStatus(plan.reason); return; }
      const saved = await appendAttestationEvents(plan.events, scope, ctx);
      const events = await listAttestationEvents(scope);
      setAttestations(events);
      notifyReviewDataChanged({ missionId: scope.missionId, crewMemberId: scope.crewMemberId });
      setSelected(new Set());
      setAttestConfirmed(false);
      setAttestStatus(`${mode === "attest" ? "Attested" : "Revoked"} ${saved.inserted} record(s)${saved.duplicates ? `, ${saved.duplicates} already recorded` : ""}${saved.failed.length ? `, ${saved.failed.length} FAILED (${saved.failed.map((f) => f.recordId).join(", ")}: ${saved.failed[0]!.message}) — retry those records` : ""}${plan.skipped.length ? `, ${plan.skipped.length} skipped (${plan.skipped[0]!.reason})` : ""}. Batch ${plan.batchId}. Stored encrypted on this device; catalog and scientific review status unchanged.`);
    } catch (error) {
      setAttestStatus(error instanceof Error ? error.message : "Attestation could not be saved. Nothing was changed.");
    } finally { setAttesting(false); }
  };

  const findings = useMemo(() => unified ? buildScientificFindings(unified) : null, [unified]);
  const healthSummary = useMemo(
    () => (unified && findings ? buildScientificHealthSummary(unified, findings, report, attestationSummary) : null),
    [unified, findings, report, attestationSummary],
  );

  const exportName = member ? reportExportBasename({ ...member, ...(unified ? { generatedAt: unified.generatedAt } : {}), provenance }) : "MITOCHONDRIA_Health_Report";
  const currentExport = useRef({ unified, userId: identity?.userId });
  currentExport.current = { unified, userId: identity?.userId };
  const performExport = async (kind: "pdf" | "text" | "print") => {
    if (!member || !report || !unified || exporting) return;
    const snapshot = currentExport.current;
    const stillCurrent = () => currentExport.current.unified === snapshot.unified && currentExport.current.userId === snapshot.userId;
    setExporting(true);
    setExportStatus(kind === "pdf" ? "Preparing searchable A4 PDF locally…" : "Checking authorized report scope…");
    try {
      const fresh = await loadMissionIdentity();
      const authorized = fresh.signedIn && !fresh.error && fresh.userId === snapshot.userId && fresh.memberships.some(m =>
        m.missionId === member.missionId && m.crewMemberId === member.crewMemberId && (m.role === "crew_self" || m.role === "ground_medical"));
      if (!authorized || !stillCurrent()) throw new Error("Report authorization or selection changed. Export cancelled.");
      if (kind === "print") {
        // Print is a separate, explicit browser action; it is never used as a silent PDF fallback.
        const previous = document.title;
        try { document.title = exportName; window.print(); } finally { document.title = previous; }
        setExportStatus("Print dialog requested.");
      } else if (kind === "text") {
        const text = `Mission: ${member.missionName ?? member.missionId}\nAstronaut: ${member.crewDisplayName ?? "Crew identity unavailable"}\nMission ID: ${member.missionId}\nCrew ID: ${member.crewMemberId}\n\n${unifiedReportPlainText(unified)}\n\n${healthSummary ? scientificHealthSummaryPlainText(healthSummary) : ""}\n\n${findings ? scientificFindingsPlainText(findings) : ""}\n\n${attestationPlainText(unified, scopedAttestations)}\n\n${healthReportPlainText(report)}`;
        downloadReportBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `${exportName}.txt`);
        setExportStatus(`Evidence TXT created locally and download started as ${exportName}.txt. No medical data was uploaded.`);
      } else {
        let blob: Blob;
        let pdfInfo = "";
        try {
          // Searchable text PDF built from the same read models as screen/TXT (never a DOM screenshot).
          const result = await createTextReportPdf({
            unified,
            findings,
            summary: healthSummary,
            history: report,
            attestations: scopedAttestations,
            identity: { missionName: member.missionName, crewDisplayName: member.crewDisplayName },
            title: exportName,
          });
          blob = result.blob;
          pdfInfo = `${result.pages} pages, searchable text${result.fontMode === "standard" ? "; embedded Unicode font unavailable, some symbols simplified" : ""}`;
        } catch (pdfError) {
          // Download PDF must never silently invoke the separate Print action.
          throw new Error(pdfExportErrorMessage(pdfError));
        }
        const after = await loadMissionIdentity();
        if (!stillCurrent() || !after.signedIn || after.error || after.userId !== snapshot.userId || !after.memberships.some(m =>
          m.missionId === member.missionId && m.crewMemberId === member.crewMemberId && (m.role === "crew_self" || m.role === "ground_medical"))) throw new Error("Report authorization or selection changed. Export cancelled; no PDF was downloaded.");
        downloadReportBlob(blob, `${exportName}.pdf`);
        setExportStatus(`PDF created locally (${pdfInfo}, ${(blob.size / 1_048_576).toFixed(2)} MB) and download started as ${exportName}.pdf. Check your browser downloads. No medical data was uploaded.`);
      }
    } catch (error) {
      setExportStatus(error instanceof Error ? error.message : "Export failed. No file downloaded.");
    } finally { setExporting(false); }
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
          authorized encrypted local storage only; nothing
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
        <article ref={reportRef} className="report-print medical-report-ui space-y-5 rounded-lg border p-5 print:border-0 print:p-0">
          <div className="flex flex-wrap justify-between gap-3 print:hidden">
            <Button className="medical-action-primary" disabled={exporting} onClick={() => void performExport("pdf")}>Download PDF</Button>
            <Button className="medical-action-secondary" variant="outline" disabled={exporting} onClick={() => void performExport("print")}>Print</Button>
            <Button className="medical-action-secondary" variant="outline" disabled={exporting} onClick={() => void performExport("text")}>
              Export evidence text
            </Button>
          </div>
          <p className="print:hidden text-xs text-muted-foreground" role="status" aria-live="polite">{exportStatus}</p>
          <div className="report-print-header hidden print:flex">
            <span>MITOCHONDRIA · Unified Health &amp; Device Report</span>
            <span>RESEARCH USE ONLY · {unified.scope.provenance.toUpperCase()}</span>
          </div>
          <div className="report-print-footer hidden print:flex">
            <span>
              {member?.missionName ?? unified.scope.missionId} / {member?.crewDisplayName ?? unified.scope.crewMemberId}
            </span>
            <span>Generated {unified.generatedAt} UTC · not a diagnosis</span>
          </div>
          <div className="report-cover space-y-1">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground">
              MITOCHONDRIA
            </p>
            <h2 className="text-xl font-semibold">Unified Health &amp; Device Report</h2>
            <p className="text-sm">
              Mission: {member?.missionName ?? unified.scope.missionId} · Astronaut: {member?.crewDisplayName ?? "Crew identity unavailable"}
            </p>
            <p className="text-xs text-muted-foreground">Mission ID: {unified.scope.missionId} · Crew ID: {unified.scope.crewMemberId}</p>
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
          <p className="report-disclaimer rounded-md border p-3 text-sm font-semibold">{REPORT_DISCLAIMER}</p>

          {healthSummary && (
            <section aria-label="Scientific summary at a glance" className="report-avoid-break space-y-2 rounded-lg border p-4">
              <h3 className="font-semibold">Scientific summary at a glance</h3>
              <ul className="list-disc pl-5 text-sm">{healthSummary.frontPage.keyPoints.map((p) => <li key={p}>{p}</li>)}</ul>
              <p className="report-evidence-id text-xs text-muted-foreground">
                {frontPageEvidenceLine(healthSummary.frontPage.evidenceIds)}
              </p>
              <ul className="list-disc pl-5 text-xs">
                {healthSummary.domainInterpretation.map((d) => (
                  <li key={d.domain}><strong>{d.domain}</strong> ({d.present ? "data present" : "no included data"}): {d.source ? `${d.source}. ` : ""}{d.status}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{healthSummary.frontPage.interpretationStatus}</p>
            </section>
          )}

          <section aria-label="Domain overview" className="report-avoid-break space-y-2">
            <h3 className="font-semibold">Domain overview</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {unified.summaries.map((s) => (
                <div key={s.badge} className="report-domain-card report-avoid-break rounded-lg border p-3">
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

          {healthSummary && (
            <section aria-label="Scientific Health Summary" className="space-y-3 rounded-lg border p-4">
              <div className="report-avoid-break space-y-2">
                <h3 className="text-lg font-semibold">Scientific Health Summary</h3>
                <p className="text-sm font-semibold">Research summary only — no diagnosis, treatment, risk score or fitness-for-duty judgment.</p>
                <ul className="space-y-1 text-xs">
                  {healthSummary.evidenceTiers.map((t) => (
                    <li key={t.tier}><strong>{EVIDENCE_TIER_LABELS[t.tier]}: {t.count}.</strong> {t.note}</li>
                  ))}
                </ul>
              </div>
              <div className="report-avoid-break space-y-1">
                <h4 className="font-semibold">1. What was measured and changed</h4>
                {healthSummary.measured.length ? <ul className="list-disc pl-5 text-sm">{healthSummary.measured.map((m) => <li key={m}>{m}</li>)}</ul> : <p className="text-sm">No included observations in this scope.</p>}
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold">2. Supported versus insufficient</h4>
                <ul className="list-disc pl-5 text-sm">
                  {healthSummary.supported.map((m) => <li key={m} className="report-avoid-break">Supported (descriptive): {m}</li>)}
                  {healthSummary.insufficient.map((m) => <li key={m} className="report-avoid-break">Insufficient: {m}</li>)}
                  {!healthSummary.supported.length && !healthSummary.insufficient.length ? <li>No numeric evidence in this scope.</li> : null}
                </ul>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold">3. Possible biological implications (handbook-documented, pending review)</h4>
                {healthSummary.implications.length ? <ul className="list-disc pl-5 text-sm">{healthSummary.implications.map((i) => <li key={i.metricId + i.direction} className="report-avoid-break">
                  <strong>{i.label}</strong> ({i.metricId}, {i.direction}): {i.statement}
                  <span className="report-evidence-id block text-xs text-muted-foreground">{i.handbook} · {i.reviewStatus} · Evidence IDs: {i.evidenceIds.join(", ")}</span>
                </li>)}</ul> : <p className="text-sm">No handbook-documented implication applies to the observed changes.</p>}
                {healthSummary.implicationGaps.length ? <ul className="list-disc pl-5 text-xs text-muted-foreground">{healthSummary.implicationGaps.map((g) => <li key={g} className="report-avoid-break">{g}</li>)}</ul> : null}
              </div>
              <div className="report-avoid-break space-y-1">
                <h4 className="font-semibold">4. Nikolas-governed cross-domain context</h4>
                <ul className="list-disc pl-5 text-sm">{healthSummary.crossDomain.map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold">5. Missing data, uncertainty and confounders</h4>
                <ul className="list-disc pl-5 text-sm">{healthSummary.uncertainty.map((u) => <li key={u} className="report-avoid-break">{u}</li>)}</ul>
              </div>
              <div className="report-avoid-break space-y-1">
                <h4 className="font-semibold">6. Qualified Ground Medical follow-up considerations</h4>
                <ul className="list-disc pl-5 text-sm">{healthSummary.followUp.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
              <div className="report-avoid-break space-y-1">
                <h4 className="font-semibold">Domain coverage versus Medical Intake</h4>
                <ul className="list-disc pl-5 text-xs">{healthSummary.reconciliation.map((r) => <li key={r.domain}>
                  <strong>{r.domain}:</strong> {r.reportIncluded} included ({r.storedObservations} module, {r.reviewerAcceptedIntake} intake); Medical Intake accepted {r.medicalIntakeAccepted}. {r.explanation}
                </li>)}</ul>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">{healthSummary.boundaries.map((b) => <li key={b}>{b}</li>)}</ul>
              </div>
            </section>
          )}

          {/* Keep individual findings together, not the whole section: a section taller than one A4 page made direct PDF export fail. */}
          {findings && <section aria-label="Scientific Findings and Interpretation" className="space-y-3 rounded-lg border p-4">
            <div className="report-avoid-break space-y-3">
              <h3 className="text-lg font-semibold">Scientific Findings &amp; Interpretation</h3>
              <p className="text-sm font-semibold">Research interpretation only — not an automated medical opinion or diagnosis.</p>
            </div>
            <h4 className="font-semibold">Measured observations and descriptive changes</h4>
            {findings.metrics.length === 0 ? <p className="text-sm">No eligible numeric evidence in this report scope.</p> : <ul className="list-disc space-y-2 pl-5 text-sm">{findings.metrics.map((m) => <li key={`${m.metricId}:${m.unit}:${m.first}`} className="report-avoid-break">
              <strong>{m.label}</strong> ({m.metricId}): {m.count} observation(s); {m.delta === null ? "insufficient comparable time points" : `${m.earliestValue} → ${m.latestValue} ${m.unit} (first-to-last difference ${m.delta} ${m.unit})`}. {m.note} Evidence IDs: {m.evidenceIds.join(", ")}.
            </li>)}</ul>}
            <h4 className="font-semibold">Cross-domain scientific context</h4>
            {findings.crossDomain.length ? <ul className="list-disc space-y-2 pl-5 text-sm">{findings.crossDomain.map((c) => {
              const observed = c.signals.filter((s) => !c.missingSignals.includes(s));
              return <li key={c.domains.join("-")} className="report-avoid-break">
                <strong>{c.domains.join(" + ")}</strong>: {c.statement}
                <span className="block">Observed signals: {observed.join(", ") || "none"}.</span>
                <span className="block">Missing signals: {c.missingSignals.join(", ") || "none"}.</span>
                <span className="block">Evidence IDs: {c.evidenceIds.join(", ") || "none"}.</span>
                <span className="block">Uncertainty: co-observation is not an association; missing signals are not negative findings.</span>
              </li>;
            })}</ul> : <p className="text-sm">No governed cross-domain relationship has sufficient co-observed signal coverage. No association inferred.</p>}
            <h4 className="font-semibold">Missing data and uncertainty</h4>
            <p className="text-sm">Missing domains: {findings.missingDomains.join(", ") || "none in selected report scope"}. A missing domain is not a negative finding.</p>
            <h4 className="font-semibold">Qualified human review</h4>
            {findings.reviewItems.length ? <ul className="list-disc pl-5 text-sm">{findings.reviewItems.map((item, i) => <li key={i} className="report-avoid-break">{item}</li>)}</ul> : <p className="text-sm">Any clinical interpretation still requires independent qualified medical review.</p>}
            <h4 className="font-semibold">Scientific limitations</h4>
            <ul className="list-disc pl-5 text-xs">{findings.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>}

          <section id="ground-medical-attestation" aria-label="Ground Medical evidence attestation" className="scroll-mt-24 space-y-2 rounded-lg border p-4">
            <div className="report-avoid-break space-y-1">
              <h3 className="font-semibold">Ground Medical evidence attestation (second stage, optional)</h3>
              <p className="text-xs text-muted-foreground">If you arrived from Medical Intake, select the same authorized mission, crew, SYNTHETIC/REAL provenance and reporting period. The controls below appear only for an authorized Ground Medical reviewer. Scroll to the chronological records to select individual rows; Select all eligible selects only records in this report scope.</p>
              <p className="text-xs text-muted-foreground">
                Every row below is already an accepted stored observation. Attestation is an additional, append-only
                confirmation by an authenticated Ground Medical member for exactly this mission, crew member and provenance.
                Rows without one remain accepted. Attestation never changes catalog or scientific review status
                (PENDING_NIKOLAS_REVIEW) and is not a diagnosis or legal signature.
              </p>
              {attestationSummary && (
                <p className="text-sm" role="status">
                  {attestLoad === "loading" ? "Reading the encrypted attestation ledger…"
                    : attestLoad === "error" ? "The attestation ledger could not be read; attestation status is unavailable, not absent."
                    : `Attested ${attestationSummary.attested} · accepted without attestation ${attestationSummary.notAttested} · revoked ${attestationSummary.revoked} · earlier record version ${attestationSummary.stale} · ${attestationSummary.events} audit event(s).`}
                </p>
              )}
            </div>
            {canAttest ? (
              <div className="space-y-2 print:hidden">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="medical-action-secondary" disabled={attesting || !eligible.length} onClick={() => setSelected(new Set(eligible.map((e) => e.recordId)))}>
                    Select all eligible ({eligible.length})
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="medical-action-secondary" disabled={attesting || !selected.size} onClick={() => setSelected(new Set())}>
                    Clear selection
                  </Button>
                </div>
                <label className="block text-sm" htmlFor="attest-reason">Reason (required, at least {ATTESTATION_REASON_MIN} characters; also used for revocations)</label>
                <textarea id="attest-reason" className="medical-advisor-input w-full rounded border p-2 text-sm" rows={2} maxLength={500} value={attestReason} onChange={(e) => setAttestReason(e.target.value)} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={attestConfirmed} onChange={(e) => setAttestConfirmed(e.target.checked)} />
                  I confirm I reviewed the source evidence of each selected record for this mission and crew member.
                </label>
                <Button type="button" className="medical-action-primary" disabled={attesting || !selected.size || !attestConfirmed || attestReason.trim().length < ATTESTATION_REASON_MIN} onClick={() => void runAttestation("attest")}>
                  Attest selected ({selected.size})
                </Button>
                {attestStatus && <p className="text-xs text-muted-foreground" role="status">{attestStatus}</p>}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground print:hidden">View only: attestation requires the Ground Medical role for this exact mission and crew member.</p>
            )}
            {scopedAttestations.length > 0 && (
              <details className="text-xs" open>
                <summary className="cursor-pointer">Attestation audit history (append-only)</summary>
                <ol className="mt-1 list-decimal space-y-1 pl-5">
                  {[...scopedAttestations].sort((a, b) => a.decidedAt.localeCompare(b.decidedAt) || a.eventId.localeCompare(b.eventId)).map((e) => (
                    <li key={e.eventId} className="report-avoid-break break-words">
                      {e.decidedAt} · {e.action === "attest" ? "Attested" : "Revoked"} {e.recordId} · Ground Medical {e.actorUserId} · event {e.eventId}
                      {e.supersedesEventId ? ` (supersedes ${e.supersedesEventId})` : ""} · {e.reason}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </section>

          <section aria-label="Chronological history" className="space-y-2">
            <h3 className="font-semibold">Chronological history</h3>
            {unified.rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No included observations for this selection. Nothing is inferred.
              </p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="report-table report-history-table w-full table-fixed text-left text-xs">
                  <colgroup>
                    <col className="report-col-date" />
                    <col className="report-col-source" />
                    <col className="report-col-metric" />
                    <col className="report-col-result" />
                    <col className="report-col-status" />
                    <col className="report-col-evidence" />
                  </colgroup>
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
                        <td className="report-date-cell py-2 pr-2 tabular-nums">
                          <time dateTime={r.observedAt}>
                            <span className="block">{r.observedAt.slice(0, 10)}</span>
                            <span className="block">{r.observedAt.slice(11)}</span>
                          </time>
                        </td>
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
                          {(() => {
                            const state = attestationStateFor(r, scopedAttestations);
                            const isEligible = eligible.some((e) => e.recordId === r.recordId);
                            return (
                              <>
                                <span className="report-attestation block text-muted-foreground">
                                  {ATTESTATION_STATUS_LABELS[state.status]}
                                  {state.latest ? ` · ${state.latest.decidedAt.slice(0, 16)}Z` : ""}
                                </span>
                                {canAttest && (
                                  <span className="flex flex-wrap items-center gap-2 print:hidden">
                                    {isEligible && (
                                      <label className="inline-flex items-center gap-1">
                                        <input
                                          type="checkbox"
                                          aria-label={`Select ${r.recordId} for attestation`}
                                          checked={selected.has(r.recordId)}
                                          onChange={(e) => setSelected((prev) => {
                                            const next = new Set(prev);
                                            if (e.target.checked) next.add(r.recordId); else next.delete(r.recordId);
                                            return next;
                                          })}
                                        />
                                        Select
                                      </label>
                                    )}
                                    {state.status === "attested" && (
                                      <button type="button" className="underline" disabled={attesting} onClick={() => void runAttestation("revoke", r.recordId)}>
                                        Revoke
                                      </button>
                                    )}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="report-evidence-cell">
                          {r.sourceLabel}
                          <span className="report-evidence-id block text-muted-foreground">
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
              <table className="report-table report-exclusions-table w-full table-fixed text-left text-xs">
                <colgroup>
                  <col className="report-col-exclusion-status" />
                  <col className="report-col-exclusion-source" />
                  <col className="report-col-exclusion-id" />
                  <col className="report-col-exclusion-reason" />
                </colgroup>
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
            <p className="text-xs text-muted-foreground">
              Lists only reviewer-accepted Unified Intake observations for the full period, without the
              date or source filters above. Health module entries and device rows are counted in the
              domain overview, so domain counts can differ. Not reviewed: {report.excluded.unreviewed} ·
              erroneous: {report.excluded.erroneous} · other provenance: {report.excluded.otherProvenance}.
            </p>
            {report.findings.map((f, i) => (
              <div key={i} className="report-avoid-break break-words text-sm">
                <strong>
                  {f.domain.toUpperCase()} — {f.kind}:
                </strong>{" "}
                {f.text}
                {f.observationIds.length > 0 && (
                  <p className="report-evidence-id text-xs text-muted-foreground">
                    Evidence IDs: {f.observationIds.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </section>

          <div className="print:hidden space-y-2 rounded-lg border border-dashed p-3" aria-label="AI-assisted drafts (unverified)">
            <p className="text-xs font-semibold">
              AI-assisted drafts — UNVERIFIED. Kept separate from the scientific findings above, never counted as approved
              interpretation, and excluded from the PDF and TXT exports.
            </p>
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
