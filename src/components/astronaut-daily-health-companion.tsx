import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  advanceReminder,
  createReminderPlan,
  reminderDue,
  reminderText,
  REMINDER_INTERVAL_MINUTES,
  type ReminderInterval,
  type ReminderPlan,
} from "@/domain/companion/reminder-engine";
import { getCloudMissionContext } from "@/infrastructure/mission-records";
import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import { supabase } from "@/integrations/supabase/client";
import {
  createCrewEvidenceController,
  crewScopeKey as scopeKey,
  CREW_STATUS,
  restoreTrendSelection,
  type CrewPhase,
  type CrewScope,
  type TrendSelection,
} from "@/domain/companion/crew-revalidation";
import type {
  ScientificEvidenceReport,
  ScientificObservation,
} from "@/domain/health-intelligence/live-evidence";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { P48SyntheticIntakePanel } from "@/components/p48-synthetic-intake-panel";
import {
  COMPANION_ENVIRONMENTS,
  filterTrendObservations,
  SYNTHETIC_TREND_SERIES,
  COMPANION_ROUTINE,
  chartGeometry,
  participation,
  qualityPresentation,
  type CompanionEnvironment,
} from "@/domain/companion/daily-companion";


const qualityClass: Record<ReturnType<typeof qualityPresentation>["tone"], string> = {
  good: "border-quality-good/50 bg-quality-good/10 text-quality-good",
  degraded: "border-quality-degraded/50 bg-quality-degraded/10 text-quality-degraded",
  neutral: "border-border bg-muted text-muted-foreground",
};

