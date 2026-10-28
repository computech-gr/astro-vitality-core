import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionMembershipContext,
} from "@/infrastructure/mission-identity";
import { BoneHealthImport } from "@/components/bone-health-import";
import { clearRetainedBoneImport } from "@/domain/bone-health/import-authorization";
import { Button } from "@/components/ui/button";
import { BoneHandbookReference } from "@/components/scientific-handbook-reference";
import { BoneVariableCombobox } from "@/components/bone-variable-combobox";
import { BoneSourceCombobox } from "@/components/bone-source-combobox";
import { HealthDomainNavigation } from "@/components/health-domain-navigation";
import { BoneReportedFieldCombobox } from "@/components/bone-reported-field-combobox";
import { resolveBoneObservationInstant, utcIsoToLocalDatetimeInput } from "@/domain/bone-health/local-datetime";
import { persistBoneCorrection, scopedBoneSources } from "@/domain/bone-health/correction";
import { BONE_MEASUREMENT_PROFILE, type MeasurementProfile } from "@/domain/health-measurements/profiles";
import { MeasurementProfileProvider } from "@/components/measurement-profile-context";
import { boneReportedFieldSuggestions } from "@/domain/bone-health/reported-field-suggestions";
import {
  findPotentialDuplicates,
  listBoneEntries,
  markBoneEntryErroneous,
  saveBoneEntry,
  type BoneHealthEntry,
} from "@/domain/bone-health/history";

