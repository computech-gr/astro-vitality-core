import { useEffect, useState } from "react";
import { loadMissionIdentity, subscribeMissionIdentity, type MissionMembershipContext } from "@/infrastructure/mission-identity";
import { BoneHealthImport } from "@/components/bone-health-import";
import { BONE_HEALTH_VARIABLES } from "@/domain/bone-health/catalog";
import { listBoneEntries, saveBoneEntry, type BoneHealthEntry } from "@/domain/bone-health/history";

export function BoneHealthEntryPage() {
  const [memberships, setMemberships] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [crewMemberId, setCrewMemberId] = useState("");
  const [identityError, setIdentityError] = useState("Loading authorized mission membership...");
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadMissionIdentity().then(snapshot => {
      if (!alive) return;
      const authorized = snapshot.memberships.filter(m => m.crewMemberId && (m.role === "crew_self" || m.role === "ground_medical"));
      setMemberships(authorized);
      setMissionId(previous => authorized.some(m => m.missionId === previous) ? previous : (snapshot.active && authorized.some(m => m.missionId === snapshot.active?.missionId) ? snapshot.active.missionId : authorized[0]?.missionId ?? ""));
      setIdentityError(snapshot.error ?? (authorized.length ? "" : "Sign in with an authorized crew or ground medical mission membership to record measurements."));
    }).catch(() => { if (alive) setIdentityError("Unable to verify mission membership."); }); };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => { alive = false; unsubscribe(); };
  }, []);
  const crewOptions = memberships.filter(m => m.missionId === missionId && m.crewMemberId);
  useEffect(() => {
    setCrewMemberId(previous => crewOptions.some(m => m.crewMemberId === previous) ? previous : (crewOptions[0]?.crewMemberId ?? ""));
  }, [missionId, memberships]);
  const authorizedSelection = memberships.some(m => m.missionId === missionId && m.crewMemberId === crewMemberId);
  const [variableId, setVariableId] = useState<string>(BONE_HEALTH_VARIABLES[0].id);
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [specimen, setSpecimen] = useState("");
  const [assayMethod, setAssayMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [dataOrigin, setDataOrigin] = useState<"synthetic" | "real">("synthetic");
  const [history, setHistory] = useState<BoneHealthEntry[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    listBoneEntries(missionId, crewMemberId).then((rows) => { if (active) setHistory(rows); }).catch(() => { if (active) setMessage("Encrypted local history unavailable on this device."); });
    return () => { active = false; };
  }, [missionId, crewMemberId]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (!authorizedSelection) throw new Error("Select an authorized mission and crew member.");
      const entry: BoneHealthEntry = { id: crypto.randomUUID(), missionId: missionId.trim(), crewMemberId: crewMemberId.trim(), variableId, value: Number(value), unit: unit.trim(), observedAt: new Date(observedAt).toISOString(), sourceLabel: sourceLabel.trim(), specimen: specimen.trim(), assayMethod: assayMethod.trim(), notes: notes.trim(), dataOrigin };
      if (!value.trim()) throw new Error("A numeric value is required.");
      await saveBoneEntry(entry);
      setHistory(await listBoneEntries(entry.missionId, entry.crewMemberId));
      setValue(""); setNotes(""); setMessage("Saved to encrypted local mission history. No health status was inferred.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save record."); }
    finally { setBusy(false); }
  }
  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground";
  return <main className="mx-auto max-w-5xl px-5 py-10 text-foreground">
    <p className="section-kicker">P22.1 · Bone Health</p>
    <h1 className="mt-2 font-display text-3xl font-semibold">Bone health data entry & history</h1>
    <p className="mt-3 text-muted-foreground">Research-only measurements. No clinical thresholds, diagnosis, readiness score or automatic “OK” assessment. Stored encrypted on this device; not automatically sent to Ground.</p>
    <form onSubmit={submit} className="mt-8 grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2">
      <label>Mission<select className={field} value={missionId} onChange={e=>setMissionId(e.target.value)} required disabled={!memberships.length}><option value="">Select authorized mission</option>{[...new Map(memberships.map(m => [m.missionId, m])).values()].map(m=><option key={m.missionId} value={m.missionId}>{m.missionName ?? m.missionCode ?? m.missionId}</option>)}</select></label>
      <label>Crew member<select className={field} value={crewMemberId} onChange={e=>setCrewMemberId(e.target.value)} required disabled={!missionId}><option value="">Select authorized crew member</option>{crewOptions.map(m=><option key={`${m.missionId}:${m.crewMemberId}`} value={m.crewMemberId}>{m.crewDisplayName ?? m.crewMemberId}</option>)}</select></label>
      {identityError && <p className="sm:col-span-2 text-muted-foreground" role="status">{identityError}</p>}
      <label className="sm:col-span-2">Handbook variable<select className={field} value={variableId} onChange={e=>setVariableId(e.target.value)}>{BONE_HEALTH_VARIABLES.map(v=><option key={v.id} value={v.id}>{v.name} ({v.id})</option>)}</select></label>
      <label>Result<input className={field} type="number" step="any" value={value} onChange={e=>setValue(e.target.value)} required /></label>
      <label>Unit (as reported)<input className={field} value={unit} onChange={e=>setUnit(e.target.value)} placeholder="e.g. pg/mL" required /></label>
      <label>Observed at<input className={field} type="datetime-local" value={observedAt} onChange={e=>setObservedAt(e.target.value)} required /></label>
      <label>Lab / original source<input className={field} value={sourceLabel} onChange={e=>setSourceLabel(e.target.value)} required /></label>
      <label>Specimen / modality<input className={field} value={specimen} onChange={e=>setSpecimen(e.target.value)} /></label>
      <label>Assay / method<input className={field} value={assayMethod} onChange={e=>setAssayMethod(e.target.value)} /></label>
      <label>Data provenance<select className={field} value={dataOrigin} onChange={e=>setDataOrigin(e.target.value as "synthetic"|"real")}><option value="synthetic">Synthetic / demonstration</option><option value="real">Real measurement (sensitive)</option></select></label>
      <label className="sm:col-span-2">Notes<textarea className={field} value={notes} onChange={e=>setNotes(e.target.value)} /></label>
      <button className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50 sm:col-span-2" type="submit" disabled={busy || !authorizedSelection}>{busy ? "Saving…" : "Save encrypted record"}</button>
      {message && <p role="status" className="sm:col-span-2">{message}</p>}
    </form>
    {authorizedSelection && <BoneHealthImport missionId={missionId} crewMemberId={crewMemberId} dataOrigin={dataOrigin} onImported={async()=>setHistory(await listBoneEntries(missionId,crewMemberId))} />}
    <section className="mt-10"><h2 className="text-xl font-semibold">Local measurement history</h2><p className="mt-2 text-sm text-muted-foreground">Only records matching the mission and crew IDs above are shown. Different methods or units must not be compared automatically.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-2">Date</th><th className="p-2">Variable</th><th className="p-2">Result</th><th className="p-2">Source</th><th className="p-2">Origin</th></tr></thead><tbody>{history.map(row=><tr className="border-b" key={row.id}><td className="p-2">{row.observedAt.slice(0,16).replace("T"," ")}</td><td className="p-2">{BONE_HEALTH_VARIABLES.find(v=>v.id===row.variableId)?.name ?? row.variableId}</td><td className="p-2">{row.value} {row.unit}</td><td className="p-2">{row.sourceLabel}</td><td className="p-2">{row.dataOrigin}</td></tr>)}</tbody></table>{history.length===0 && <p className="p-4 text-muted-foreground">No records for this mission and crew.</p>}</div>
    </section>
  </main>;
}
