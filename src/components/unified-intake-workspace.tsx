/**
 * Unified Medical Data Intake workspace. Every observation is classified
 * individually against the P36 source catalog (exact name + exact unit), is
 * confirmed row by row by a human reviewer, and is stored as a versioned,
 * encrypted, append-only offline envelope. Unknown, ambiguous or
 * unit-mismatched rows stay review-only and can never be saved. Research
 * reference only — no clinical thresholds, diagnosis or automatic approval.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  classifyIntakeObservation,
  type IntakeClassification,
} from "@/domain/health-domains/unified-intake-classification";
import { DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import {
  UNIFIED_OBSERVATION_SCHEMA,
  type ObservationSourceKind,
  type UnifiedObservation,
} from "@/domain/health-intelligence/observation-envelope";
import {
  domainReadableObservations,
  findUnifiedDuplicates,
  listUnifiedObservations,
  markUnifiedObservationErroneous,
  saveUnifiedObservation,
} from "@/domain/health-intelligence/observation-store";
import { extractBoneDocument } from "@/domain/bone-health/document-extraction";
import {
  loadMissionIdentity,
  subscribeMissionIdentity,
  type MissionIdentitySnapshot,
} from "@/infrastructure/mission-identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type IntakeRow = {
  key: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  excerpt: string;
  sourceKind: ObservationSourceKind;
  sourceLabel: string;
  documentName?: string;
  documentSha256?: string;
  classification: IntakeClassification;
  selected: boolean;
};

const SAFE_DECIMAL = /^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
const MAX_ROWS = 200;

function classify(label: string, unit: string): IntakeClassification {
  return classifyIntakeObservation({ label, unit });
}

function newRow(partial: Partial<IntakeRow> & { label: string; unit: string }): IntakeRow {
  return {
    key: crypto.randomUUID(),
    value: "",
    observedAt: "",
    excerpt: "",
    sourceKind: "manual",
    sourceLabel: "Manual entry",
    selected: false,
    ...partial,
    classification: classify(partial.label, partial.unit),
  };
}

/** Strict CSV: label,value,unit[,observed_at]. Ambiguous rows are skipped. */
function parseIntakeCsv(text: string): { rows: IntakeRow[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows: IntakeRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(0, MAX_ROWS + 1)) {
    const cells = line.split(",").map((cell) => cell.trim());
    if (cells.length < 3) {
      skipped += 1;
      continue;
    }
    const [label, value, unit, observedAt] = cells;
    if (!label || !value || !unit || /^label$/i.test(label!)) {
      skipped += 1;
      continue;
    }
    rows.push(
      newRow({
        label: label!,
        value: value!,
        unit: unit!,
        observedAt: observedAt ?? "",
        excerpt: line.slice(0, 350),
        sourceKind: "csv",
        sourceLabel: "CSV import",
      }),
    );
  }
  return { rows: rows.slice(0, MAX_ROWS), skipped };
}

/** Conservative text/OCR lines: "Label: 12.3 unit". Reference ranges are never extracted. */
const BLOCKED_LINE =
  /(?:reference|normal|interval|range|ref\.|\bmin\b|\bmax\b|[<>≤≥]|\d\s*[-–]\s*\d)/i;

