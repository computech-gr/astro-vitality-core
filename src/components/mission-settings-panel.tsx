import { useEffect, useRef, useState } from "react";
import { Loader2, Lock, Save, Settings2, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  allowedStatusTargets,
  buildMissionSettingsUpdate,
  draftFromMission,
  isDraftDirty,
  isTerminalStatus,
  MISSION_NAME_MAX,
  validateMissionSettings,
  type MissionSettingsDraft,
  type MissionSettingsSnapshot,
  type MissionSettingsStatus,
} from "@/domain/mission-settings/settings";
import { updateMissionOperation } from "@/infrastructure/mission-operations";

interface Props {
  mission: MissionSettingsSnapshot;
  /** Reloads the workspace after a successful save; keeps the selected mission. */
  onSaved: () => Promise<void>;
  disabled?: boolean;
}

/** FV-01.4.6 Mission Settings. Rendered only for an active Mission Operator; the server re-authorizes every save. */
export function MissionSettingsPanel({ mission, onSaved, disabled }: Props) {
  const [draft, setDraft] = useState<MissionSettingsDraft>(() => draftFromMission(mission));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    setDraft(draftFromMission(mission));
    setState("idle");
    setMessage("");
  }, [mission.id, mission.name, mission.status, mission.starts_at, mission.ends_at]);

  const closed = isTerminalStatus(mission.status);
  const dirty = isDraftDirty(mission, draft);
  const errors = dirty ? validateMissionSettings(mission, draft) : [];
  const saving = state === "saving";
  const closing = draft.status !== mission.status && isTerminalStatus(draft.status);

  async function save() {
    if (inFlight.current || !dirty || errors.length) return;
    if (closing && !window.confirm(`Change mission status to ${draft.status.toUpperCase()}? This is permanent and freezes the research snapshot.`)) return;
    inFlight.current = true;
    setState("saving");
    setMessage("");
    try {
      await updateMissionOperation(buildMissionSettingsUpdate(mission, draft));
      await onSaved();
      setState("saved");
      setMessage("Mission settings saved.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Mission settings could not be saved.");
    } finally {
      inFlight.current = false;
    }
  }

  const set = <K extends keyof MissionSettingsDraft>(key: K, value: MissionSettingsDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    if (state !== "saving") setState("idle");
  };

  return (
    <Card id="mission-settings" aria-labelledby="mission-settings-title" className="scroll-mt-28">
      <CardHeader>
        <CardTitle id="mission-settings-title" className="flex items-center gap-2"><Settings2 className="text-primary" /> Mission Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 rounded-md border border-border p-4 text-sm sm:grid-cols-2" aria-label="Read-only mission metadata">
          <div><dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground"><Lock className="size-3" /> Mission code</dt><dd className="mt-1 font-mono">{mission.code}</dd></div>
          <div><dt className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground"><Lock className="size-3" /> Mission ID</dt><dd className="mt-1 break-all font-mono text-xs">{mission.id}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Current status</dt><dd className="mt-1"><Badge variant="outline">{mission.status.toUpperCase()}</Badge></dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-muted-foreground">Times shown in</dt><dd className="mt-1">UTC</dd></div>
        </dl>

        {closed ? (
          <p className="rounded-md border border-border p-3 text-sm text-muted-foreground" role="note">This mission is {mission.status}. Closed missions are read-only: the lifecycle cannot be reopened and the end date is immutable.</p>
        ) : null}

        <fieldset disabled={closed || saving || disabled} className="grid gap-4 sm:grid-cols-2">
          <legend className="sr-only">Editable mission settings</legend>
          <div className="sm:col-span-2">
            <Label htmlFor="settings-name">Mission name</Label>
            <Input id="settings-name" className="mt-2" maxLength={MISSION_NAME_MAX} value={draft.name} onChange={(e) => set("name", e.target.value)} aria-describedby="settings-name-help" />
            <p id="settings-name-help" className="mt-1 text-xs text-muted-foreground">3–{MISSION_NAME_MAX} characters.</p>
          </div>
          <div>
            <Label htmlFor="settings-status">Status</Label>
            <Select value={draft.status} onValueChange={(v) => set("status", v as MissionSettingsStatus)} disabled={closed || saving || Boolean(disabled)}>
              <SelectTrigger id="settings-status" className="mt-2"><SelectValue /></SelectTrigger>
              <SelectContent>{allowedStatusTargets(mission.status).map((s) => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}</SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">Forward-only: planning → active → completed or aborted.</p>
          </div>
          <div />
          <div>
            <Label htmlFor="settings-starts">Start (UTC)</Label>
            <Input id="settings-starts" type="datetime-local" className="mt-2" value={draft.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="settings-ends">End (UTC)</Label>
            <Input id="settings-ends" type="datetime-local" className="mt-2" value={draft.endsAt} onChange={(e) => set("endsAt", e.target.value)} />
            {closing ? <p className="mt-1 text-xs text-muted-foreground">If left empty, the end is set to the time of closing.</p> : null}
          </div>
        </fieldset>

        {errors.length ? <ul role="alert" className="list-disc space-y-1 pl-5 text-sm text-destructive">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}

        {!closed ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void save()} disabled={!dirty || errors.length > 0 || saving || disabled} aria-busy={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />} {saving ? "Saving…" : "Save settings"}
            </Button>
            <Button variant="outline" disabled={!dirty || saving} onClick={() => { setDraft(draftFromMission(mission)); setState("idle"); setMessage(""); }}><Undo2 /> Discard changes</Button>
          </div>
        ) : null}
        <p role="status" aria-live="polite" className={state === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message}</p>
        <p className="text-xs leading-5 text-muted-foreground">Saved through the existing authorized mission update. The database checks your Operator role, the lifecycle rules and closure immutability, and records an audit entry.</p>
      </CardContent>
    </Card>
  );
}