async function loadGroundRoster(
  missionIds: string[],
): Promise<{ data: MissionMembershipContext[]; error: boolean }> {
  const { data: rows, error } = await supabase
    .from("mission_memberships")
    .select("mission_id, crew_member_id, role, active")
    .in("mission_id", missionIds)
    .eq("active", true)
    .eq("role", "crew_self");
  if (error) return { data: [], error: true };
  const crewIds = [
    ...new Set(
      (rows ?? []).map((row) => row.crew_member_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!crewIds.length) return { data: [], error: false };
  const { data: crew, error: crewError } = await supabase
    .from("crew_members")
    .select("id, display_name")
    .in("id", crewIds);
  if (crewError) return { data: [], error: true };
  const names = new Map((crew ?? []).map((item) => [item.id, item.display_name]));
  return {
    data: (rows ?? [])
      .filter((row) => row.crew_member_id)
      .map((row) => ({
        missionId: row.mission_id,
        crewMemberId: row.crew_member_id!,
        role: "ground_medical" as const,
        crewDisplayName: names.get(row.crew_member_id!) ?? row.crew_member_id!,
      })),
    error: false,
  };
}

function formatObservedAt(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return iso;
  return `${date.toLocaleString()} (local) · ${iso.slice(0, 16).replace("T", " ")} UTC`;
}

export function BoneHealthEntryPage() {
  return <HealthMeasurementEntry profile={BONE_MEASUREMENT_PROFILE} />;
}

/**
 * Shared P22/P26 measurement workflow. `embedded` renders inside an existing domain
 * workspace (which owns its header and navigation); Bone keeps its full page.
 */
export function HealthMeasurementEntry({ profile, embedded = false }: { profile: MeasurementProfile; embedded?: boolean }) {
  const [memberships, setMemberships] = useState<MissionMembershipContext[]>([]);
  const [missionId, setMissionId] = useState("");
  const [groundRoster, setGroundRoster] = useState<MissionMembershipContext[]>([]);
  const [crewMemberId, setCrewMemberId] = useState("");
  const [identityError, setIdentityError] = useState("Loading authorized mission membership...");
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((snapshot) => {
          if (!alive) return;
          const authorized = snapshot.memberships.filter(
            (m) => m.role === "crew_self" || m.role === "ground_medical",
          );
          const medicalMissions = authorized
            .filter((m) => m.role === "ground_medical")
            .map((m) => m.missionId);
          // Keep the current roster until its fresh replacement resolves; clearing it
          // first emptied the crew selector on every auth event (e.g. tab return),
          // unmounting the import review. Denial or errors still clear it.
          if (medicalMissions.length) {
            void loadGroundRoster(medicalMissions).then((result) => {
              if (!alive) return;
              if (result.error) {
                setGroundRoster([]);
                setIdentityError("Unable to load authorized mission crew roster.");
              } else setGroundRoster(result.data);
            });
          } else setGroundRoster([]);
          setMemberships(authorized);
          setMissionId((previous) =>
            authorized.some((m) => m.missionId === previous)
              ? previous
              : snapshot.active &&
                  authorized.some((m) => m.missionId === snapshot.active?.missionId)
                ? snapshot.active.missionId
                : (authorized[0]?.missionId ?? ""),
          );
          setIdentityError(
            snapshot.error ??
              (authorized.length
                ? ""
                : "Sign in with an authorized crew or ground medical mission membership to record measurements."),
          );
        })
        .catch(() => {
          if (alive) setIdentityError("Unable to verify mission membership.");
        });
    };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  const crewOptions = [
    ...memberships.filter(
      (m) => m.missionId === missionId && m.role === "crew_self" && m.crewMemberId,
    ),
    ...groundRoster.filter((m) => m.missionId === missionId),
  ];
  useEffect(() => {
    setCrewMemberId((previous) =>
      crewOptions.some((m) => m.crewMemberId === previous)
        ? previous
        : (crewOptions[0]?.crewMemberId ?? ""),
    );
  }, [missionId, memberships, groundRoster]);
  const authorizedSelection =
    crewOptions.some((m) => m.crewMemberId === crewMemberId) &&
    memberships.some(
      (m) =>
        m.missionId === missionId &&
        (m.role === "ground_medical" ||
          (m.role === "crew_self" && m.crewMemberId === crewMemberId)),
    );
  const [variableId, setVariableId] = useState<string>(profile.variables[0]?.id ?? "");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [observedAt, setObservedAt] = useState("");
  const [originalObservedAt, setOriginalObservedAt] = useState<string | null>(null);
  const [observationTimeEdited, setObservationTimeEdited] = useState(false);
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
    if (!authorizedSelection) {
      setHistory([]);
      return;
    }
    let active = true;
    listBoneEntries(missionId, crewMemberId, profile)
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active) setMessage("Encrypted local history unavailable on this device.");
      });
    return () => {
      active = false;
    };
  }, [missionId, crewMemberId, authorizedSelection, profile]);
  const reportedSuggestions = useMemo(() => boneReportedFieldSuggestions(history, {
    authorized: authorizedSelection, missionId, crewMemberId, dataOrigin, variableId,
  }, profile), [profile, history, authorizedSelection, missionId, crewMemberId, dataOrigin, variableId]);
  const observedAtUtc = resolveBoneObservationInstant(observedAt, supersedesId ? originalObservedAt : null, observationTimeEdited);
  const pendingDuplicates = useMemo(() => {
    if (!observedAtUtc || !value.trim() || !Number.isFinite(Number(value))) return [];
    return findPotentialDuplicates(history, {
      variableId,
      observedAt: observedAtUtc,
      value: Number(value),
    });
  }, [history, variableId, observedAtUtc, value]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!authorizedSelection) throw new Error("Select an authorized mission and crew member.");
      if (!dataOrigin)
        throw new Error("Choose the data provenance: synthetic/demonstration or real measurement.");
      if (!value.trim()) throw new Error("A numeric value is required.");
      if (pendingDuplicates.length && !duplicateConfirmed)
        throw new Error(
          "Possible duplicate: an identical value for this variable and time already exists. Tick the duplicate confirmation to save anyway.",
        );
      const entry: BoneHealthEntry = {
        id: crypto.randomUUID(),
        missionId: missionId.trim(),
        crewMemberId: crewMemberId.trim(),
        variableId,
        value: Number(value),
        unit: unit.trim(),
        observedAt: observedAtUtc,
        sourceLabel: sourceLabel.trim(),
        specimen: specimen.trim(),
        assayMethod: assayMethod.trim(),
        notes: notes.trim(),
        dataOrigin,
        ...(supersedesId ? { supersedesId } : {}),
      };
      await persistBoneCorrection(entry, supersedesId ? history.find(row => row.id === supersedesId) : undefined, (e) => saveBoneEntry(e, profile), (e, r) => markBoneEntryErroneous(e, r, profile));
      setHistory(await listBoneEntries(entry.missionId, entry.crewMemberId, profile));
      setValue("");
      setNotes("");
      setDuplicateConfirmed(false);
      setSupersedesId(null);
      setMessage(
        supersedesId
          ? "Correction saved; the earlier record is marked erroneous. No health status was inferred."
          : "Saved to encrypted local mission history. No health status was inferred.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save record.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmErroneous() {
    const target = history.find((row) => row.id === erroneousTarget);
    if (!target) return;
    setBusy(true);
    setMessage("");
    try {
      await markBoneEntryErroneous(target, erroneousReason, profile);
      setHistory(await listBoneEntries(missionId, crewMemberId, profile));
      setErroneousTarget(null);
      setErroneousReason("");
      setMessage(
        "Record marked erroneous. The original entry was preserved in append-only history.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to mark record.");
    } finally {
      setBusy(false);
    }
  }
  function cancelCorrection() {
    if (busy) return;
    setSupersedesId(null);
    setOriginalObservedAt(null);
    setObservationTimeEdited(false);
    setDuplicateConfirmed(false);
    setValue("");
    setUnit("");
    setObservedAt("");
    setSourceLabel("");
    setSpecimen("");
    setAssayMethod("");
    setNotes("");
    setMessage("Correction cancelled. The original encrypted record was not changed.");
  }
  function startCorrection(row: BoneHealthEntry) {
    setVariableId(row.variableId);
    setValue(String(row.value));
    setUnit(row.unit);
    setObservedAt(utcIsoToLocalDatetimeInput(row.observedAt));
    setOriginalObservedAt(row.observedAt);
    setObservationTimeEdited(false);
    setSourceLabel(row.sourceLabel);
    setSpecimen(row.specimen);
    setAssayMethod(row.assayMethod);
    setNotes(row.notes ?? "");
    setDataOrigin(row.dataOrigin);
    setSupersedesId(row.id);
    setDuplicateConfirmed(false);
    setMessage(
      "Correction mode: edit the values and save. The original record will be marked erroneous, never deleted.",
    );
  }
  const syntheticHistory = authorizedSelection
    ? history.filter((entry) => entry.dataOrigin === "synthetic" && entry.status !== "erroneous")
    : [];
  const uniqueVariables = new Set(syntheticHistory.map((entry) => entry.variableId));
  const latestByVariable = [...syntheticHistory]
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
    .filter(
      (entry, index, entries) =>
        entries.findIndex((other) => other.variableId === entry.variableId) === index,
    );
  const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-foreground";
  const Wrapper = embedded ? "section" : "main";
  return (
    <MeasurementProfileProvider profile={profile}>
    <Wrapper
      className={embedded ? "mt-8 text-foreground" : "mx-auto max-w-5xl px-5 py-10 text-foreground"}
      aria-label={embedded ? `${profile.title} measurement entry` : undefined}
    >
      {embedded ? (
        <>
          <h2 className="text-2xl font-semibold">{profile.title} measurements · research only</h2>
          <p className="mt-2 text-muted-foreground">
            Research-only measurements. No clinical thresholds, diagnosis, readiness score or automatic
            “OK” assessment. Stored encrypted on this device; not automatically sent to Ground.
          </p>
          <p className="mt-2 rounded-md border border-border p-3 text-sm" role="note">
            {profile.catalogStatusNote}
          </p>
        </>
      ) : (
        <>
          <p className="section-kicker">P22.1 · Bone Health</p>
          <h1 className="mt-2 font-display text-4xl font-semibold">
            Bone Health — Measurements &amp; Reference
          </h1>
          <p className="mt-3 text-muted-foreground">
            Research-only measurements. No clinical thresholds, diagnosis, readiness score or automatic
            “OK” assessment. Stored encrypted on this device; not automatically sent to Ground.
          </p>
          <HealthDomainNavigation current="bone" />
        </>
      )}
      <form
        onSubmit={submit}
        className="mt-8 grid gap-4 rounded-xl border border-border p-5 sm:grid-cols-2"
      >
        <label>
          Mission
          <select
            className={field}
            value={missionId}
            onChange={(e) => { clearRetainedBoneImport(); setMissionId(e.target.value); }}
            required
            disabled={!memberships.length}
          >
            <option value="">Select authorized mission</option>
            {[...new Map(memberships.map((m) => [m.missionId, m])).values()].map((m) => (
              <option key={m.missionId} value={m.missionId}>
                {m.missionName ?? m.missionCode ?? m.missionId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Crew member
          <select
            className={field}
            value={crewMemberId}
            onChange={(e) => { clearRetainedBoneImport(); setCrewMemberId(e.target.value); }}
            required
            disabled={!missionId}
          >
            <option value="">Select authorized crew member</option>
            {crewOptions.map((m) => (
              <option key={`${m.missionId}:${m.crewMemberId}`} value={m.crewMemberId}>
                {m.crewDisplayName ?? m.crewMemberId}
              </option>
            ))}
          </select>
        </label>
        {identityError && (
          <p className="sm:col-span-2 text-muted-foreground" role="status">
            {identityError}
          </p>
        )}
        {supersedesId && (
          <p className="sm:col-span-2 rounded-md border border-border p-3 text-sm" role="status">
            Correcting an earlier record. The original stays in append-only history and will be
            marked erroneous on save.
          </p>
        )}
        <div className="sm:col-span-2">
          <BoneVariableCombobox
            variables={profile.variables}
            value={variableId}
            onChange={setVariableId}
            className={field}
          />
        </div>
        <label>
          Result
          <input
            className={field}
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
          />
        </label>
        <BoneReportedFieldCombobox label="Unit (as reported)" value={unit} onChange={setUnit}
          suggestions={reportedSuggestions.unit} className={field} required
          description="Handbook and historical units are non-binding, not scientifically approved. No unit conversion." />
        <label>
          Observed at (device local time)
          <input
            className={field}
            type="datetime-local"
            value={observedAt}
            onChange={(e) => { setObservedAt(e.target.value); setObservationTimeEdited(true); }}
            required
            aria-describedby={`${profile.domainId}-observed-at-tz`}
          />
          <span id={`${profile.domainId}-observed-at-tz`} className="mt-1 block text-xs text-muted-foreground">
            Entered in your device local time; stored as UTC.
            {observedAtUtc ? ` Stored value: ${observedAtUtc}` : ""}
          </span>
        </label>
        <BoneSourceCombobox
          value={sourceLabel}
          onChange={setSourceLabel}
          sources={authorizedSelection ? scopedBoneSources(history, missionId, crewMemberId, dataOrigin) : []}
          className={field}
        />
        <BoneReportedFieldCombobox label="Specimen / modality" value={specimen} onChange={setSpecimen}
          suggestions={reportedSuggestions.specimen} className={field} />
        <BoneReportedFieldCombobox label="Assay / method" value={assayMethod} onChange={setAssayMethod}
          suggestions={reportedSuggestions.assayMethod} className={field} />
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          Lab/source, specimen and assay are entered by the astronaut from the original report.
          The dropdown only suggests previously entered values for this authorized selection; it does not prescribe a specimen or method.
          Leave optional specimen and assay fields empty when unknown.
        </p>
        <label>
          Data provenance
          <select
            className={field}
            value={dataOrigin}
            onChange={(e) => { clearRetainedBoneImport(); setDataOrigin(e.target.value as "synthetic" | "real"); }}
            required
          >
            <option value="">Select provenance</option>
            <option value="synthetic">Synthetic / demonstration</option>
            <option value="real">Real measurement (sensitive)</option>
          </select>
        </label>
        <label className="sm:col-span-2">
          Notes
          <textarea
            className={field}
            value={notes}
            maxLength={1000}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {pendingDuplicates.length > 0 && (
          <label className="sm:col-span-2 flex items-start gap-2 rounded-md border border-border p-3 text-sm">
            <input
              type="checkbox"
              checked={duplicateConfirmed}
              onChange={(e) => setDuplicateConfirmed(e.target.checked)}
            />
            Possible duplicate: {pendingDuplicates.length} existing record(s) already contain this
            variable, value and time. Repeat measurements are legitimate; confirm only if this is a
            new, distinct measurement.
          </label>
        )}
        <div className="sm:col-span-2 flex flex-wrap gap-3">
          <Button
            className="min-w-0 flex-1"
            type="submit"
            disabled={busy || !authorizedSelection}
          >
            {busy ? "Saving…" : supersedesId ? "Save correction" : "Save encrypted record"}
          </Button>
          {supersedesId && (
            <Button type="button" variant="outline" onClick={cancelCorrection} disabled={busy}>
              Cancel
            </Button>
          )}
        </div>
        {message && (
          <p role="status" className="sm:col-span-2">
            {message}
          </p>
        )}
      </form>
      {authorizedSelection && (
        <section className="mt-8 rounded-xl border border-border p-5" aria-label="Laboratory import access">
          <h2 className="text-xl font-semibold">Laboratory import access</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Your authorized mission role permits laboratory import for this selected crew member.
            Select the actual data provenance below; correction mode is not required.
          </p>
          <label className="mt-4 block max-w-md">
            Import data provenance
            <select
              className={`${field} cursor-pointer`}
              value={dataOrigin}
              onChange={(event) => { clearRetainedBoneImport(); setDataOrigin(event.target.value as "" | "synthetic" | "real"); }}
              aria-label="Import data provenance"
            >
              <option value="">Choose provenance to enable file import</option>
              <option value="synthetic">Synthetic / demonstration</option>
              <option value="real">Real measurement (sensitive)</option>
            </select>
          </label>
          {!dataOrigin && (
            <p className="mt-3 text-sm text-muted-foreground" role="status">
              Choose provenance here or in the measurement form. File import cannot proceed
              until provenance is explicitly selected; no correction is necessary.
            </p>
          )}
          {dataOrigin && (
            <BoneHealthImport
              missionId={missionId}
              crewMemberId={crewMemberId}
              dataOrigin={dataOrigin}
              onImported={async () => setHistory(await listBoneEntries(missionId, crewMemberId, profile))}
            />
          )}
        </section>
      )}
      {authorizedSelection && (
        <section
          className="mt-8 rounded-xl border border-border p-5"
          aria-label={`${profile.title} research evidence summary`}
        >
          <h2 className="text-xl font-semibold">{profile.title} research evidence summary · local only</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Read-only synthetic evidence from encrypted local records for the selected mission and
            crew. Not cloud-synced, not a clinical assessment, and not combined with the cloud
            evidence summary on other health pages. Records marked erroneous are excluded.
          </p>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="font-medium">Synthetic local observations</dt>
              <dd>{syntheticHistory.length}</dd>
            </div>
            <div>
              <dt className="font-medium">Variables with observations</dt>
              <dd>
                {uniqueVariables.size} of {profile.variables.length} catalog variables
              </dd>
            </div>
            <div>
              <dt className="font-medium">Catalog variables without local observations</dt>
              <dd>{Math.max(0, profile.variables.length - uniqueVariables.size)}</dd>
            </div>
          </dl>
          {latestByVariable.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {latestByVariable.map((entry) => (
                <li className="rounded border border-border p-3 text-sm" key={entry.variableId}>
                  <p className="font-medium">
                    {profile.variables.find((item) => item.id === entry.variableId)?.name ??
                      entry.variableId}
                  </p>
                  <p>
                    Latest local observation: {entry.value} {entry.unit} ·{" "}
                    {formatObservedAt(entry.observedAt)}
                  </p>
                  <p className="text-muted-foreground">
                    Source: {entry.sourceLabel} · specimen/modality:{" "}
                    {entry.specimen || "not provided"} · method:{" "}
                    {entry.assayMethod || "not provided"}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No synthetic {profile.title.toLowerCase()} observations in this device's local history for the selected crew
              and mission.
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Units and methods are reported as entered; no cross-unit comparison, inferred trend,
            medical interpretation or scientific approval. Real-origin records are excluded from
            this research summary.
          </p>
        </section>
      )}
      <section className="mt-10">
        <h2 className="text-xl font-semibold">Local measurement history</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only records matching the mission and crew IDs above are shown. Different methods or units
          must not be compared automatically. History is append-only: corrections mark records
          erroneous and add a superseding entry; nothing is rewritten or deleted.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">Date</th>
                <th className="p-2">Variable</th>
                <th className="p-2">Result</th>
                <th className="p-2">Source</th>
                <th className="p-2">Origin</th>
                <th className="p-2">Status</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr className="border-b" key={row.id}>
                  <td className="p-2">{formatObservedAt(row.observedAt)}</td>
                  <td className="p-2">
                    {profile.variables.find((v) => v.id === row.variableId)?.name ??
                      row.variableId}
                  </td>
                  <td className="p-2">
                    {row.value} {row.unit}
                  </td>
                  <td className="p-2">{row.sourceLabel}</td>
                  <td className="p-2">{row.dataOrigin}</td>
                  <td className="p-2">
                    {row.status === "erroneous" ? (
                      <span>
                        Erroneous{row.statusReason ? ` — ${row.statusReason}` : ""}
                        {row.supersedesId ? "" : ""}
                      </span>
                    ) : row.supersedesId ? (
                      "Correction"
                    ) : (
                      "Active"
                    )}
                  </td>
                  <td className="p-2">
                    {row.status !== "erroneous" && (
                      <span className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => startCorrection(row)}
                        >
                          Correct
                        </button>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setErroneousTarget(row.id);
                            setErroneousReason("");
                          }}
                        >
                          Mark erroneous
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.length === 0 && (
            <p className="p-4 text-muted-foreground">No records for this mission and crew.</p>
          )}
        </div>
        {erroneousTarget && (
          <div
            className="mt-4 rounded-md border border-border p-4"
            role="dialog"
            aria-label="Mark record as erroneous"
          >
            <p className="text-sm font-medium">
              Mark record as erroneous (append-only; the original is preserved)
            </p>
            <label className="mt-2 block text-sm">
              Reason
              <input
                className={`${field} mt-1`}
                value={erroneousReason}
                maxLength={500}
                onChange={(e) => setErroneousReason(e.target.value)}
                placeholder="e.g. wrong unit transcribed from report"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
                disabled={busy || !erroneousReason.trim()}
                onClick={() => void confirmErroneous()}
              >
                Confirm
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-4 py-2"
                onClick={() => setErroneousTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
      {!embedded && <BoneHandbookReference />}
    </Wrapper>
    </MeasurementProfileProvider>
  );
}