function MetricChart({ items, unit }: { items: ScientificObservation[]; unit: string }) {
  const geometry = chartGeometry(items);
  if (items.length === 0)
    return <p className="text-sm text-muted-foreground">No observations for this metric yet.</p>;
  if (!geometry)
    return (
      <p className="text-sm text-muted-foreground">
        Only one observation is available. At least two observations are needed for a trend chart.
      </p>
    );
  const first = geometry.points[0]!;
  const last = geometry.points[geometry.points.length - 1]!;
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 600 156"
        role="img"
        aria-label={`Descriptive chart of ${geometry.points.length} observations in ${unit}; not a clinical risk assessment`}
        className="w-full rounded border bg-background text-primary"
      >
        <line x1="24" y1="140" x2="576" y2="140" stroke="currentColor" opacity=".2" />
        <text x="4" y="22" className="fill-muted-foreground" fontSize="18">
          {geometry.max}
        </text>
        <text x="4" y="136" className="fill-muted-foreground" fontSize="18">
          {geometry.min}
        </text>
        <polyline
          points={geometry.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {geometry.points.map((p) => (
          <circle key={p.item.id} cx={p.x} cy={p.y} r="3.5" fill="currentColor">
            <title>{`${p.item.observedAt}: ${p.item.value} ${unit}; quality ${p.item.quality}; source ${p.item.sourceId}`}</title>
          </circle>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">
        {new Date(first.item.observedAt).toLocaleDateString()} →{" "}
        {new Date(last.item.observedAt).toLocaleDateString()} · {geometry.points.length}{" "}
        observations
        {geometry.truncated ? " (latest 30 shown)" : ""} · {unit} · range shown is the observed
        minimum/maximum only; no clinical thresholds
      </p>
    </div>
  );
}

function SyntheticMetricChart({ metric }: { metric: keyof typeof SYNTHETIC_TREND_SERIES }) {
  const series = SYNTHETIC_TREND_SERIES[metric];
  const values = series.values;
  const min = Math.min(...values),
    max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, i) => ({
    value,
    x: 68 + i * 122,
    y: 126 - ((value - min) / span) * 90,
  }));
  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 620 170"
        className="w-full rounded border bg-background text-primary"
        role="img"
        aria-label={`Synthetic ${series.label} chart, five illustrative values: ${values.join(", ")}; not clinical data`}
      >
        <line x1="60" y1="140" x2="566" y2="140" stroke="currentColor" opacity=".25" />
        <polyline
          points={points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="5" fill="currentColor">
              <title>{`Day ${i + 1}: ${p.value} ${series.unit} (synthetic)`}</title>
            </circle>
            <text
              x={p.x}
              y={p.y - 11}
              textAnchor="middle"
              fontSize="16"
              className="fill-foreground"
            >
              {p.value}
            </text>
            <text
              x={p.x}
              y="162"
              textAnchor="middle"
              fontSize="15"
              className="fill-muted-foreground"
            >
              D{i + 1}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-xs text-muted-foreground">
        Observed range (illustrative): {min}–{max} {series.unit}. No reference ranges or clinical
        thresholds.
      </p>
      <table className="w-full table-fixed text-left text-xs">
        <caption className="sr-only">Synthetic demonstration values</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            {values.map((_, i) => (
              <th scope="col" key={i}>
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{series.unit}</th>
            {values.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AstronautDailyHealthCompanion() {
  const [environment, setEnvironment] = useState<CompanionEnvironment>("station");
  const [completed, setCompleted] = useState<string[]>([]);
  const [memberships, setMemberships] = useState<CrewScope[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const [status, setStatus] = useState<string>(CREW_STATUS.initial);
  const [crewPhase, setCrewPhase] = useState<CrewPhase>("checking");
  const [metric, setMetric] = useState("");
  const [trendWindow, setTrendWindow] = useState<"all" | "7" | "30" | "90">("all");
  const [trendSource, setTrendSource] = useState("all");
  const [syntheticMetric, setSyntheticMetric] = useState<"heart" | "hrv" | "sleep">("heart");
  const [reminderInterval, setReminderInterval] = useState<ReminderInterval>(60);
  const [reminderPlan, setReminderPlan] = useState<ReminderPlan | null>(null);
  const [reminderNotice, setReminderNotice] = useState("");
  const [notificationStatus, setNotificationStatus] = useState("Not requested");
  const [showSyntheticTrends, setShowSyntheticTrends] = useState(false);

  useEffect(() => {
    if (!reminderPlan?.enabled) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!reminderDue(reminderPlan, now)) return;
      setReminderNotice(reminderText());
      setReminderPlan((current) =>
        current && reminderDue(current, now) ? advanceReminder(current, now) : current,
      );
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("MITOCHONDRIA · Routine reminder", { body: reminderText() });
        } catch {
          /* in-page notice remains available */
        }
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [reminderPlan]);

  const requestReminderPermission = async () => {
    if (typeof Notification === "undefined") {
      setNotificationStatus("Browser notifications unsupported; in-page reminders still work.");
      return;
    }
    try {
      setNotificationStatus(`Browser permission: ${await Notification.requestPermission()}`);
    } catch {
      setNotificationStatus("Permission unavailable; in-page reminders still work.");
    }
  };

  // P48.2: fail-closed focused revalidation (replaces the P48.1 full reload). Private
  // evidence is hidden synchronously when the tab is backgrounded and again on return,
  // before any request; fresh membership and RLS-backed evidence reads then decide what
  // reappears, and generation tokens drop late responses. Checklist, environment,
  // synthetic demo and reminders are untouched. Not real-time while continuously visible.
  const filtersRef = useRef<TrendSelection>({ metric: "", window: "all", source: "all" });
  useEffect(() => {
    filtersRef.current = { metric, window: trendWindow, source: trendSource };
  });
  const controllerRef = useRef<ReturnType<typeof createCrewEvidenceController> | null>(null);

  useEffect(() => {
    const controller = createCrewEvidenceController({
      role: "crew_self",
      loadContext: getCloudMissionContext,
      loadEvidence: loadCrewScientificEvidence,
      sink: {
        setPhase: (phase, text) => {
          setCrewPhase(phase);
          setStatus(text);
          if (phase === "revoked" || phase === "none") {
            setReport(null);
            setMetric("");
            setTrendWindow("all");
            setTrendSource("all");
          }
        },
        setScopes: (scopes, key) => {
          setMemberships(scopes);
          setSelected(key);
        },
        setReport: (next, preserveFilters) => {
          setReport(next);
          if (!next) return;
          const restored = restoreTrendSelection(
            next,
            preserveFilters ? filtersRef.current : null,
          );
          setMetric(restored.metric);
          setTrendWindow(restored.window);
          setTrendSource(restored.source);
        },
      },
    });
    controllerRef.current = controller;
    void controller.revalidate("initial");

    let wasHidden = document.visibilityState === "hidden";
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasHidden = true;
        controller.suspend();
      } else if (wasHidden) {
        wasHidden = false;
        void controller.revalidate("return");
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void controller.revalidate("return");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    const { data: auth } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED")
        void controller.revalidate("auth");
    });
    return () => {
      controller.dispose();
      controllerRef.current = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      auth.subscription.unsubscribe();
    };
  }, []);

  const current = useMemo(
    () => report?.metrics.find((m) => `${m.metricCode}|${m.unit}` === metric),
    [report, metric],
  );
  const series = useMemo(
    () =>
      current
        ? (report?.observations.filter(
            (o) => o.metricCode === current.metricCode && o.unit === current.unit,
          ) ?? [])
        : [],
    [report, current],
  );
  const sources = useMemo(
    () => Array.from(new Set(series.map((o) => o.sourceId))).sort(),
    [series],
  );
  const filteredSeries = useMemo(
    () => filterTrendObservations(series, trendWindow, trendSource),
    [series, trendWindow, trendSource],
  );
  const progress = participation(completed, COMPANION_ROUTINE.length);
  const quality = current ? qualityPresentation(current.latest.quality) : null;

  return (
    <main className="mx-auto min-w-0 max-w-7xl space-y-8 px-4 py-8 [overflow-wrap:anywhere] sm:px-5 sm:py-10 lg:px-8">
      <header>
        <p className="section-kicker">Mission health companion · research use only</p>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">
          Daily Health Companion
        </h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Environment-aware routine, participation tracking, read-only trends and plain-language
          data explanations. This tool does not diagnose, prescribe, assign medical fitness or
          replace mission medical protocols.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="font-semibold leading-none tracking-tight">1 · Mission environment</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="block text-sm" htmlFor="companion-environment">
            Operational context (illustrative; not automatically detected)
          </label>
          <select
            id="companion-environment"
            value={environment}
            onChange={(e) => setEnvironment(e.target.value as CompanionEnvironment)}
            className="w-full max-w-lg rounded border bg-background p-2"
          >
            {Object.entries(COMPANION_ENVIRONMENTS).map(([id, item]) => (
              <option key={id} value={id}>
                {item.name}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted-foreground" data-testid="environment-note">
            {COMPANION_ENVIRONMENTS[environment].note} Changing this selection does not change
            clinical interpretation or medical protocols.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold leading-none tracking-tight">
            2 · Daily routine & reminders
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Suggested checklist only. No medically prescribed frequencies; the optional reminders
            below are user-chosen and work only while this page is open. Completion is kept in
            memory for this page session; nothing is saved to the medical record.
          </p>
          <section className="space-y-3 rounded border p-4" aria-label="Optional timed reminders">
            <h3 className="font-semibold">Optional timed check-in reminders</h3>
            <p className="text-sm text-muted-foreground">
              Choose your own demonstration interval. No medical frequency is prescribed. Timers run
              only while this page stays open; they do not persist across reloads, devices or
              offline browser shutdown. Browser notifications require permission and are not
              guaranteed.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="companion-reminder-interval">Repeat every</label>
              <select
                id="companion-reminder-interval"
                className="rounded border bg-background p-2"
                value={reminderInterval}
                onChange={(e) => setReminderInterval(Number(e.target.value) as ReminderInterval)}
              >
                {REMINDER_INTERVAL_MINUTES.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} minute{minutes === 1 ? "" : "s"}
                    {minutes === 1 ? " (demo)" : ""}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                onClick={() => {
                  setReminderNotice("");
                  setReminderPlan(createReminderPlan(Date.now(), reminderInterval));
                }}
              >
                Start reminders
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!reminderPlan}
                onClick={() => {
                  setReminderPlan(null);
                  setReminderNotice("");
                }}
              >
                Stop
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void requestReminderPermission()}
              >
                Enable browser notifications
              </Button>
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {reminderPlan
                ? `Active · next check-in ${new Date(reminderPlan.nextDueAt).toLocaleTimeString()}`
                : "Reminders off"}{" "}
              · {notificationStatus}
            </p>
            {reminderNotice && (
              <div role="status" className="rounded border border-primary p-3">
                <strong>Routine reminder</strong>
                <p>{reminderNotice}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => setReminderNotice("")}
                >
                  Dismiss
                </Button>
              </div>
            )}
          </section>
          <div className="grid gap-3 md:grid-cols-2">
            {COMPANION_ROUTINE.map((item) => (
              <div key={item.id} className="rounded border p-4">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={completed.includes(item.id)}
                    onChange={(e) =>
                      setCompleted((prev) =>
                        e.target.checked ? [...prev, item.id] : prev.filter((x) => x !== item.id),
                      )
                    }
                    className="mt-1 h-4 w-4 shrink-0"
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <span className="block text-xs text-muted-foreground">{item.cadence}</span>
                  </span>
                </label>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                <Link
                  className="mt-2 inline-flex min-h-11 items-center rounded px-2 py-2 text-sm text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  to={item.href}
                >
                  Open relevant console
                </Link>
              </div>
            ))}
          </div>
          <div aria-live="polite">
            <strong>
              Participation: {progress.done} / {progress.total} activities
            </strong>
            <div className="mt-2 h-2 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Participation progress only — never a health score, readiness certification or medical
              recommendation.
            </p>
            <Button className="mt-2" variant="outline" onClick={() => setCompleted([])}>
              Reset session checklist
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold leading-none tracking-tight">3 · Dynamic health trends</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p
              className="text-sm text-muted-foreground"
              data-testid="trend-status"
              aria-live="polite"
            >
              {status}
            </p>
            {crewPhase === "error" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void controllerRef.current?.revalidate("retry")}
              >
                Retry authorization
              </Button>
            )}
          </div>
          <section
            className="rounded border border-dashed p-4 space-y-3"
            aria-label="Synthetic trend demonstration"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">Synthetic trend demonstration</h3>
                <p className="text-sm text-muted-foreground">
                  Illustrative values only; not a crew record, clinical baseline, or live sensor
                  feed.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                aria-expanded={showSyntheticTrends}
                aria-controls="companion-synthetic-trend"
                onClick={() => setShowSyntheticTrends((v) => !v)}
              >
                {showSyntheticTrends ? "Hide synthetic example" : "Show synthetic example"}
              </Button>
            </div>
            {showSyntheticTrends && (
              <div
                id="companion-synthetic-trend"
                className="space-y-2"
                data-testid="companion-synthetic-trend"
              >
                <label className="block text-sm" htmlFor="companion-synthetic-metric">
                  Synthetic biomarker
                </label>
                <select
                  id="companion-synthetic-metric"
                  className="rounded border bg-background p-2"
                  value={syntheticMetric}
                  onChange={(e) => setSyntheticMetric(e.target.value as typeof syntheticMetric)}
                >
                  <option value="heart">Resting heart rate (bpm)</option>
                  <option value="hrv">Heart rate variability (ms)</option>
                  <option value="sleep">Sleep duration (hours)</option>
                </select>
                <p className="font-semibold text-sm">
                  SYNTHETIC DEMONSTRATION — {SYNTHETIC_TREND_SERIES[syntheticMetric].label}
                </p>
                <SyntheticMetricChart metric={syntheticMetric} />
                <p className="text-xs text-muted-foreground">
                  Illustrative days 1–5. Not from mission records, not a clinical baseline or
                  health-risk assessment.
                </p>
              </div>
            )}
          </section>
          {(memberships.length > 1 || (memberships.length > 0 && !selected)) && (
            <label className="block text-sm">
              Authorized crew mission
              <select
                className="mt-1 block w-full max-w-xl rounded border bg-background p-2"
                value={selected}
                onChange={(e) => void controllerRef.current?.select(e.target.value)}
              >
                {!selected && (
                  <option value="" disabled>
                    Choose an authorized mission
                  </option>
                )}
                {memberships.map((m) => (
                  <option key={scopeKey(m)} value={scopeKey(m)}>
                    {m.missionId} · {m.crewMemberId}
                  </option>
                ))}
              </select>
            </label>
          )}
          <P48SyntheticIntakePanel
            scope={
              (crewPhase === "ready" || crewPhase === "none") && selected
                ? (memberships.find((m) => scopeKey(m) === selected) ?? null)
                : null
            }
            onSubmitted={() => void controllerRef.current?.revalidate("retry")}
          />
          {report && (
            <>
              <p className="text-sm">
                {report.observations.length} eligible observations · {report.metrics.length}{" "}
                metric/unit series
              </p>
              {report.metrics.length === 0 && (
                <p className="rounded border border-dashed p-4 text-sm text-muted-foreground">
                  No recorded measurements are available for your mission yet. Add measurements
                  through{" "}
                  <Link className="text-primary underline" to="/mission/intake">
                    Unified Data Intake
                  </Link>{" "}
                  after human verification.
                </p>
              )}
              {report.metrics.length > 0 && (
                <>
                  <label className="block text-sm" htmlFor="companion-metric">
                    Metric and original unit
                  </label>
                  <select
                    id="companion-metric"
                    value={metric}
                    onChange={(e) => {
                      setMetric(e.target.value);
                      setTrendSource("all");
                      setTrendWindow("all");
                    }}
                    className="w-full max-w-xl rounded border bg-background p-2"
                  >
                    {report.metrics.map((m) => (
                      <option key={`${m.metricCode}|${m.unit}`} value={`${m.metricCode}|${m.unit}`}>
                        {m.latest.metricLabel ? `${m.latest.metricLabel} (${m.metricCode})` : m.metricCode}{" "}
                        · {m.unit} · {m.count} samples
                      </option>
                    ))}
                  </select>
                  {current && quality && (
                    <>
                      <div
                        className={`inline-block rounded border px-3 py-1 text-sm ${qualityClass[quality.tone]}`}
                      >
                        {quality.label}
                      </div>
                      <p className="text-sm">
                        Latest recorded: {current.latest.value} {current.unit} ·{" "}
                        {new Date(current.latest.observedAt).toLocaleString()} · source{" "}
                        {current.latest.sourceId}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <label className="text-sm">
                          Time window
                          <select
                            className="mt-1 block rounded border bg-background p-2"
                            value={trendWindow}
                            onChange={(e) => setTrendWindow(e.target.value as typeof trendWindow)}
                          >
                            <option value="all">All recorded</option>
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="90">Last 90 days</option>
                          </select>
                        </label>
                        <label className="text-sm">
                          Evidence source
                          <select
                            className="mt-1 block max-w-xs rounded border bg-background p-2"
                            value={trendSource}
                            onChange={(e) => setTrendSource(e.target.value)}
                          >
                            <option value="all">All sources</option>
                            {sources.map((source) => (
                              <option key={source} value={source}>
                                {source}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {filteredSeries.length} matching{" "}
                        {filteredSeries.length === 1 ? "observation" : "observations"} · original
                        units and source provenance retained. Windows are relative to the latest
                        recorded observation, not the current clock.
                      </p>
                      {filteredSeries.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No recorded observations match the selected time window and evidence
                          source.
                        </p>
                      ) : (
                        <MetricChart items={filteredSeries} unit={current.unit} />
                      )}
                      {filteredSeries.length > 0 && (
                        <>
                          {/* P49: stacked cards on phones; full table from the sm breakpoint. */}
                          <ul
                            className="max-h-96 space-y-2 overflow-auto sm:hidden"
                            aria-label="Recorded observations and evidence provenance"
                            data-testid="provenance-cards"
                          >
                            {filteredSeries.map((o) => (
                              <li key={o.id} className="rounded border p-3 text-sm">
                                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                                  <dt className="text-muted-foreground">Observed (UTC)</dt>
                                  <dd>{utcMinute(o.observedAt)}</dd>
                                  <dt className="text-muted-foreground">Value</dt>
                                  <dd>
                                    {o.value} {o.unit}
                                  </dd>
                                  <dt className="text-muted-foreground">Quality</dt>
                                  <dd>{qualityPresentation(o.quality).label}</dd>
                                  <dt className="text-muted-foreground">Source</dt>
                                  <dd className="break-words">
                                    {o.sourceId}
                                    {o.sourceLabel ? ` · ${o.sourceLabel}` : ""}
                                  </dd>
                                  {o.provenance && (
                                    <>
                                      <dt className="text-muted-foreground">Provenance</dt>
                                      <dd>{o.provenance}</dd>
                                    </>
                                  )}
                                </dl>
                              </li>
                            ))}
                          </ul>
                          <div
                            className="hidden max-h-64 overflow-auto rounded border sm:block"
                            data-testid="provenance-table"
                          >
                            <table className="w-full min-w-[36rem] text-left text-xs">
                              <caption className="sr-only">
                                Recorded observations and evidence provenance
                              </caption>
                              <thead>
                                <tr>
                                  <th scope="col" className="p-2 whitespace-nowrap">
                                    Observed (UTC)
                                  </th>
                                  <th scope="col" className="p-2 whitespace-nowrap">
                                    Value
                                  </th>
                                  <th scope="col" className="p-2 whitespace-nowrap">
                                    Quality
                                  </th>
                                  <th scope="col" className="p-2 whitespace-nowrap">
                                    Source
                                  </th>
                                  <th scope="col" className="p-2 whitespace-nowrap">
                                    Provenance
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredSeries.map((o) => (
                                  <tr key={o.id} className="border-t">
                                    <td className="p-2 whitespace-nowrap">{utcMinute(o.observedAt)}</td>
                                    <td className="p-2 whitespace-nowrap">
                                      {o.value} {o.unit}
                                    </td>
                                    <td className="p-2">{qualityPresentation(o.quality).label}</td>
                                    <td className="p-2 break-words">
                                      {o.sourceId}
                                      {o.sourceLabel ? ` · ${o.sourceLabel}` : ""}
                                    </td>
                                    <td className="p-2">{o.provenance ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <details className="text-sm" data-testid="companion-non-chartable">
                <summary>
                  Stored records not charted ({report.nonChartable?.length ?? 0})
                </summary>
                {(report.nonChartable?.length ?? 0) === 0 ? (
                  <p className="mt-2 text-muted-foreground">
                    Every stored record for this mission was charted.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {report.nonChartable!.map((r) => (
                      <li key={r.recordId} className="break-words">
                        {r.metricCode ?? "No metric"}
                        {r.healthDomain ? ` (${r.healthDomain})` : ""} — {r.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </details>
              {report.warnings.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  Evidence caveats: {report.warnings.join(" · ")}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold leading-none tracking-tight">
            4 · Understand the indicators and colors
          </h2>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="space-y-2">
            <li className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-0.5 ${qualityClass.good}`}>Green</span>
              source data marked good quality.
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-0.5 ${qualityClass.degraded}`}>Amber</span>
              degraded quality; review context.
            </li>
            <li className="flex flex-wrap items-center gap-2">
              <span className={`rounded border px-2 py-0.5 ${qualityClass.neutral}`}>Neutral</span>
              poor or unknown quality, or missing evidence.
            </li>
          </ul>
          <p>
            These are <strong>data-quality states, not health-risk categories</strong>.
          </p>
          <p>
            A change between measurements may reflect timing, device, method, workload or biological
            variation. A line chart does not establish a clinical trend or causal relationship.
          </p>
          <p>
            For individual measurement technique, approved thresholds, symptoms or emergency
            actions, use your mission-approved medical protocol and designated medical authority.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              className="inline-flex min-h-11 items-center rounded px-2 py-2 text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              to="/mission/guidance"
            >
              Action Guidance
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded px-2 py-2 text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              to="/mission/intelligence"
            >
              Health Intelligence
            </Link>
            <Link
              className="inline-flex min-h-11 items-center rounded px-2 py-2 text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              to="/mission/validation"
            >
              Validation & limitations
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
