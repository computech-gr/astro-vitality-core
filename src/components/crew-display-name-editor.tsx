import { useState } from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CREW_DISPLAY_NAME_MAX, validateCrewDisplayName } from "@/infrastructure/mission-operations";

export function CrewDisplayNameEditor({
  currentName,
  disabled,
  onSave,
}: {
  currentName: string;
  disabled: boolean;
  onSave: (name: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const error = validateCrewDisplayName(value, currentName);

  if (!editing) {
    return (
      <Button className="mt-2" size="sm" variant="ghost" disabled={disabled} onClick={() => { setValue(currentName); setEditing(true); }}>
        <Pencil /> Edit display name
      </Button>
    );
  }

  async function save() {
    if (error || saving) return;
    setSaving(true);
    try {
      await onSave(value);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const fieldId = `crew-name-${currentName.replace(/\W+/g, "-")}`;
  return (
    <form className="mt-3 space-y-2" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <Label htmlFor={fieldId}>Display name (current: {currentName})</Label>
      <Input id={fieldId} value={value} maxLength={CREW_DISPLAY_NAME_MAX + 20} aria-invalid={Boolean(error)} aria-describedby={`${fieldId}-error`} onChange={(event) => setValue(event.target.value)} />
      <p id={`${fieldId}-error`} className="text-xs text-muted-foreground" role={error ? "alert" : undefined}>{error ?? "Only the display name changes; reference, status and mission assignment are kept."}</p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={disabled || saving || Boolean(error)}>Save</Button>
        <Button size="sm" type="button" variant="outline" disabled={saving} onClick={() => { setValue(currentName); setEditing(false); }}>Cancel</Button>
      </div>
    </form>
  );
}
