/**
 * P61 consolidated bulk examination preview, reconciliation and one-click bulk
 * confirmation. Display and filtering only: statuses come from the pure
 * evaluateBulkImport rules (existing save prerequisites), and saving stays in
 * the Unified Intake workspace with fresh authorization and append-only storage.
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import type { IntakeClassification } from "@/domain/health-domains/unified-intake-classification";
import type { ObservationDatePrecision } from "@/domain/health-intelligence/observation-date";
import {
  EXAM_DATE_SOURCE_TEXT,
  P61_EXCEPTION_LABELS,
  type BulkReconciliation,
  type ExamDateEvidence,
  type P61ExceptionCode,
  type P61RowStatus,
} from "@/domain/health-intelligence/p61-bulk-import";
import { syntheticIntakeAliasFor } from "@/domain/health-intelligence/p612-synthetic-intake-aliases";

export interface P61PanelRow {
  key: string;
  label: string;
  value: string;
  unit: string;
  observedAt: string;
  datePrecision?: ObservationDatePrecision | undefined;
  classification: IntakeClassification;
  examDate?: ExamDateEvidence | undefined;
  documentName?: string | undefined;
  /** P61.2: verbatim source context/note; shown as unverified provenance only. */
  sourceContext?: string | undefined;
}

const PAGE = 50;
const mappingText = (c: IntakeClassification) =>
  c.status === "matched"
    ? c.metricId.startsWith("demo:")
      ? `Synthetic demo catalog: ${c.metricId}`
      : c.metricId.startsWith("ext:")
        ? `Active catalog: ${c.metricId}`
        : `Catalog: ${c.metricId}`
    : c.status === "unit_review_required"
      ? "Unit differs from catalog"
      : c.status === "ambiguous"
        ? "Ambiguous name"
        : "Not in catalog";
const mappingKey = (c: IntakeClassification) => (c.status === "matched" ? "matched" : c.status);
const validationText = (s: P61RowStatus | undefined) =>
  !s
    ? "—"
    : s.kind === "validated"
      ? "Validated"
      : s.kind === "duplicate"
        ? "Duplicate — not saved"
        : s.kind === "rejected"
          ? "Rejected"
          : P61_EXCEPTION_LABELS[s.code];
const statusKey = (s: P61RowStatus | undefined) => (!s ? "" : s.kind === "exception" ? `exception:${s.code}` : s.kind);

function DateCell({ row }: { row: P61PanelRow }) {
  const e = row.examDate;
  const hasDate = Boolean(row.observedAt);
  return (
    <span className="block min-w-28">
      <span className="block font-medium tabular-nums">{hasDate ? row.observedAt : "—"}</span>
      {e ? (
        <span className="block text-xs text-muted-foreground">
          {e.status === "resolved" && e.source
            ? `${EXAM_DATE_SOURCE_TEXT[e.source]}${e.line ? `, line ${e.line}` : ""}`
            : e.status === "ambiguous"
              ? `Ambiguous: ${e.options.map((o) => o.iso).join(" or ")}`
              : e.status === "conflict"
                ? `Conflict: ${e.options.map((o) => o.iso).join(" vs ")}`
                : e.status === "invalid"
                  ? `Not a valid date${e.sourceText ? ` ("${e.sourceText}")` : ""}`
                  : hasDate
                    ? "entered"
                    : "Not stated"}
        </span>
      ) : null}
    </span>
  );
}

