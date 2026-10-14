import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, Search, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AUDIT_PAGE_SIZE,
  EMPTY_AUDIT_FILTERS,
  auditActionLabel,
  auditDateRange,
  classifyAuditError,
  formatAuditTimestampUtc,
  type MissionAuditEntry,
  type MissionAuditFilters,
} from "@/domain/mission-audit/audit";
import { loadMissionAuditLog } from "@/infrastructure/mission-operations";

type ViewState = "loading" | "ready" | "unavailable" | "denied" | "error";

/** FV-01.4.6 read-only Mission Audit Log. No edit, delete or export controls exist by design. */
export function MissionAuditLog({ missionId }: { missionId: string }) {
  const [filters, setFilters] = useState<MissionAuditFilters>(EMPTY_AUDIT_FILTERS);
  const [applied, setApplied] = useState<MissionAuditFilters>(EMPTY_AUDIT_FILTERS);
  const [entries, setEntries] = useState<MissionAuditEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const request = useRef(0);

  const load = useCallback(
    async (f: MissionAuditFilters, cursor?: string | null) => {
      const range = auditDateRange(f);
      if (range.error) {
        setError(range.error);
        return;
      }
      const id = ++request.current;
      if (cursor) setLoadingMore(true);
      else {
        setView("loading");
        setError("");
      }
      try {
        const page = await loadMissionAuditLog({
          missionId,
          from: range.from,
          to: range.to,
          action: f.action,
          outcome: f.outcome,
          search: f.search,
          limit: AUDIT_PAGE_SIZE,
          cursor: cursor ?? null,
        });
        if (id !== request.current) return; // ignore stale responses after mission/filter switches
        setEntries((prev) => (cursor ? [...prev, ...page.entries] : page.entries));
        setNextCursor(page.has_more ? page.next_cursor : null);
        if (page.actions.length) setActions(page.actions);
        setView("ready");
      } catch (cause) {
        if (id !== request.current) return;
        const message = cause instanceof Error ? cause.message : "Audit log unavailable.";
        setView(classifyAuditError(message));
        setError(message);
      } finally {
        if (id === request.current) setLoadingMore(false);
      }
    },
    [missionId],
  );

  useEffect(() => {
    setEntries([]);
    setActions([]);
    setFilters(EMPTY_AUDIT_FILTERS);
    setApplied(EMPTY_AUDIT_FILTERS);
    setOpen(null);
    void load(EMPTY_AUDIT_FILTERS);
  }, [missionId, load]);

  function apply(next = filters) {
    setApplied(next);
    setOpen(null);
    void load(next);
  }

  return (
    <Card id="mission-audit-log" aria-labelledby="mission-audit-title" className="scroll-mt-28">
      <CardHeader>
        <CardTitle id="mission-audit-title" className="flex items-center gap-2">
          <History className="text-primary" /> Mission Audit Log
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Read-only record of actions in this mission. Times are stored and shown in UTC. Codes,
          emails, account IDs, names and health payloads are never shown.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          className="grid gap-4 md:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          aria-label="Audit log filters"
        >
          <div>
            <Label htmlFor="audit-from">From (UTC date)</Label>
            <Input
              id="audit-from"
              type="date"
              className="mt-2"
              value={filters.fromDate}
              onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="audit-to">To (UTC date)</Label>
            <Input
              id="audit-to"
              type="date"
              className="mt-2"
              value={filters.toDate}
              onChange={(e) => setFilters({ ...filters, toDate: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="audit-action">Action</Label>
            <select
              id="audit-action"
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {auditActionLabel(a)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="audit-outcome">Outcome</Label>
            <select
              id="audit-outcome"
              className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={filters.outcome}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  outcome: e.target.value as MissionAuditFilters["outcome"],
                })
              }
            >
              <option value="">All outcomes</option>
              <option value="success">Success</option>
              <option value="refused">Refused</option>
            </select>
          </div>
          <div>
            <Label htmlFor="audit-search">Search</Label>
            <Input
              id="audit-search"
              className="mt-2"
              maxLength={80}
              placeholder="action or target"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-5">
            <Button type="submit" disabled={view === "loading"}>
              <Search /> Apply filters
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFilters(EMPTY_AUDIT_FILTERS);
                apply(EMPTY_AUDIT_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        </form>
        {error && view === "ready" ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <div aria-live="polite">
          {view === "loading" ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading audit records…
            </p>
          ) : null}
          {view === "unavailable" ? (
            <p
              role="status"
              className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground"
            >
              The Mission Audit Log is waiting for an approved database update. No audit records can
              be shown yet.
            </p>
          ) : null}
          {view === "denied" ? (
            <p
              role="alert"
              className="flex items-center gap-2 rounded-md border border-border p-4 text-sm"
            >
              <ShieldAlert className="size-4" /> Access denied. Only active Mission Operators of
              this mission can view its audit log.
            </p>
          ) : null}
          {view === "error" ? (
            <p
              role="alert"
              className="rounded-md border border-border p-4 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          {view === "ready" && !entries.length ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              {JSON.stringify(applied) === JSON.stringify(EMPTY_AUDIT_FILTERS)
                ? "No audit records exist for this mission."
                : "No audit records match these filters."}
            </p>
          ) : null}
          {view === "ready" && entries.length ? (
            <ol className="space-y-2" aria-label="Audit records, newest first">
              {entries.map((entry, index) => (
                <li key={entry.ref || `row-${index}`} className="rounded-md border border-border">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                    aria-expanded={open === (entry.ref || `row-${index}`)}
                    aria-controls={`audit-${entry.ref || index}`}
                    onClick={() =>
                      setOpen(
                        open === (entry.ref || `row-${index}`) ? null : entry.ref || `row-${index}`,
                      )
                    }
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatAuditTimestampUtc(entry.occurred_at)}
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {auditActionLabel(entry.action)}
                    </span>
                    <Badge variant={entry.outcome === "refused" ? "destructive" : "outline"}>
                      {entry.outcome === "refused" ? "Refused" : "Success"}
                    </Badge>
                  </button>
                  {open === (entry.ref || `row-${index}`) ? (
                    <dl
                      id={`audit-${entry.ref || index}`}
                      className="grid gap-2 border-t border-border p-3 text-sm sm:grid-cols-2"
                    >
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                          Actor
                        </dt>
                        <dd>
                          {entry.actor === "self" ? "You" : entry.actor}
                          {entry.actor_role ? ` · ${entry.actor_role.replaceAll("_", " ")}` : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                          Target
                        </dt>
                        <dd>{entry.target_type.replaceAll("_", " ") || "—"}</dd>
                      </div>
                      {Object.entries(entry.details).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                            {k.replaceAll("_", " ")}
                          </dt>
                          <dd>{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
        {view === "ready" && nextCursor ? (
          <Button
            variant="outline"
            disabled={loadingMore}
            onClick={() => void load(applied, nextCursor)}
          >
            {loadingMore ? <Loader2 className="animate-spin" /> : null} Load older records
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
