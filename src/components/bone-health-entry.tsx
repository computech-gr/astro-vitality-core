import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { BoneHealthImport } from "@/components/bone-health-import";
import { BoneHandbookReference } from "@/components/scientific-handbook-reference";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { boneUnitSuggestions } from "@/domain/bone-health/unit-suggestions";
import { findPotentialDuplicates, listBoneEntries, markBoneEntryErroneous, saveBoneEntry, type BoneHealthEntry } from "@/domain/bone-health/history";

async function loadGroundRoster(missionIds: string[]): Promise<{ data: MissionMembershipContext[]; error: boolean }> {
  const { data: rows, error } = await supabase.from("mission_memberships")
    .select("mission_id, crew_member_id, role, active")
    .in("mission_id", missionIds).eq("active", true).eq("role", "crew_self");
  if (error) return { data: [], error: true };
  const crewIds = [...new Set((rows ?? []).map(row => row.crew_member_id).filter((id): id is string => Boolean(id)))];
  if (!crewIds.length) return { data: [], error: false };
  const { data: crew, error: crewError } = await supabase.from("crew_members").select("id, display_name").in("id", crewIds);
  if (crewError) return { data: [], error: true };
  const names = new Map((crew ?? []).map(item => [item.id, item.display_name]));
  return { data: (rows ?? []).filter(row => row.crew_member_id).map(row => ({
    missionId: row.mission_id, crewMemberId: row.crew_member_id!, role: "ground_medical" as const,
    crewDisplayName: names.get(row.crew_member_id!) ?? row.crew_member_id!,
  })), error: false };
}

function formatObservedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return `${date.toLocaleString()} (local) · ${iso.slice(0, 16).replace("T", " ")} UTC`;
}