export function P61BulkImportPanel(props: {
  rows: readonly P61PanelRow[];
  statuses: ReadonlyMap<string, P61RowStatus>;
  reconciliation: BulkReconciliation;
  validatedCount: number;
  saveBlockedReason: string | null;
  busy: boolean;
  confirmed: boolean;
  onConfirmedChange: (confirmed: boolean) => void;
  onConfirmAndSave: () => void;
  onReviewExceptions: (code: P61ExceptionCode | "all") => void;
}) {
  const { rows, statuses, reconciliation: r } = props;
  const [date, setDate] = useState("");
  const [domain, setDomain] = useState("");
  const [mapping, setMapping] = useState("");
  const [validation, setValidation] = useState("");
  const [page, setPage] = useState(0);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (a.observedAt ? 0 : 1) - (b.observedAt ? 0 : 1) ||
          a.observedAt.localeCompare(b.observedAt) ||
          (a.classification.status === "matched" ? a.classification.domain : "~").localeCompare(
            b.classification.status === "matched" ? b.classification.domain : "~",
          ) ||
          a.label.localeCompare(b.label),
      ),
    [rows],
  );
  const filtered = sorted.filter((row) => {
    const s = statuses.get(row.key);
    if (date && (date === "none" ? Boolean(row.observedAt) : row.observedAt.slice(0, 10) !== date)) return false;
    if (domain && (row.classification.status === "matched" ? row.classification.domain : "none") !== domain) return false;
    if (mapping && mappingKey(row.classification) !== mapping) return false;
    if (validation === "exception") return s?.kind === "exception";
    if (validation && statusKey(s) !== validation) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const select = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm";
  const reset = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(0);
  };

  return (
    <section
      className="space-y-4 rounded-lg border border-border bg-card p-5"
      aria-labelledby="p61-bulk-import"
      data-testid="p61-bulk-import"
    >
      <div className="space-y-1">
        <h2 id="p61-bulk-import" className="text-lg font-semibold">
          Bulk examination import — consolidated preview
        </h2>
        <p className="text-sm text-muted-foreground">
          Every observation keeps the examination date stated in the source (a date on the row, a
          date column or the examination heading above it). Validated rows can be confirmed in one
          step; only the exceptions below need individual review. Nothing is saved until you confirm.
        </p>
      </div>

      <div data-testid="p61-reconciliation" className="space-y-2">
        <h3 className="text-sm font-semibold">Reconciliation</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          {(
            [
              ["Observations", r.observations],
              ["Biomarker series", r.series],
              ["Examination dates", r.examinationDates],
              ["Without a date", r.undated],
              ["Accepted (saved)", r.accepted],
              ["Validated — awaiting confirmation", r.validated],
              ["Unresolved (exceptions)", r.unresolved],
              ["Duplicates (not saved)", r.duplicates],
              ["Rejected", r.rejected],
            ] as const
          ).map(([term, value]) => (
            <div key={term} className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-muted-foreground">{term}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {r.perDate.length ? (
          <div className="text-xs text-muted-foreground" data-testid="p61-per-date">
            Per examination date:{" "}
            {r.perDate.map((d) => (
              <Badge key={d.date} variant="outline" className="mr-1 mt-1 tabular-nums">
                {d.date} · {d.observations}
              </Badge>
            ))}
          </div>
        ) : null}
        <p
          role="status"
          className={`text-sm font-medium ${r.unresolved ? "text-destructive" : ""}`}
          data-testid="p61-reconciliation-summary"
        >
          {r.summary}
        </p>
      </div>

      {r.exceptions.length ? (
        <div className="space-y-2" data-testid="p61-exception-queue">
          <h3 className="text-sm font-semibold">Exception queue ({r.unresolved})</h3>
          <p className="text-xs text-muted-foreground">
            These rows are never included in bulk confirmation. Open them in the measurement table
            below to correct a date, value or unit, choose a date reading, or leave them unsaved.
          </p>
          <div className="flex flex-wrap gap-2">
            {r.exceptions.map((e) => (
              <Button
                key={e.code}
                type="button"
                size="sm"
                variant="outline"
                className="h-auto whitespace-normal py-1 text-left"
                onClick={() => props.onReviewExceptions(e.code)}
              >
                {e.label}: {e.rows}
              </Button>
            ))}
            <Button type="button" size="sm" variant="secondary" onClick={() => props.onReviewExceptions("all")}>
              Review all {r.unresolved} exception(s)
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4" data-testid="p61-preview-filters">
        <div className="space-y-1">
          <Label htmlFor="p61-filter-date">Examination date</Label>
          <select id="p61-filter-date" className={select} value={date} onChange={(e) => reset(setDate)(e.target.value)}>
            <option value="">All dates</option>
            {r.perDate.map((d) => (
              <option key={d.date} value={d.date}>
                {d.date}
              </option>
            ))}
            <option value="none">No date</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p61-filter-domain">Scientific domain</Label>
          <select id="p61-filter-domain" className={select} value={domain} onChange={(e) => reset(setDomain)(e.target.value)}>
            <option value="">All domains</option>
            {Object.entries(DOMAIN_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
            <option value="none">Not mapped</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p61-filter-mapping">Mapping status</Label>
          <select id="p61-filter-mapping" className={select} value={mapping} onChange={(e) => reset(setMapping)(e.target.value)}>
            <option value="">All</option>
            <option value="matched">Catalog-mapped</option>
            <option value="unit_review_required">Unit differs from catalog</option>
            <option value="ambiguous">Ambiguous name</option>
            <option value="unclassified">Not in catalog</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p61-filter-validation">Validation status</Label>
          <select
            id="p61-filter-validation"
            className={select}
            value={validation}
            onChange={(e) => reset(setValidation)(e.target.value)}
          >
            <option value="">All</option>
            <option value="validated">Validated</option>
            <option value="exception">Any exception</option>
            {Object.entries(P61_EXCEPTION_LABELS).map(([code, label]) => (
              <option key={code} value={`exception:${code}`}>
                {label}
              </option>
            ))}
            <option value="duplicate">Duplicate</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto" role="region" aria-label="Consolidated examination preview" tabIndex={0}>
        <table className="w-full min-w-[720px] text-left text-sm" data-testid="p61-preview-table">
          <thead>
            <tr className="border-b border-border text-xs uppercase text-muted-foreground">
              <th scope="col" className="py-2 pr-3">Examination date</th>
              <th scope="col" className="py-2 pr-3">Biomarker</th>
              <th scope="col" className="py-2 pr-3">Value</th>
              <th scope="col" className="py-2 pr-3">Unit</th>
              <th scope="col" className="py-2 pr-3">Scientific domain</th>
              <th scope="col" className="py-2 pr-3">Mapping status</th>
              <th scope="col" className="py-2">Validation status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const s = statuses.get(row.key);
              return (
                <tr key={row.key} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <DateCell row={row} />
                  </td>
                  <td className="py-2 pr-3 font-medium">
                    {row.label}
                    {row.sourceContext ? (
                      <span className="mt-0.5 block max-w-56 text-xs font-normal text-muted-foreground">
                        Source note (unverified): {row.sourceContext}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.value || "—"}</td>
                  <td className="py-2 pr-3">{row.unit || "—"}</td>
                  <td className="py-2 pr-3">
                    {row.classification.status === "matched" ? DOMAIN_LABELS[row.classification.domain] : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {mappingText(row.classification)}
                    {row.classification.status === "matched" &&
                    syntheticIntakeAliasFor({ label: row.label, unit: row.unit, metricId: row.classification.metricId }) ? (
                      <span className="mt-0.5 block text-muted-foreground">
                        Via synthetic alias "{row.label}" → {row.classification.metricId} — pending Researcher review
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 text-xs">
                    <Badge
                      variant={s?.kind === "validated" ? "secondary" : "outline"}
                      className={s?.kind === "exception" ? "border-destructive text-destructive" : ""}
                      title={s?.reason}
                    >
                      {validationText(s)}
                    </Badge>
                    {s && s.kind !== "validated" ? (
                      <span className="mt-1 block max-w-64 text-muted-foreground">{s.reason}</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {shown.length ? current * PAGE + 1 : 0}–{current * PAGE + shown.length} of {filtered.length}
          {filtered.length !== rows.length ? ` (filtered from ${rows.length})` : ""}
        </span>
        <span className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </span>
      </div>

      <div className="space-y-3 rounded-md border border-border p-3" data-testid="p61-bulk-confirmation">
        <h3 className="text-sm font-semibold">Bulk confirmation</h3>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={props.confirmed}
            disabled={props.validatedCount === 0 || props.busy}
            onChange={(event) => props.onConfirmedChange(event.target.checked)}
          />
          <span>
            I reviewed the consolidated preview and confirm that the {props.validatedCount} validated
            observation(s) — examination date, biomarker, value and original unit — match the source.
          </span>
        </label>
        <Button
          type="button"
          className="h-auto w-full whitespace-normal py-2 text-center"
          disabled={!props.confirmed || props.validatedCount === 0 || props.busy || Boolean(props.saveBlockedReason)}
          onClick={props.onConfirmAndSave}
        >
          Confirm and save {props.validatedCount} validated observation(s) — encrypted, offline
        </Button>
        <p className="text-xs text-muted-foreground">
          {props.saveBlockedReason ??
            `Exceptions (${r.unresolved}), duplicates (${r.duplicates}) and rejected rows (${r.rejected}) are not included. Each saved observation is appended to this device's encrypted store; nothing is overwritten or uploaded. Research reference only — not a scientific approval.`}
        </p>
      </div>
    </section>
  );
}
