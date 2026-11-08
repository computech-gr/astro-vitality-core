/**
 * P55 shared bulk controls for the Researcher and Ground Medical screens:
 * selection toolbar (Select All Filtered across every page, Select Current
 * Page, Deselect All, counts and the hidden-selection notice), a per-action
 * table with actionable / already processed / blocked counts, a preflight
 * dialog that needs one explicit confirmation, and per-record outcomes with
 * Retry Failed Selection. Presentation only: every rule comes from the pure
 * P55 engine, and the server re-checks every write.
 */
import { useState, type ReactNode } from "react";
import { CheckSquare, ListChecks, RotateCcw, Square, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  BULK_OUTCOME_LABEL,
  outcomeCounts,
  type BulkOutcome,
  type BulkPreflight,
  type RecordOutcome,
  type SelectionScope,
} from "@/domain/health-intelligence/p55-bulk-selection-engine";
import type { BulkProgress } from "@/domain/health-intelligence/p38-bulk-demo-batches";

export function BulkSelectionToolbar({
  idPrefix,
  scope,
  pageCount,
  onSelectAllFiltered,
  onSelectPage,
  onDeselectAll,
  onKeepOnlyFiltered,
  extra,
}: {
  idPrefix: string;
  scope: SelectionScope;
  pageCount: number;
  onSelectAllFiltered: () => void;
  onSelectPage: () => void;
  onDeselectAll: () => void;
  onKeepOnlyFiltered: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-2" data-testid={`${idPrefix}-selection-toolbar`}>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Bulk selection">
        <Button
          size="sm"
          variant="secondary"
          disabled={!scope.totalMatching}
          onClick={onSelectAllFiltered}
        >
          <ListChecks className="mr-1 h-4 w-4" aria-hidden />
          Select All Filtered ({scope.totalMatching})
        </Button>
        <Button size="sm" variant="outline" disabled={!pageCount} onClick={onSelectPage}>
          <CheckSquare className="mr-1 h-4 w-4" aria-hidden />
          Select Current Page ({pageCount})
        </Button>
        <Button size="sm" variant="outline" disabled={!scope.selected} onClick={onDeselectAll}>
          <Square className="mr-1 h-4 w-4" aria-hidden />
          Deselect All
        </Button>
        {extra}
      </div>
      <p role="status" aria-live="polite" className="text-xs">
        <span className="font-medium">Selected {scope.selected}</span> · matching the current
        filters {scope.totalMatching} (all pages)
        {scope.allFilteredSelected ? " · every filtered record is selected" : ""}
      </p>
      {scope.selectedHidden ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
          <span>
            {scope.selectedHidden} selected record(s) are hidden by the current filters. They stay
            selected and are listed in the preflight before anything is recorded.
          </span>
          <Button size="sm" variant="ghost" onClick={onKeepOnlyFiltered}>
            Keep only filtered records
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export interface BulkActionOption {
  id: string;
  label: string;
  description: string;
  actionable: number;
  already: number;
  blocked: number;
  /** Why the action cannot run at all for this account (shown, button disabled). */
  unavailable?: string | null;
}

export function BulkActionTable({
  idPrefix,
  actions,
  selected,
  busy,
  onReview,
  onClear,
}: {
  idPrefix: string;
  actions: BulkActionOption[];
  selected: number;
  busy: boolean;
  onReview: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="space-y-2 rounded-md border border-border p-3"
      data-testid={`${idPrefix}-action-table`}
    >
      <p className="text-sm font-medium">Bulk actions for the {selected} selected record(s)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="p-1">Action</th>
              <th className="p-1 text-right">Actionable</th>
              <th className="p-1 text-right">Already processed</th>
              <th className="p-1 text-right">Blocked</th>
              <th className="p-1">
                <span className="sr-only">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {actions.map((a) => (
              <tr key={a.id} className="border-t border-border align-top">
                <td className="p-1">
                  <span className="font-medium">{a.label}</span>
                  <div className="text-muted-foreground">{a.unavailable ?? a.description}</div>
                </td>
                <td className="p-1 text-right tabular-nums">{a.actionable}</td>
                <td className="p-1 text-right tabular-nums">{a.already}</td>
                <td className="p-1 text-right tabular-nums">{a.blocked}</td>
                <td className="p-1 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !selected || !!a.unavailable}
                    onClick={() => onReview(a.id)}
                    aria-label={`Review preflight: ${a.label}`}
                  >
                    Preflight…
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" disabled={busy || !selected} onClick={onClear}>
        <XCircle className="mr-1 h-4 w-4" aria-hidden />
        Clear Selection
      </Button>
    </div>
  );
}

const LIST_LIMIT = 60;
function RecordList({
  title,
  items,
}: {
  title: string;
  items: { label: string; reason?: string }[];
}) {
  if (!items.length) return null;
  return (
    <details className="rounded border border-border p-2">
      <summary className="cursor-pointer text-xs font-medium">
        {title} ({items.length})
      </summary>
      <ul className="mt-1 max-h-48 space-y-0.5 overflow-auto text-xs">
        {items.slice(0, LIST_LIMIT).map((x, i) => (
          <li key={`${x.label}-${i}`}>
            {x.label}
            {x.reason ? <span className="text-muted-foreground"> — {x.reason}</span> : null}
          </li>
        ))}
        {items.length > LIST_LIMIT ? (
          <li className="text-muted-foreground">…and {items.length - LIST_LIMIT} more</li>
        ) : null}
      </ul>
    </details>
  );
}

export function BulkPreflightDialog<R>({
  preflight,
  labelOf,
  confirmLabel,
  confirmDisabled,
  safeguard,
  children,
  onConfirm,
  onCancel,
}: {
  preflight: BulkPreflight<R> | null;
  labelOf: (r: R) => string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  safeguard: string;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const p = preflight;
  return (
    <AlertDialog open={!!p} onOpenChange={(o) => (!o ? onCancel() : undefined)}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {p ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Preflight: {p.actionLabel}</AlertDialogTitle>
              <AlertDialogDescription>{safeguard}</AlertDialogDescription>
            </AlertDialogHeader>
            <dl
              className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1 text-sm"
              data-testid="p55-preflight-summary"
            >
              <dt className="text-muted-foreground">Selected mission</dt>
              <dd>{p.missionLabel}</dd>
              <dt className="text-muted-foreground">Your role</dt>
              <dd>{p.roleLabel}</dd>
              <dt className="text-muted-foreground">Requested action</dt>
              <dd>{p.actionLabel}</dd>
              <dt className="text-muted-foreground">Selected records</dt>
              <dd>
                {p.selected}
                {p.selectedHidden
                  ? ` (including ${p.selectedHidden} hidden by the current filters)`
                  : ""}
              </dd>
              <dt className="text-muted-foreground">Eligible / actionable</dt>
              <dd>{p.actionable.length}</dd>
              <dt className="text-muted-foreground">Already processed</dt>
              <dd>{p.already.length}</dd>
              <dt className="text-muted-foreground">Blocked</dt>
              <dd>{p.blocked.length}</dd>
              <dt className="text-muted-foreground">Expected state changes</dt>
              <dd className="font-semibold">{p.expectedChanges}</dd>
            </dl>
            {p.blockingReasons.length ? (
              <div className="space-y-1">
                <p className="text-xs font-medium">Blocking reasons</p>
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {p.blockingReasons.slice(0, 12).map((b) => (
                    <li key={b.reason}>
                      {b.count} × {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="space-y-1">
              <RecordList
                title="Will be processed"
                items={p.actionable.map((r) => ({ label: labelOf(r) }))}
              />
              <RecordList
                title="Already processed (skipped)"
                items={p.already.map((x) => ({ label: labelOf(x.record), reason: x.reason }))}
              />
              <RecordList
                title="Blocked (never sent)"
                items={p.blocked.map((x) => ({ label: labelOf(x.record), reason: x.reason }))}
              />
            </div>
            {children}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
              <Button disabled={confirmDisabled || !p.actionable.length} onClick={onConfirm}>
                {confirmLabel} ({p.expectedChanges})
              </Button>
            </AlertDialogFooter>
            {!p.actionable.length ? (
              <p className="text-xs text-muted-foreground">
                No selected record is eligible for this action, so nothing can be recorded. The
                selection stays available for inspection.
              </p>
            ) : null}
          </>
        ) : null}
      </AlertDialogContent>
    </AlertDialog>
  );
}

const OUTCOME_VARIANT: Record<BulkOutcome, "default" | "secondary" | "outline" | "destructive"> = {
  success: "default",
  already_completed: "secondary",
  blocked: "outline",
  failed: "destructive",
};

export function BulkOutcomePanel({
  idPrefix,
  title,
  progress,
  outcomes,
  failure,
  busy,
  onRetryFailed,
  footer,
}: {
  idPrefix: string;
  title: string;
  progress: BulkProgress | null;
  outcomes: RecordOutcome[];
  failure: string | null;
  busy: boolean;
  onRetryFailed: (ids: string[]) => void;
  footer?: ReactNode;
}) {
  const [filter, setFilter] = useState<BulkOutcome | "all">("all");
  const counts = outcomeCounts(outcomes);
  const failed = outcomes.filter((o) => o.retryAvailable).map((o) => o.id);
  const shown = outcomes.filter((o) => filter === "all" || o.outcome === filter);
  return (
    <div
      role="status"
      className="space-y-2 rounded-md border border-border p-3 text-xs"
      data-testid={`${idPrefix}-outcomes`}
    >
      <p className="font-medium">
        {title}
        {progress
          ? `: batch ${progress.batchesDone} of ${progress.batchesTotal} · ${progress.itemsDone} of ${progress.itemsTotal} sent records confirmed`
          : ""}
      </p>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(BULK_OUTCOME_LABEL) as BulkOutcome[]).map((k) => (
          <Badge key={k} variant={OUTCOME_VARIANT[k]}>
            {BULK_OUTCOME_LABEL[k]} {counts[k]}
          </Badge>
        ))}
      </div>
      {failure ? (
        <p role="alert" className="text-destructive">
          {failure}
        </p>
      ) : null}
      {outcomes.length ? (
        <details>
          <summary className="cursor-pointer">Per-record results ({outcomes.length})</summary>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Filter results">
            {(["all", ...Object.keys(BULK_OUTCOME_LABEL)] as (BulkOutcome | "all")[]).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={filter === k ? "secondary" : "ghost"}
                aria-pressed={filter === k}
                onClick={() => setFilter(k)}
              >
                {k === "all" ? "All" : BULK_OUTCOME_LABEL[k]}
              </Button>
            ))}
          </div>
          <ul className="mt-1 max-h-64 space-y-0.5 overflow-auto">
            {shown.map((o) => (
              <li
                key={`${o.outcome}-${o.id}`}
                className={o.outcome === "failed" ? "text-destructive" : ""}
              >
                {o.label}: {BULK_OUTCOME_LABEL[o.outcome]}
                {o.detail ? ` — ${o.detail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {failed.length ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onRetryFailed(failed)}>
          <RotateCcw className="mr-1 h-4 w-4" aria-hidden />
          Retry Failed Selection ({failed.length})
        </Button>
      ) : null}
      {footer}
    </div>
  );
}