export function BoneHealthEntryPage() {
  const [memberships, setMemberships] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [groundRoster, setGroundRoster] = useState<MissionMembershipContext[]>([]);
  const [crewMemberId, setCrewMemberId] = useState("");
  const [identityError, setIdentityError] = useState("Loading authorized mission membership...");
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadMissionIdentity().then(snapshot => {
      if (!alive) return;
      const authorized = snapshot.memberships.filter(m => m.role === "crew_self" || m.role === "ground_medical");
      const medicalMissions = authorized.filter(m => m.role === "ground_medical").map(m => m.missionId);
      setGroundRoster([]);
      if (medicalMissions.length) {
        void loadGroundRoster(medicalMissions).then(result => { if (!alive) return; if (result.error) setIdentityError("Unable to load authorized mission crew roster."); else setGroundRoster(result.data); });
      }
      setMemberships(authorized);
      setMissionId(previous => authorized.some(m => m.missionId === previous) ? previous : (snapshot.active && authorized.some(m => m.missionId === snapshot.active?.missionId) ? snapshot.active.missionId : authorized[0]?.missionId ?? ""));
      setIdentityError(snapshot.error ?? (authorized.length ? "" : "Sign in with an authorized crew or ground medical mission membership to record measurements."));
    }).catch(() => { if (alive) setIdentityError("Unable to verify mission membership."); }); };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { alive = false; unsubscribe(); };
  }, []);
  const crewOptions = [...memberships.filter(m => m.missionId === missionId && m.role === "crew_self" && m.crewMemberId), ...groundRoster.filter(m => m.missionId === missionId)];
  useEffect(() => {
    setCrewMemberId(previous => crewOptions.some(m => m.crewMemberId === previous) ? previous : (crewOptions[0]?.crewMemberId ?? ""));
  }, [missionId, memberships, groundRoster]);
  const authorizedSelection = crewOptions.some(m => m.crewMemberId === crewMemberId) && memberships.some(m => m.missionId === missionId && (m.role === "ground_medical" || (m.role === "crew_self" && m.crewMemberId === crewMemberId)));
  const [variableId, setVariableId] = useState<string>(BONE_HEALTH_VARIABLES[0].id);
  const [variableQuery, setVariableQuery] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [specimen, setSpecimen] = useState("");
  const [assayMethod, setAssayMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [dataOrigin, setDataOrigin] = useState<"" | "synthetic" | "real">("");
  const [history, setHistory] = useState<BoneHealthEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const [supersedesId, setSupersedesId] = useState<string | null>(null);
  const [erroneousTarget, setErroneousTarget] = useState<string | null>(null);
  const [erroneousReason, setErroneousReason] = useState("");
  useEffect(() => {
    if (!authorizedSelection) { setHistory([]); return; }
    let active = true;
    listBoneEntries(missionId, crewMemberId).then((rows) => { if (active) setHistory(rows); }).catch(() => { if (active) setMessage("Encrypted local history unavailable on this device."); });
    return () => { active = false; };
  }, [missionId, crewMemberId, authorizedSelection]);
  const filteredVariables = useMemo(() => {
    const query = variableQuery.trim().toLowerCase();
    if (!query) return BONE_HEALTH_VARIABLES;
    return BONE_HEALTH_VARIABLES.filter(v => v.id.toLowerCase().includes(query) || v.name.toLowerCase().includes(query));
  }, [variableQuery]);
  const unitSuggestions = useMemo(() => boneUnitSuggestions(variableId), [variableId]);
  const observedAtUtc = observedAt && Number.isFinite(Date.parse(observedAt)) ? new Date(observedAt).toISOString() : "";
  const pendingDuplicates = useMemo(() => {
    if (!observedAtUtc || !value.trim() || !Number.isFinite(Number(value))) return [];
    return findPotentialDuplicates(history, { variableId, observedAt: observedAtUtc, value: Number(value) });
  }, [history, variableId, observedAtUtc, value]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!authorizedSelection) throw new Error("Select an authorized mission and crew member.");
      if (!dataOrigin) throw new Error("Choose the data provenance: synthetic/demonstration or real measurement.");
      if (!value.trim()) throw new Error("A numeric value is required.");
      if (pendingDuplicates.length && !duplicateConfirmed) throw new Error("Possible duplicate: an identical value for this variable and time already exists. Tick the duplicate confirmation to save anyway.");
      const entry: BoneHealthEntry = { id: crypto.randomUUID(), missionId: missionId.trim(), crewMemberId: crewMemberId.trim(), variableId, value: Number(value), unit: unit.trim(), observedAt: new Date(observedAt).toISOString(), sourceLabel: sourceLabel.trim(), specimen: specimen.trim(), assayMethod: assayMethod.trim(), notes: notes.trim(), dataOrigin, ...(supersedesId ? { supersedesId } : {}) };
      await saveBoneEntry(entry);
      if (supersedesId) {
        const original = history.find(row => row.id === supersedesId);
        if (original && original.status !== "erroneous") await markBoneEntryErroneous(original, "Superseded by a corrected record.");
      }
      setHistory(await listBoneEntries(entry.missionId, entry.crewMemberId));
      setValue(""); setNotes(""); setDuplicateConfirmed(false); setSupersedesId(null);
      setMessage(supersedesId ? "Correction saved; the earlier record is marked erroneous. No health status was inferred." : "Saved to encrypted local mission history. No health status was inferred.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save record."); }
    finally { setBusy(false); }
  }
  async function confirmErroneous() {
    const target = history.find(row => row.id === erroneousTarget);
    if (!target) return;
    setBusy(true); setMessage("");
    try {
      await markBoneEntryErroneous(target, erroneousReason);
      setHistory(await listBoneEntries(missionId, crewMemberId));
      setErroneousTarget(null); setErroneousReason("");
      setMessage("Record marked erroneous. The original entry was preserved in append-only history.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to mark record."); }
    finally { setBusy(false); }
  }
  function startCorrection(row: BoneHealthEntry) {
    setVariableId(row.variableId); setValue(String(row.value)); setUnit(row.unit);
    setObservedAt(row.observedAt.slice(0, 16)); setSourceLabel(row.sourceLabel);
    setSpecimen(row.specimen); setAssayMethod(row.assayMethod); setNotes(""); setDataOrigin(row.dataOrigin);
    setSupersedesId(row.id); setDuplicateConfirmed(false);
    setMessage("Correction mode: edit the values and save. The original record will be marked erroneous, never deleted.");
  }
  const syntheticHistory = authorizedSelection ? history.filter((entry) => entry.dataOrigin === "synthetic" && entry.status !== "erroneous") : [];
  const uniqueVariables = new Set(syntheticHistory.map((entry) => entry.variableId));
  const latestByVariable = [...syntheticHistory].sort((a, b) => b.observedAt.localeCompare(a.observedAt)).filter((entry, index, entries) => entries.findIndex((other) => other.variableId === entry.variableId) === index);
  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground";
  return <main className="mx-auto max-w-5xl px-5 py-10 text-foreground">
    <nav aria-label="Astronaut health domains" className="mb-5 flex flex-wrap gap-3 text-sm"><a className="underline" href="/mission/bone-health" aria-current="page">Bone Health</a><a className="underline" href="/mission/immune-health">Immune Changes</a><a className="underline" href="/mission/cardiovascular-health">Cardiovascular Health</a><a className="underline" href="/mission/behavioral-health">Behavioral Health</a></nav>
    <p className="section-kicker">P22.1 · Bone Health</p>
    <h1 className="mt-2 font-display text-4xl font-semibold">Bone Health — Measurements &amp; Reference</h1>
    <p className="mt-3 text-muted-foreground">Research-only measurements. No clinical thresholds, diagnosis, readiness score or automatic “OK” assessment. Stored encrypted on this device; not automatically sent to Ground.</p>
    <form onSubmit={submit} className="mt-8 grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2">
      <label>Mission<select className={field} value={missionId} onChange={e=>setMissionId(e.target.value)} required disabled={!memberships.length}><option value="">Select authorized mission</option>{[...new Map(memberships.map(m => [m.missionId, m])).values()].map(m=><option key={m.missionId} value={m.missionId}>{m.missionName ?? m.missionCode ?? m.missionId}</option>)}</select></label>
      <label>Crew member<select className={field} value={crewMemberId} onChange={e=>setCrewMemberId(e.target.value)} required disabled={!missionId}><option value="">Select authorized crew member</option>{crewOptions.map(m=><option key={`${m.missionId}:${m.crewMemberId}`} value={m.crewMemberId}>{m.crewDisplayName ?? m.crewMemberId}</option>)}</select></label>
      {identityError && <p className="sm:col-span-2 text-muted-foreground" role="status">{identityError}</p>}
      {supersedesId && <p className="sm:col-span-2 rounded-md border border-border p-3 text-sm" role="status">Correcting an earlier record. The original stays in append-only history and will be marked erroneous on save. <button type="button" className="underline" onClick={()=>{setSupersedesId(null);setMessage("");}}>Cancel correction</button></p>}
      <div className="sm:col-span-2">
        <label htmlFor="bone-variable-search">Search handbook variables</label>
        <input id="bone-variable-search" className={`${field} mt-1`} type="search" value={variableQuery} onChange={e=>setVariableQuery(e.target.value)} placeholder="Filter by name or catalog ID" />
        <label className="mt-2 block">Handbook variable<select className={`${field} mt-1`} value={variableId} onChange={e=>setVariableId(e.target.value)}>{filteredVariables.map(v=><option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}{!filteredVariables.some(v=>v.id===variableId) && <option value={variableId}>{BONE_HEALTH_VARIABLES.find(v=>v.id===variableId)?.name} ({variableId})</option>}</select></label>
      </div>
      <label>Result<input className={field} type="number" step="any" value={value} onChange={e=>setValue(e.target.value)} required /></label>
      <div>
        <label>Unit (as reported)<input className={field} value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. pg/mL" required /></label>
        {unitSuggestions.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Handbook source units (not approved, non-binding): {unitSuggestions.map(suggestion => <button key={suggestion} type="button" className="ml-1 underline" onClick={()=>setUnit(suggestion)}>{suggestion}</button>)}</p>}
      </div>
      <label>Observed at (device local time)<input className={field} type="datetime-local" value={observedAt} onChange={e=>setObservedAt(e.target.value)} required aria-describedby="bone-observed-at-tz" />
        <span id="bone-observed-at-tz" className="mt-1 block text-xs text-muted-foreground">Entered in your device local time; stored as UTC.{observedAtUtc ? ` Stored value: ${observedAtUtc}` : ""}</span></label>
      <label>Lab / original source<input className={field} value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} required /></label>
      <label>Specimen / modality<input className={field} value={specimen} onChange={e=>setSpecimen(e.target.value)} /></label>
      <label>Assay / method<input className={field} value={assayMethod} onChange={e=>setAssayMethod(e.target.value)} /></label>
      <label>Data provenance<select className={field} value={dataOrigin} onChange={e=>setDataOrigin(e.target.value as "synthetic"|"real")} required><option value="">Select provenance</option><option value="synthetic">Synthetic / demonstration</option><option value="real">Real measurement (sensitive)</option></select></label>
      <label className="sm:col-span-2">Notes<textarea className={field} value={notes} maxLength={1000} onChange={e=>setNotes(e.target.value)} /></label>
      {pendingDuplicates.length > 0 && <label className="sm:col-span-2 flex items-start gap-2 rounded-md border border-border p-3 text-sm"><input type="checkbox" checked={duplicateConfirmed} onChange={e=>setDuplicateConfirmed(e.target.checked)} />Possible duplicate: {pendingDuplicates.length} existing record(s) already contain this variable, value and time. Repeat measurements are legitimate; confirm only if this is a new, distinct measurement.</label>}
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50 sm:col-span-2" type="submit" disabled={busy || !authorizedSelection}>{busy ? "Saving…" : supersedesId ? "Save correction" : "Save encrypted record"}</button>
      {message && <p role="status" className="sm:col-span-2">{message}</p>}
    </form>
    {authorizedSelection && dataOrigin && <BoneHealthImport missionId={missionId} crewMemberId={crewMemberId} dataOrigin={dataOrigin} onImported={async()=>setHistory(await listBoneEntries(missionId,crewMemberId))} />}
    {authorizedSelection && !dataOrigin && <p className="mt-8 rounded-xl border border-border p-5 text-sm text-muted-foreground" role="status">Choose the data provenance (synthetic or real) above to enable CSV and document import. Imports never assume a provenance.</p>}
    {authorizedSelection && <section className="mt-8 rounded-xl border border-border p-5" aria-label="Bone research evidence summary">
      <h2 className="text-xl font-semibold">Bone research evidence summary · local only</h2>
      <p className="mt-2 text-sm text-muted-foreground">Read-only synthetic evidence from encrypted local records for the selected mission and crew. Not cloud-synced, not a clinical assessment, and not combined with the cloud evidence summary on other health pages. Records marked erroneous are excluded.</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="font-medium">Synthetic local observations</dt><dd>{syntheticHistory.length}</dd></div>
        <div><dt className="font-medium">Variables with observations</dt><dd>{uniqueVariables.size} of {BONE_HEALTH_VARIABLES.length} catalog variables</dd></div>
        <div><dt className="font-medium">Catalog variables without local observations</dt><dd>{Math.max(0, BONE_HEALTH_VARIABLES.length - uniqueVariables.size)}</dd></div>
      </dl>
      {latestByVariable.length > 0 ? <ul className="mt-4 space-y-2">{latestByVariable.map((entry) => <li className="rounded border border-border p-3 text-sm" key={entry.variableId}>
        <p className="font-medium">{BONE_HEALTH_VARIABLES.find((item) => item.id === entry.variableId)?.name ?? entry.variableId}</p>
        <p>Latest local observation: {entry.value} {entry.unit} · {formatObservedAt(entry.observedAt)}</p>
        <p className="text-muted-foreground">Source: {entry.sourceLabel} · specimen/modality: {entry.specimen || "not provided"} · method: {entry.assayMethod || "not provided"}</p>
      </li>)}</ul> : <p className="mt-4 text-sm text-muted-foreground">No synthetic bone observations in this device's local history for the selected crew and mission.</p>}
      <p className="mt-3 text-xs text-muted-foreground">Units and methods are reported as entered; no cross-unit comparison, inferred trend, medical interpretation or scientific approval. Real-origin records are excluded from this research summary.</p>
    </section>}
    <section className="mt-10"><h2 className="text-xl font-semibold">Local measurement history</h2><p className="mt-2 text-sm text-muted-foreground">Only records matching the mission and crew IDs above are shown. Different methods or units must not be compared automatically. History is append-only: corrections mark records erroneous and add a superseding entry; nothing is rewritten or deleted.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Variable</th><th className="p-2">Result</th><th className="p-2">Source</th><th className="p-2">Origin</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{history.map(row=><tr className="border-b" key={row.id}><td className="p-2">{formatObservedAt(row.observedAt)}</td><td className="p-2">{BONE_HEALTH_VARIABLES.find(v=>v.id===row.variableId)?.name ?? row.variableId}</td><td className="p-2">{row.value} {row.unit}</td><td className="p-2">{row.sourceLabel}</td><td className="p-2">{row.dataOrigin}</td><td className="p-2">{row.status === "erroneous" ? <span>Erroneous{row.statusReason ? ` — ${row.statusReason}` : ""}{row.supersedesId ? "" : ""}</span> : row.supersedesId ? "Correction" : "Active"}</td><td className="p-2">{row.status !== "erroneous" && <span className="flex flex-wrap gap-2"><button type="button" className="underline" onClick={()=>startCorrection(row)}>Correct</button><button type="button" className="underline" onClick={()=>{setErroneousTarget(row.id);setErroneousReason("");}}>Mark erroneous</button></span>}</td></tr>)}</tbody></table>{history.length===0 && <p className="p-4 text-muted-foreground">No records for this mission and crew.</p>}</div>
      {erroneousTarget && <div className="mt-4 rounded-md border border-border p-4" role="dialog" aria-label="Mark record as erroneous">
        <p className="text-sm font-medium">Mark record as erroneous (append-only; the original is preserved)</p>
        <label className="mt-2 block text-sm">Reason<input className={`${field} mt-1`} value={erroneousReason} maxLength={500} onChange={e=>setErroneousReason(e.target.value)} placeholder="e.g. wrong unit transcribed from report" /></label>
        <div className="mt-3 flex gap-2"><button type="button" className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !erroneousReason.trim()} onClick={()=>void confirmErroneous()}>Confirm</button><button type="button" className="rounded-md border border-border px-4 py-2" onClick={()=>setErroneousTarget(null)}>Cancel</button></div>
      </div>}
    </section>
    <BoneHandbookReference />
  </main>;
}
