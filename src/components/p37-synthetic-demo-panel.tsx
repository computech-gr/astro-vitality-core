/**
 * P37 SYNTHETIC DEMO catalog test (one owner-authorized biomarker). The
 * Researcher records an explicitly labelled demo decision (not a scientific
 * approval), Ground Medical of the mission activates it, devices install the
 * signed demo catalog, and later synthetic examinations are recognized (online
 * and from the stored signed snapshot) without generating a duplicate
 * unknown-biomarker request. Every action is authorized by caller-scoped
 * database functions; nothing here touches the production catalog.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleSlash, FlaskConical, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  activateSyntheticDemoFn,
  getSignedSyntheticDemoSnapshot,
  getSyntheticDemoLifecycle,
  recordSyntheticDemoDecisionFn,
  revokeSyntheticDemoFn,
} from "@/lib/p37-synthetic-demo.functions";
import type { DemoLifecycleRow, DemoScopeTerm } from "@/lib/p37-synthetic-demo.server";
import {
  SYNTHETIC_DEMO_ACKNOWLEDGEMENT,
  SYNTHETIC_DEMO_LABEL,
  evaluateSyntheticDemoSnapshot,
  recognizeSyntheticDemo,
  verifySyntheticDemoSnapshot,
  type EvaluatedDemoCatalog,
} from "@/domain/health-intelligence/synthetic-demo-catalog";
import {
  SYNTHETIC_DEMO_STORAGE_KEY,
  getInstalledDemoSnapshot,
  getSyntheticDemoCatalogs,
  installOfferedDemoCatalog,
  subscribeSyntheticDemoCatalogs,
} from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { browserSnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";
import { BUNDLED_TRUSTED_KEYS } from "@/domain/health-intelligence/catalog-snapshot-signing";
import {
  buildUnknownBiomarkerTerms,
  syntheticDemoCoverage,
} from "@/domain/health-intelligence/unknown-biomarker-review";
import { classifyIntakeObservation } from "@/domain/health-domains/unified-intake-classification";

type Msg = { ok: boolean; text: string } | null;
const DOMAINS = [
  ["bone", "Bone"],
  ["immune", "Immune"],
  ["cardiovascular", "Cardiovascular"],
  ["behavioral", "Behavioral"],
] as const;
type Domain = (typeof DOMAINS)[number][0];

function Note({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-xs" : "text-xs text-destructive"}>
      {msg.text}
    </p>
  );
}

function DecisionForm({ missionId, term, onDone }: { missionId: string; term: DemoScopeTerm; onDone: () => Promise<void> }) {
  const decide = useServerFn(recordSyntheticDemoDecisionFn);
  const [name, setName] = useState(term.originalLabels[0] ?? "");
  const [domain, setDomain] = useState<Domain>(() => {
    const c = term.candidateMetricIds[0] ?? "";
    return /^imm/i.test(c) ? "immune" : /^cv/i.test(c) ? "cardiovascular" : /^(beh|cog)/i.test(c) ? "behavioral" : "bone";
  });
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [key] = useState(() => crypto.randomUUID());
  const submit = async () => {
    setBusy(true);
    try {
      const r = await decide({
        data: { missionId, submissionId: term.submissionId, termId: term.termId, displayName: name.trim(), domain,
          acknowledgement: SYNTHETIC_DEMO_ACKNOWLEDGEMENT, idempotencyKey: key },
      });
      setMsg(r.ok ? { ok: true, text: "Synthetic demo decision recorded. A demo catalog proposal now waits for Ground Medical." } : { ok: false, text: r.message });
      if (r.ok) await onDone();
    } catch {
      setMsg({ ok: false, text: "Nothing was recorded. Try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`demo-name-${term.termId}`} className="text-xs">Demo display name</Label>
          <Input id={`demo-name-${term.termId}`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`demo-domain-${term.termId}`} className="text-xs">Demo domain</Label>
          <select id={`demo-domain-${term.termId}`} value={domain} onChange={(e) => setDomain(e.target.value as Domain)}
            className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm">
            {DOMAINS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" />
        <span>I understand this is a SYNTHETIC DEMO decision. It is not a scientific approval, cites no source validation, assay method, specimen or protocol, and never enters the production catalog.</span>
      </label>
      <Button size="sm" disabled={busy || !ack || name.trim().length < 3} onClick={() => void submit()}>
        <FlaskConical className="mr-1 h-4 w-4" aria-hidden />
        Record SYNTHETIC DEMO decision
      </Button>
      <Note msg={msg} />
    </div>
  );
}

function ActivationActions({ row, term, onDone }: { row: DemoLifecycleRow; term: DemoScopeTerm | undefined; onDone: () => Promise<void> }) {
  const activate = useServerFn(activateSyntheticDemoFn);
  const revoke = useServerFn(revokeSyntheticDemoFn);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [key] = useState(() => crypto.randomUUID());
  const run = async (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) => {
    setBusy(true);
    try {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: okText } : { ok: false, text: r.message ?? "Nothing was recorded." });
      if (r.ok) await onDone();
    } catch {
      setMsg({ ok: false, text: "Nothing was recorded. Try again." });
    } finally {
      setBusy(false);
    }
  };
  if (!term?.callerMayActivate)
    return <p className="text-xs text-muted-foreground">Demo activation is performed by an active Ground Medical member of this mission, not by the Researcher.</p>;
  if (row.revocationEventId) return null;
  if (!row.activationEventId)
    return (
      <div className="space-y-1">
        <Button size="sm" disabled={busy || row.decidedByCaller}
          onClick={() => void run(() => activate({ data: { decisionEventId: row.decisionEventId, expectedEntrySha256: row.entrySha256, idempotencyKey: key } }),
            "Activated in the synthetic demo catalog. Sync the demo catalog on each device to recognize it offline.")}>
          Activate in SYNTHETIC DEMO catalog
        </Button>
        {row.decidedByCaller ? <p className="text-xs text-muted-foreground">You recorded this decision; another Ground Medical member must activate it.</p> : null}
        <Note msg={msg} />
      </div>
    );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor={`demo-rev-${row.activationEventId}`} className="text-xs">Demo revocation reason</Label>
        <Input id={`demo-rev-${row.activationEventId}`} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} className="h-8 w-64" />
      </div>
      <Button size="sm" variant="outline" disabled={busy || reason.trim().length < 8}
        onClick={() => void run(() => revoke({ data: { activationEventId: row.activationEventId!, reason: reason.trim(), idempotencyKey: key } }),
          "Synthetic demo entry revoked. History is unchanged.")}>
        Revoke demo entry
      </Button>
      <Note msg={msg} />
    </div>
  );
}

type Check = { label: string; pass: boolean; detail: string };

/** Runs the same recognition and request-building code the intake screen uses, online and from stored signed bytes. */
async function runRecognitionChecks(missionId: string, catalog: EvaluatedDemoCatalog): Promise<Check[]> {
  const checks: Check[] = [];
  const entry = catalog.active[0];
  if (!entry) return [{ label: "Active demo entry on this device", pass: false, detail: "Sync the synthetic demo catalog after activation." }];
  const label = entry.aliases[0]!;
  const exam = { label, unit: entry.unit, provenance: "synthetic" as const, missionId };
  const online = syntheticDemoCoverage(exam);
  checks.push({ label: "Later synthetic examination recognized", pass: online?.demoId === entry.demoId,
    detail: online ? `"${label}" ${entry.unit} → ${online.displayName} (${online.demoId}), demo catalog v${online.demoCatalogVersion}` : "not recognized" });
  const storage = browserSnapshotStorage();
  const stored = storage?.get(SYNTHETIC_DEMO_STORAGE_KEY);
  let offline: string | null = null;
  if (stored) {
    const signed = (JSON.parse(stored) as Record<string, unknown>)[missionId];
    const v = await verifySyntheticDemoSnapshot(signed, BUNDLED_TRUSTED_KEYS);
    if (v.ok) {
      const r = recognizeSyntheticDemo(exam, new Map([[missionId, evaluateSyntheticDemoSnapshot(v.snapshot)]]));
      offline = r.status === "SYNTHETIC_DEMO_RECOGNIZED" ? r.demoId : null;
    }
  }
  checks.push({ label: "Recognized from the stored signed demo snapshot (no network)", pass: offline === entry.demoId,
    detail: offline ? `signature verified with the bundled synthetic demo key; ${offline}` : "stored snapshot missing or failed verification" });
  const base = classifyIntakeObservation({ label, unit: entry.unit });
  const row = { label, unit: entry.unit, value: "", observedAt: "", classification: base, sourceKind: "manual", sourceLabel: "Synthetic check" };
  const withDemo = buildUnknownBiomarkerTerms([{ ...row, syntheticDemo: online ? { demoId: online.demoId } : null }]);
  const control = buildUnknownBiomarkerTerms([row]);
  checks.push({ label: "No duplicate unknown-biomarker request", pass: withDemo.length === 0 && control.length === 1,
    detail: `${withDemo.length} request term(s) with demo coverage (control without coverage: ${control.length})` });
  const other = syntheticDemoCoverage({ ...exam, unit: entry.unit === "nmol/L" ? "ng/mL" : "nmol/L" });
  checks.push({ label: "Different unit stays unknown (no conversion)", pass: other === null, detail: other ? "unexpectedly recognized" : "not recognized" });
  const real = syntheticDemoCoverage({ ...exam, provenance: "real" });
  checks.push({ label: "Real data never uses the demo catalog", pass: real === null, detail: real ? "unexpectedly recognized" : "not recognized" });
  checks.push({ label: "Catalog classification unchanged", pass: base.status !== "matched",
    detail: `still "${base.status}" — review-only, not saved to domain records` });
  return checks;
}

