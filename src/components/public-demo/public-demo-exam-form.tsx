import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { P69_DEMO_CATALOG, P69_DEMO_CREW_SUBJECT } from "@/domain/public-demo/catalog";
import {
  MAX_MEASUREMENTS,
  sampleExaminationMeasurements,
  validateExaminationInput,
  type DemoMeasurement,
  type DemoRole,
  type ExaminationInput,
} from "@/domain/public-demo/workflow";

const DOMAIN_LABEL = { bone: "Bone", immune: "Immune", cardiovascular: "Cardiovascular", behavioral: "Behavioral" } as const;
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PublicDemoExamForm({
  role,
  onSubmit,
}: {
  role: DemoRole;
  onSubmit: (input: ExaminationInput) => Promise<string | null>;
}) {
  const [observedOn, setObservedOn] = useState(today());
  const [sourceQuality, setSourceQuality] = useState("good");
  const [rows, setRows] = useState<DemoMeasurement[]>([{ metricId: "", value: "", unit: "" }]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const used = useMemo(() => new Set(rows.map((r) => r.metricId)), [rows]);

  function update(index: number, patch: Partial<DemoMeasurement>) {
    setSaved(null);
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (patch.metricId !== undefined) next.unit = P69_DEMO_CATALOG.find((c) => c.metricId === patch.metricId)?.unit ?? "";
        return next;
      }),
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input: ExaminationInput = { observedOn, sourceQuality, measurements: rows.filter((r) => r.metricId) };
    const check = validateExaminationInput(input, today());
    if (!check.ok) {
      setIssues(check.issues);
      return;
    }
    setIssues([]);
    setBusy(true);
    const error = await onSubmit(input);
    setBusy(false);
    if (error) setIssues([error]);
    else {
      setSaved(`Saved to your demo workspace for ${P69_DEMO_CREW_SUBJECT.name}.`);
      setRows([{ metricId: "", value: "", unit: "" }]);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" aria-label="Synthetic examination">
      <p className="text-sm text-muted-foreground">
        {role === "medical" ? "Enter a new synthetic examination for" : "Submit your synthetic examination as"}{" "}
        <strong className="text-foreground">{P69_DEMO_CREW_SUBJECT.name}</strong>. Exact demo units only; nothing is converted.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="exam-date">Examination date</Label>
          <Input id="exam-date" type="date" value={observedOn} max={today()} onChange={(e) => setObservedOn(e.target.value)} className="mt-2" required />
        </div>
        <div>
          <Label htmlFor="exam-quality">Source quality</Label>
          <select id="exam-quality" className={`${field} mt-2`} value={sourceQuality} onChange={(e) => setSourceQuality(e.target.value)}>
            <option value="good">Good</option>
            <option value="degraded">Degraded</option>
            <option value="poor">Poor</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Measurements ({rows.filter((r) => r.metricId).length})</legend>
        <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_auto] items-end gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]">
              <label className="text-xs text-muted-foreground">
                Parameter
                <select className={`${field} mt-1`} value={row.metricId} onChange={(e) => update(index, { metricId: e.target.value })}>
                  <option value="">Choose…</option>
                  {(["cardiovascular", "immune", "bone", "behavioral"] as const).map((domain) => (
                    <optgroup key={domain} label={DOMAIN_LABEL[domain]}>
                      {P69_DEMO_CATALOG.filter((c) => c.domain === domain).map((c) => (
                        <option key={c.metricId} value={c.metricId} disabled={used.has(c.metricId) && c.metricId !== row.metricId}>
                          {c.label} ({c.unit})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Value
                <Input inputMode="decimal" value={row.value} onChange={(e) => update(index, { value: e.target.value })} className="mt-1" />
              </label>
              <span className="hidden pb-2 text-sm text-muted-foreground sm:block" aria-label="Unit">{row.unit || "—"}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove measurement" onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, i) => i !== index) : [{ metricId: "", value: "", unit: "" }]))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_MEASUREMENTS} onClick={() => setRows((r) => [...r, { metricId: "", value: "", unit: "" }])}>
            <Plus /> Add measurement
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => { setSaved(null); setRows(sampleExaminationMeasurements()); }}>
            Fill with the synthetic P63 sample values
          </Button>
        </div>
      </fieldset>
      {issues.length ? (
        <ul role="alert" className="list-disc space-y-1 rounded-md border border-border p-3 pl-6 text-sm">
          {issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
      {saved ? <p role="status" className="text-sm text-primary">{saved}</p> : null}
      <Button type="submit" disabled={busy} className="justify-self-start">
        {busy ? "Saving…" : "Save synthetic examination"}
      </Button>
    </form>
  );
}
