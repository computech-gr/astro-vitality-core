"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { buildUnifiedHealthReport, type UnifiedReportInputs } from "@/domain/health-intelligence/unified-health-report";
import { loadUnifiedReportInputs } from "@/domain/health-intelligence/unified-health-report-loader";
import { buildScientificFindings } from "@/domain/health-intelligence/scientific-findings";
import { buildResearcherInterpretation, RESEARCHER_DOMAIN_LABELS, type ResearcherDomain } from "@/domain/health-intelligence/researcher-interpretation";
import { listAttestationEvents } from "@/domain/health-intelligence/review-ledger";
import { scopedAttestationEvents, type AttestationEvent } from "@/domain/health-intelligence/evidence-attestation";
import { subscribeReviewDataChanged } from "@/domain/health-intelligence/review-change-events";
import { ModuleInterpretationView } from "@/components/researcher-interpretation-view";

/**
 * v9.5 module-level view of the shared deterministic interpretation model.
 * Same authorization as the Medical Report (Crew Self or Ground Medical for the
 * exact mission and crew member), same encrypted local read, same builder used
 * by the Unified Health PDF and TXT. Read-only: no writes, uploads or AI.
 */
export function ResearcherInterpretationPanel({ domainId }: { domainId: ResearcherDomain }) {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  const [key, setKey] = useState("");
  const [provenance, setProvenance] = useState<"synthetic" | "real">("synthetic");
  const [inputs, setInputs] = useState<UnifiedReportInputs | null>(null);
  const [attestations, setAttestations] = useState<AttestationEvent[]>([]);
  const [status, setStatus] = useState("Checking authorized access…");
  const [version, setVersion] = useState(0);
  const userRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((v) => {
          if (!active) return;
          const userId = v.signedIn && !v.error ? v.userId : undefined;
          if (userId !== userRef.current) {
            setInputs(null);
            setAttestations([]);
            setKey("");
          }
          userRef.current = userId;
          setIdentity(v);
        })
        .catch(() => {
          if (!active) return;
          userRef.current = undefined;
          setIdentity(null);
          setInputs(null);
          setAttestations([]);
          setKey("");
          setStatus("Access could not be verified. Nothing is shown.");
        });
    };
    refresh();
    const unsub = subscribeMissionIdentity(refresh);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; unsub(); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const members = useMemo(() => {
    if (!identity?.signedIn || identity.error) return [];
    const list = identity.memberships
      .filter((m) => (m.role === "crew_self" || m.role === "ground_medical") && m.crewMemberId)
      .map((m) => ({
        key: `${m.missionId}|${m.crewMemberId}`,
        missionId: m.missionId,
        crewMemberId: m.crewMemberId as string,
        label: `${m.missionName ?? m.missionCode ?? m.missionId} — ${m.crewDisplayName ?? m.crewMemberId}`,
      }));
    return [...new Map(list.map((m) => [m.key, m])).values()];
  }, [identity]);
  const member = members.find((m) => m.key === key) ?? null;

  // Auto-select a single authorized scope; clear a scope that is no longer authorized.
  useEffect(() => {
    if (!identity) return;
    if (key && !member) {
      setKey("");
      setInputs(null);
      setAttestations([]);
      setStatus("Selected scope is no longer authorized. Interpretation cleared.");
    } else if (!key && members.length === 1) {
      setKey(members[0]!.key);
    } else if (!members.length) {
      setStatus(identity.signedIn
        ? "This view requires the Crew Self or Ground Medical role for a crew member."
        : "Sign in with an authorized Crew Self or Ground Medical account to see this interpretation.");
    }
  }, [identity, key, member, members]);

  const missionId = member?.missionId;
  const crewMemberId = member?.crewMemberId;
  useEffect(() => {
    if (!missionId || !crewMemberId) return;
    return subscribeReviewDataChanged((c) => {
      if (c.missionId === missionId && c.crewMemberId === crewMemberId) setVersion((v) => v + 1);
    });
  }, [missionId, crewMemberId]);

  const loadedScope = useRef("");
  useEffect(() => {
    const scopeKey = missionId && crewMemberId ? `${missionId}|${crewMemberId}|${provenance}` : "";
    if (loadedScope.current !== scopeKey) { setInputs(null); setAttestations([]); }
    loadedScope.current = scopeKey;
    if (!missionId || !crewMemberId) return;
    let active = true;
    setStatus("Reading encrypted local records…");
    void Promise.all([
      loadUnifiedReportInputs(missionId, crewMemberId),
      listAttestationEvents({ missionId, crewMemberId, provenance }).catch(() => null),
    ])
      .then(([v, events]) => {
        if (!active || loadedScope.current !== scopeKey) return;
        setInputs(v);
        setAttestations(events ?? []);
        setStatus(events === null
          ? "Records read. The attestation ledger could not be read, so attestation counts are unavailable, not absent."
          : "Encrypted local records read for this mission and crew member.");
      })
      .catch(() => {
        if (active) { setInputs(null); setStatus("Unable to read encrypted local records. No interpretation generated."); }
      });
    return () => { active = false; };
  }, [missionId, crewMemberId, provenance, version]);

  const model = useMemo(() => {
    if (!inputs || !missionId || !crewMemberId) return null;
    const scope = { missionId, crewMemberId, provenance };
    const unified = buildUnifiedHealthReport(inputs, scope, {});
    return buildResearcherInterpretation(unified, buildScientificFindings(unified), scopedAttestationEvents(attestations, scope));
  }, [inputs, missionId, crewMemberId, provenance, attestations]);

  const label = RESEARCHER_DOMAIN_LABELS[domainId];
  return (
    <section aria-label={`${label} physiological evidence interpretation`} className="mt-8 space-y-3 rounded-xl border border-border p-5">
      <h2 className="text-xl font-semibold">Physiological evidence interpretation · research only</h2>
      <p className="text-sm text-muted-foreground">
        The same read-only interpretation used in the Unified Health PDF and TXT. Recorded changes are kept separate from possible biological context; nothing here is a diagnosis or approval.
      </p>
      {members.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block">Authorized mission and crew</span>
            <select className="w-full rounded border bg-background p-2" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Select crew member</option>
              {members.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <label className="block min-w-0 text-sm">
            <span className="mb-1 block">Data provenance — never mixed</span>
            <select className="w-full rounded border bg-background p-2" value={provenance} onChange={(e) => setProvenance(e.target.value as "synthetic" | "real")}>
              <option value="synthetic">Synthetic / demonstration</option>
              <option value="real">Real / recorded</option>
            </select>
          </label>
        </div>
      )}
      <p className="text-xs text-muted-foreground" role="status">{status}</p>
      {model && <ModuleInterpretationView model={model} domain={domainId} />}
    </section>
  );
}
