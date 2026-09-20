import { useCallback, useEffect, useMemo, useState } from "react";
import { Cloud, Database, Filter, RefreshCw, RotateCw, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  loadRecordedMissionData,
  syncRecordedMissionQueue,
  type RecordedMissionDataset,
  type RecordedMissionRow,
} from "@/infrastructure/mission-records";

const emptyDataset: RecordedMissionDataset = {
  local: [],
  cloud: [],
  cloudContext: { signedIn: false, memberships: [], configuration: "configured" },
  queue: [],
};

function readableKind(value: string) {
  return value.replaceAll("_", " ");
}

function displayTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function queueCount(dataset: RecordedMissionDataset, states: string[]) {
  return dataset.queue.filter((item) => states.includes(item.state)).length;
}

function MetricValue({ row }: { row: RecordedMissionRow }) {
  if (!row.value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="font-mono text-sm">
      {row.value}
      {row.unit ? <span className="ml-1 text-muted-foreground">{row.unit}</span> : null}
    </span>
  );
}

export function RecordedMissionDataPage() {
  const [dataset, setDataset] = useState<RecordedMissionDataset>(emptyDataset);
  const [busy, setBusy] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<"all" | "local" | "cloud">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      setDataset(await loadRecordedMissionData());
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const rows = useMemo(() => {
    const combined =
      location === "local"
        ? dataset.local
        : location === "cloud"
          ? dataset.cloud
          : [...dataset.local, ...dataset.cloud];
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? combined.filter((row) =>
          [
            row.kind,
            row.metricCode,
            row.metricLabel,
            row.sourceId,
            row.value,
            row.quality,
            row.missionId,
          ].some((value) => value?.toLowerCase().includes(normalized)),
        )
      : combined;
    return filtered.sort(
      (left, right) => Date.parse(right.eventTimestamp) - Date.parse(left.eventTimestamp),
    );
  }, [dataset, location, query]);

  async function syncNow() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncRecordedMissionQueue();
      setMessage(
        result === "synced"
          ? "Governed Supabase synchronization completed."
          : result === "anonymous"
            ? "Cloud sync is locked until a signed-in user has an active mission membership. Local encrypted capture remains available."
            : result === "configuration_required"
              ? "Cloud sync is not configured for this published deployment. Local encrypted records remain available."
              : "Cloud sync is unavailable while this device is offline.",
      );
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloud synchronization failed");
      await refresh();
    } finally {
      setSyncing(false);
    }
  }

  const pending = queueCount(dataset, ["pending", "failed"]);
  const synced = queueCount(dataset, ["synced"]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-[96rem] px-5 py-8 lg:px-8">
        <section className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="section-kicker">Mission evidence & telemetry history</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Recorded Mission Data
            </h1>
            <p className="mt-4 max-w-4xl leading-7 text-muted-foreground">
              Review encrypted device-local observations and, when an authenticated mission
              membership exists, the governed Supabase copy. Missing cloud access never hides or
              invents local mission data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={busy}>
              <RefreshCw className={busy ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button onClick={() => void syncNow()} disabled={syncing || offline}>
              <RotateCw className={syncing ? "animate-spin" : ""} />
              Sync now
            </Button>
          </div>
        </section>

        {message ? (
          <div className="mt-5 rounded-md border border-border bg-card/70 p-3 text-sm text-muted-foreground">
            {message}
          </div>
        ) : null}
        {dataset.cloudContext.error ? (
          <div className="mt-3 rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            {dataset.cloudContext.configuration === "missing"
              ? dataset.cloudContext.error
              : `Cloud status: ${dataset.cloudContext.error}`}
          </div>
        ) : null}

        <section
          className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5"
          aria-label="Recorded data status"
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="text-primary" />
                Local encrypted
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl">{dataset.local.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Decrypted only in this browser for local review.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Cloud className="text-primary" />
                Cloud visible
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl">{dataset.cloud.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                RLS-authorized mission events visible from Supabase.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Pending / failed</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl">{pending}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Remain queued until transport and authorization are available.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Synced queue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-2xl">{synced}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Accepted or idempotently matched by governed transport.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="text-primary" />
                Cloud identity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-sm">
                {dataset.cloudContext.signedIn ? "AUTHENTICATED" : "LOCAL ONLY"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {dataset.cloudContext.memberships.length} active mission membership(s).
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mt-8 rounded-lg border border-border bg-card/50 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[16rem] flex-1">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search metric, source, value, quality or mission…"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="size-4" />
              Storage
            </div>
            {(["all", "local", "cloud"] as const).map((item) => (
              <Button
                key={item}
                size="sm"
                variant={location === item ? "default" : "outline"}
                onClick={() => setLocation(item)}
              >
                {item === "all" ? "All" : item === "local" ? "Local" : "Supabase"}
              </Button>
            ))}
          </div>
        </section>

        <section
          className="mt-5 overflow-hidden rounded-lg border border-border bg-card/40"
          aria-label="Recorded mission data table"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[70rem] text-left text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Metric / event</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Quality</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Storage</th>
                  <th className="px-4 py-3">Sync</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={`${row.location}:${row.id}`}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {displayTime(row.eventTimestamp)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {row.metricLabel ?? row.metricCode ?? readableKind(row.kind)}
                      </div>
                      <div className="mt-1 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                        {row.metricCode ?? readableKind(row.kind)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <MetricValue row={row} />
                    </td>
                    <td className="px-4 py-3">
                      {row.quality ? (
                        <Badge variant="outline">{row.quality.toUpperCase()}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs">{row.sourceId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">v{row.sourceVersion}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          row.location === "cloud"
                            ? "border-sky-400/40 text-sky-300"
                            : "border-emerald-400/40 text-emerald-300"
                        }
                      >
                        {row.location === "cloud" ? "SUPABASE" : "LOCAL"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {row.location === "cloud" ? "stored" : (row.syncState ?? "local-only")}
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      No recorded mission data matches the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <p className="mt-4 text-xs leading-5 text-muted-foreground">
          Medical-sensitive values are shown only from this device&apos;s decrypted local store or
          from Supabase rows authorized by existing mission RLS. Research exports remain
          de-identified through the separate governed research path.
        </p>
      </main>
    </div>
  );
}