function parseIntakeText(
  text: string,
  sourceKind: ObservationSourceKind,
  sourceLabel: string,
  documentName?: string,
  documentSha256?: string,
): IntakeRow[] {
  const rows: IntakeRow[] = [];
  for (const line of text.split(/\r?\n/).slice(0, 1000)) {
    if (line.length > 350 || BLOCKED_LINE.test(line)) continue;
    const match = /^\s*(.+?)\s*[:=]\s*([-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+))\s+([^\s;,|]+)\s*$/.exec(
      line,
    );
    if (!match) continue;
    rows.push(
      newRow({
        label: match[1]!.trim(),
        value: match[2]!,
        unit: match[3]!,
        excerpt: line.slice(0, 350),
        sourceKind,
        sourceLabel,
        documentName,
        documentSha256,
      }),
    );
    if (rows.length >= MAX_ROWS) break;
  }
  return rows;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function formatObservedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toLocaleString()} (local) · ${date.toISOString()} (UTC)`;
}

export function UnifiedIntakeWorkspace() {
  const [identity, setIdentity] = useState<MissionIdentitySnapshot | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void loadMissionIdentity()
        .then((value) => {
          if (active) setIdentity(value);
        })
        .catch(() => {
          if (active) setIdentity(null);
        });
    };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const memberships = useMemo(() => {
    const allowed =
      identity?.signedIn && !identity.error
        ? identity.memberships.filter(
            (member) =>
              (member.role === "crew_self" || member.role === "ground_medical") &&
              Boolean(member.crewMemberId),
          )
        : [];
    return allowed.map((member) => ({
      missionId: member.missionId,
      crewMemberId: member.crewMemberId!,
      missionLabel: member.missionName ?? member.missionCode ?? member.missionId,
      crewLabel: member.crewDisplayName ?? member.crewMemberId!,
    }));
  }, [identity]);

  const [missionKey, setMissionKey] = useState("");
  const membership = memberships.find((m) => `${m.missionId}|${m.crewMemberId}` === missionKey);

  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [history, setHistory] = useState<UnifiedObservation[]>([]);
  const [provenance, setProvenance] = useState<"" | "synthetic" | "real">("");
  const [reviewerConfirmed, setReviewerConfirmed] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const [status, setStatus] = useState(
    "No observations loaded. Nothing is uploaded or saved automatically.",
  );
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Manual entry draft
  const [manualLabel, setManualLabel] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [manualObservedAt, setManualObservedAt] = useState("");

  useEffect(() => {
    if (!membership) {
      setHistory([]);
      return;
    }
    let active = true;
    void listUnifiedObservations(membership.missionId, membership.crewMemberId)
      .then((entries) => {
        if (active) setHistory(entries);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [membership?.missionId, membership?.crewMemberId]);

  const resetReview = () => {
    setReviewerConfirmed(false);
    setDuplicateAcknowledged(false);
  };

  const addRows = (incoming: IntakeRow[], note: string) => {
    setRows((previous) => [...previous, ...incoming].slice(0, MAX_ROWS));
    resetReview();
    setStatus(note);
  };

  const editRow = (key: string, patch: Partial<IntakeRow>) => {
    setRows((previous) =>
      previous.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...patch };
        next.classification = classify(next.label, next.unit);
        return next;
      }),
    );
    resetReview();
  };

  const onCsvFile = async (file: File) => {
    const text = await file.text();
    const { rows: parsed, skipped } = parseIntakeCsv(text);
    addRows(
      parsed,
      `CSV parsed: ${parsed.length} candidate row(s)${skipped ? `, ${skipped} skipped` : ""}. All start unchecked — review each row.`,
    );
  };

  const onDocumentFile = async (file: File) => {
    setBusy(true);
    try {
      const hash = await sha256Hex(file);
      const extracted = await extractBoneDocument(file);
      const kind: ObservationSourceKind = extracted.method.includes("ocr") ? "ocr" : "pdf_text";
      const parsed = parseIntakeText(extracted.text, kind, `Document: ${file.name}`, file.name, hash);
      addRows(
        parsed,
        `Document "${file.name}" extracted on-device (${extracted.method}, ${extracted.pages} page(s), SHA-256 ${hash.slice(0, 12)}…): ${parsed.length} candidate row(s). All start unchecked — review each row.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Document extraction failed.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addManualRow = () => {
    if (!manualLabel.trim() || !manualValue.trim() || !manualUnit.trim()) {
      setStatus("Manual entry needs a label, value and unit.");
      return;
    }
    const observedAt = manualObservedAt ? new Date(manualObservedAt).toISOString() : "";
    addRows(
      [
        newRow({
          label: manualLabel,
          value: manualValue,
          unit: manualUnit,
          observedAt,
          sourceKind: "manual",
          sourceLabel: "Manual entry",
        }),
      ],
      "Manual row added unchecked — review and confirm before saving.",
    );
    setManualLabel("");
    setManualValue("");
    setManualUnit("");
    setManualObservedAt("");
  };

  const saveableRows = rows.filter(
    (row) =>
      row.selected &&
      row.classification.status === "matched" &&
      SAFE_DECIMAL.test(row.value.trim()) &&
      row.unit.trim() &&
      row.observedAt &&
      !Number.isNaN(Date.parse(row.observedAt)),
  );
  const reviewOnlyRows = rows.filter((row) => row.classification.status !== "matched");
  const duplicates = membership
    ? saveableRows.flatMap((row) =>
        findUnifiedDuplicates(history, {
          metricId:
            row.classification.status === "matched" ? row.classification.metricId : "",
          observedAt: row.observedAt,
          value: row.value,
        }),
      )
    : [];
  const canSave = Boolean(
    membership &&
      provenance &&
      reviewerConfirmed &&
      saveableRows.length > 0 &&
      (duplicates.length === 0 || duplicateAcknowledged) &&
      !busy,
  );

  const domainRouting = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of saveableRows)
      if (row.classification.status === "matched")
        counts[row.classification.domain] = (counts[row.classification.domain] ?? 0) + 1;
    return Object.entries(counts);
  }, [saveableRows]);

  const saveAccepted = async () => {
    if (!canSave || !membership || !provenance) return;
    setBusy(true);
    try {
      for (const row of saveableRows) {
        if (row.classification.status !== "matched") continue;
        const observation: UnifiedObservation = {
          schema: UNIFIED_OBSERVATION_SCHEMA,
          id: crypto.randomUUID(),
          missionId: membership.missionId,
          crewMemberId: membership.crewMemberId,
          metricId: row.classification.metricId,
          domain: row.classification.domain,
          value: row.value.trim(),
          originalUnit: row.unit.trim(),
          observedAt: new Date(row.observedAt).toISOString(),
          source: {
            kind: row.sourceKind,
            label: row.sourceLabel,
            documentName: row.documentName,
            documentSha256: row.documentSha256,
            excerpt: row.excerpt || undefined,
          },
          provenance,
          quality: {
            reviewerConfirmed: true,
            duplicateWarningAcknowledged: duplicates.length > 0 || undefined,
          },
          reviewState: "accepted",
          status: "active",
          recordedAt: new Date().toISOString(),
        };
        await saveUnifiedObservation(observation);
      }
      const savedKeys = new Set(saveableRows.map((row) => row.key));
      setRows((previous) => previous.filter((row) => !savedKeys.has(row.key)));
      setReviewerConfirmed(false);
      setDuplicateAcknowledged(false);
      setHistory(
        await listUnifiedObservations(membership.missionId, membership.crewMemberId),
      );
      setStatus(
        `${saveableRows.length} observation(s) saved encrypted on this device. Research reference only — not a scientific approval; no cloud records written.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Saving failed.");
    } finally {
      setBusy(false);
    }
  };

  const readable = domainReadableObservations(history);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          Unified Medical Data Intake
        </p>
        <h1 className="text-3xl font-bold sm:text-4xl">
          Unified Intake — Measurements &amp; Review
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          One review workflow for manual entry, CSV, PDF/OCR text, device observations and
          self-assessments. Every measurement is classified individually against the scientific
          source catalog — exact name and exact unit only. Unknown, ambiguous or
          unit-mismatched rows stay review-only. Accepted observations are stored encrypted on
          this device, append-only, and remain research reference only: no clinical thresholds,
          diagnosis, readiness score or automatic approval. Independent scientific review and
          PENDING_NIKOLAS_REVIEW gates are unchanged.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="intake-membership">Authorized mission &amp; crew</Label>
            <select
              id="intake-membership"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={missionKey}
              onChange={(event) => setMissionKey(event.target.value)}
            >
              <option value="">Select authorized mission and crew</option>
              {memberships.map((member) => (
                <option
                  key={`${member.missionId}|${member.crewMemberId}`}
                  value={`${member.missionId}|${member.crewMemberId}`}
                >
                  {member.missionLabel} — {member.crewLabel}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="intake-provenance">Data provenance (required)</Label>
            <select
              id="intake-provenance"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={provenance}
              onChange={(event) => {
                setProvenance(event.target.value as "synthetic" | "real");
                resetReview();
              }}
            >
              <option value="">Select provenance</option>
              <option value="synthetic">Synthetic / demo data</option>
              <option value="real">Real measurement</option>
            </select>
          </div>
        </div>
        {!membership ? (
          <p className="text-sm text-muted-foreground">
            Sign in with an authorized crew or ground medical mission membership to record
            observations. <Link to="/mission/identity" className="underline">Mission identity &amp; sign-in</Link>
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Add observations</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="intake-manual-label">Label (as reported)</Label>
            <Input
              id="intake-manual-label"
              value={manualLabel}
              onChange={(event) => setManualLabel(event.target.value)}
              placeholder="e.g. HR"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-value">Value</Label>
            <Input
              id="intake-manual-value"
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
              placeholder="e.g. 62"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-unit">Unit (as reported)</Label>
            <Input
              id="intake-manual-unit"
              value={manualUnit}
              onChange={(event) => setManualUnit(event.target.value)}
              placeholder="e.g. bpm"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="intake-manual-observed">Observed at (device local time)</Label>
            <Input
              id="intake-manual-observed"
              type="datetime-local"
              value={manualObservedAt}
              onChange={(event) => setManualObservedAt(event.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Entered in your device local time; stored as UTC.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={addManualRow}>
            Add manual row
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            Import CSV, PDF or scan (on-device)
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.pdf,image/*"
            className="hidden"
            aria-label="Import CSV, PDF or scanned document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (/\.csv$/i.test(file.name)) void onCsvFile(file);
              else void onDocumentFile(file);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Documents are processed on this device only. Original files are never uploaded
          automatically; the document name and SHA-256 fingerprint are kept with each row for
          traceability. Device observations and self-assessments use the same envelope through
          their own workflows.
        </p>
      </section>

      {rows.length ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Review each measurement</h2>
          <p className="text-sm text-muted-foreground">
            Classification is per measurement, not per document — one document can route to
            several health domains. Only rows matched exactly to the catalog can be selected;
            everything else remains review-only.
          </p>
          {domainRouting.length ? (
            <p className="text-sm">
              Domain routing preview:{" "}
              {domainRouting.map(([domain, count]) => (
                <Badge key={domain} variant="outline" className="mr-2">
                  {DOMAIN_LABELS[domain as keyof typeof DOMAIN_LABELS] ?? domain}: {count}
                </Badge>
              ))}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Review</th>
                  <th className="py-2 pr-3">Label</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Unit</th>
                  <th className="py-2 pr-3">Observed at</th>
                  <th className="py-2 pr-3">Classification</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.label}`}
                        disabled={row.classification.status !== "matched"}
                        checked={row.selected}
                        onChange={(event) => {
                          editRow(row.key, { selected: event.target.checked });
                        }}
                      />
                    </td>
                    <td className="py-2 pr-3 font-medium">{row.label}</td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`Value for ${row.label}`}
                        value={row.value}
                        onChange={(event) => editRow(row.key, { value: event.target.value })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`Unit for ${row.label}`}
                        value={row.unit}
                        onChange={(event) => editRow(row.key, { unit: event.target.value })}
                        className="h-8 w-24"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Input
                        aria-label={`Observation date for ${row.label}`}
                        type="datetime-local"
                        value={
                          row.observedAt && !Number.isNaN(Date.parse(row.observedAt))
                            ? new Date(row.observedAt).toISOString().slice(0, 16)
                            : row.observedAt
                        }
                        onChange={(event) =>
                          editRow(row.key, {
                            observedAt: event.target.value
                              ? new Date(event.target.value).toISOString()
                              : "",
                          })
                        }
                        className="h-8 w-52"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      {row.classification.status === "matched" ? (
                        <Badge variant="secondary">
                          Matched: {row.classification.metricId} →{" "}
                          {DOMAIN_LABELS[row.classification.domain]}
                        </Badge>
                      ) : row.classification.status === "unit_review_required" ? (
                        <Badge variant="outline">Unit review required — review-only</Badge>
                      ) : row.classification.status === "ambiguous" ? (
                        <Badge variant="outline">Ambiguous name — review-only</Badge>
                      ) : (
                        <Badge variant="outline">Unclassified — review-only</Badge>
                      )}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{row.sourceLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reviewOnlyRows.length ? (
            <p className="text-sm text-muted-foreground">
              {reviewOnlyRows.length} row(s) are review-only and cannot be saved: unknown,
              ambiguous or unit-mismatched observations never enter storage or domain read
              models.
            </p>
          ) : null}
          {duplicates.length ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">
                Possible duplicate: {duplicates.length} stored observation(s) share the same
                metric, time and value.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={duplicateAcknowledged}
                  onChange={(event) => setDuplicateAcknowledged(event.target.checked)}
                />
                This is a legitimate repeat measurement — save anyway.
              </label>
            </div>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reviewerConfirmed}
              onChange={(event) => setReviewerConfirmed(event.target.checked)}
            />
            I reviewed every selected row (label, value, original unit and observation time)
            and confirm it matches the source.
          </label>
          <Button type="button" disabled={!canSave} onClick={() => void saveAccepted()}>
            Save {saveableRows.length} reviewed observation(s) — encrypted, offline
          </Button>
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">Stored observations (this mission &amp; crew)</h2>
        <p className="text-sm text-muted-foreground">
          Append-only history: corrections mark records erroneous and add a superseding entry;
          nothing is rewritten or deleted. Only reviewer-accepted, non-erroneous observations
          connect to domain read models and Health Intelligence — and only as research-only
          evidence, never as diagnostic alerts.
        </p>
        {history.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-3">Observed</th>
                  <th className="py-2 pr-3">Metric</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Domain</th>
                  <th className="py-2 pr-3">Origin</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3 text-xs">{formatObservedAt(entry.observedAt)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{entry.metricId}</td>
                    <td className="py-2 pr-3">
                      {entry.value} {entry.originalUnit}
                    </td>
                    <td className="py-2 pr-3">{DOMAIN_LABELS[entry.domain]}</td>
                    <td className="py-2 pr-3 text-xs">{entry.provenance}</td>
                    <td className="py-2 pr-3">
                      {entry.status === "erroneous" ? (
                        <Badge variant="outline">Erroneous</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </td>
                    <td className="py-2">
                      {entry.status !== "erroneous" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const reason = window.prompt(
                              "Reason for marking this record erroneous (a superseding entry can then be added):",
                            );
                            if (!reason?.trim()) return;
                            void markUnifiedObservationErroneous(entry, reason)
                              .then(async () => {
                                if (membership)
                                  setHistory(
                                    await listUnifiedObservations(
                                      membership.missionId,
                                      membership.crewMemberId,
                                    ),
                                  );
                                setStatus(
                                  "Record marked erroneous. The original event is preserved; add a corrected entry above.",
                                );
                              })
                              .catch((error: unknown) =>
                                setStatus(
                                  error instanceof Error ? error.message : "Correction failed.",
                                ),
                              );
                          }}
                        >
                          Mark erroneous
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No records for this mission and crew.</p>
        )}
        <p className="text-xs text-muted-foreground">
          Domain-readable observations: {readable.length} of {history.length} (research-only
          evidence adapters; no clinical activation).
        </p>
      </section>

      <p role="status" className="text-sm text-muted-foreground">
        {status}
      </p>
    </main>
  );
}