export function P37SyntheticDemoPanel({ missionId, missionLabel }: { missionId: string; missionLabel: string }) {
  const lifecycle = useServerFn(getSyntheticDemoLifecycle);
  const sync = useServerFn(getSignedSyntheticDemoSnapshot);
  const catalogs = useSyncExternalStore(subscribeSyntheticDemoCatalogs, getSyntheticDemoCatalogs, getSyntheticDemoCatalogs);
  const device = catalogs.get(missionId) ?? null;
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [note, setNote] = useState("");
  const [data, setData] = useState<{ canDecide: boolean; canActivate: boolean; terms: DemoScopeTerm[]; events: DemoLifecycleRow[] } | null>(null);
  const [syncMsg, setSyncMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Check[] | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    const r = await lifecycle({ data: { missionId } }).catch(() => null);
    if (!r || !r.ok) {
      setData(null);
      setNote(r?.message ?? "The synthetic demo catalog is unavailable. Nothing was changed.");
      setState("error");
      return;
    }
    setData({ canDecide: r.canDecide, canActivate: r.canActivate, terms: r.terms, events: r.events });
    setState("ready");
  }, [lifecycle, missionId]);
  useEffect(() => {
    void load();
  }, [load]);

  const syncDevice = async () => {
    setBusy(true);
    setSyncMsg(null);
    try {
      const r = await sync({ data: { missionId } }).catch(() => null);
      if (!r || !r.ok) {
        setSyncMsg({ ok: false, text: r?.message ?? "Demo catalog sync unavailable. This device keeps its last verified demo catalog." });
        return;
      }
      const storage = browserSnapshotStorage();
      if (!storage) {
        setSyncMsg({ ok: false, text: "Device storage unavailable." });
        return;
      }
      const res = await installOfferedDemoCatalog(r.signed, missionId, { storage });
      setSyncMsg({ ok: res.installed || res.reason.includes("up to date"), text: res.reason });
    } finally {
      setBusy(false);
    }
  };
  const installed = getInstalledDemoSnapshot(missionId);

  return (
    <section aria-labelledby={`demo-title-${missionId}`} className="mt-6 space-y-3 rounded-lg border-2 border-dashed border-border p-4" data-testid="p37-synthetic-demo">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`demo-title-${missionId}`} className="font-semibold">Synthetic demo catalog test — {missionLabel}</h3>
          <Badge variant="outline">SYNTHETIC DEMO</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{SYNTHETIC_DEMO_LABEL}. One owner-authorized biomarker only. Researcher demo decision → Ground Medical demo activation → device demo catalog → recognition of later synthetic examinations in this mission.</p>
      </div>
      {state === "loading" ? <p role="status" className="text-sm text-muted-foreground">Reading synthetic demo state…</p> : null}
      {state === "error" ? <p role="status" className="text-sm text-muted-foreground">{note}</p> : null}
      {state === "ready" && data ? (
        data.terms.length ? (
          <ul className="space-y-3">
            {data.terms.map((t) => {
              const ev = data.events.find((e) => e.termId === t.termId && e.submissionId === t.submissionId);
              return (
                <li key={`${t.submissionId}|${t.termId}`} className="space-y-2 rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t.originalLabels.join(", ")}</span>
                    <span className="text-xs">unit {t.exactUnit}</span>
                    <span className="font-mono text-xs text-muted-foreground">{t.termId}</span>
                    <Badge variant={ev?.revocationEventId ? "outline" : ev?.activationEventId ? "default" : "secondary"}>
                      {ev?.revocationEventId ? "DEMO REVOKED" : ev?.activationEventId ? "DEMO ACTIVE" : ev ? "DEMO DECISION · awaiting Ground Medical" : t.triageAction === "ACCEPT_FOR_REVIEW" ? "Accepted for review · no demo decision" : "Not accepted for review"}
                    </Badge>
                  </div>
                  {ev ? (
                    <>
                      <p className="text-xs text-muted-foreground">Demo entry {ev.entry.displayName} ({ev.demoId}) · labels {ev.entry.aliases.join(", ")} · exact unit {ev.entry.unit} · domain {ev.entry.domain} · specimen/method not recorded · {ev.entry.classification}</p>
                      <p className="break-all font-mono text-xs text-muted-foreground">Demo proposal SHA-256 {ev.entrySha256}</p>
                      {ev.revocationReason ? <p className="text-xs">Revoked: {ev.revocationReason}</p> : null}
                      <ActivationActions row={ev} term={t} onDone={load} />
                    </>
                  ) : data.canDecide && t.triageAction === "ACCEPT_FOR_REVIEW" && !t.submittedByCaller ? (
                    <DecisionForm missionId={missionId} term={t} onDone={load} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{data.canDecide ? "The term must be accepted for review first." : "The Researcher records the synthetic demo decision."}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No term of this mission is in the owner-authorized synthetic demo scope.</p>
        )
      ) : null}

      <div className="space-y-2 rounded-md border border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-medium">Synthetic demo catalog on this device</p>
            <p className="text-xs text-muted-foreground">
              {installed && device
                ? `Verified demo version ${device.demoCatalogVersion} · ${device.active.length} active · ${device.revoked.length} revoked · issued ${installed.snapshot.issuedAt.slice(0, 16).replace("T", " ")} UTC`
                : "No synthetic demo catalog installed for this mission."}{" "}
              Separate from the production catalog; works offline from the stored signed snapshot.
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void syncDevice()}>
            <RefreshCw className="mr-1 h-4 w-4" aria-hidden />
            {busy ? "Verifying…" : "Sync demo catalog"}
          </Button>
        </div>
        <Note msg={syncMsg} />
        <Button size="sm" variant="secondary" disabled={!device?.active.length} onClick={() => void runRecognitionChecks(missionId, device!).then(setChecks)}>
          Check a later synthetic examination
        </Button>
        {checks ? (
          <ol className="space-y-1 text-xs" data-testid="p37-demo-checks">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2">
                {c.pass ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="pass" /> : <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-label="fail" />}
                <span><span className="font-medium">{c.label}:</span> {c.detail}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
