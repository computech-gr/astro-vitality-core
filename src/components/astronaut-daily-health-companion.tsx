import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getCloudMissionContext } from "@/infrastructure/mission-records";
import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import type {
  ScientificEvidenceReport,
  ScientificObservation,
} from "@/domain/health-intelligence/live-evidence";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  COMPANION_ENVIRONMENTS,
  COMPANION_ROUTINE,
  chartGeometry,
  participation,
  qualityPresentation,
  type CompanionEnvironment,
} from "@/domain/companion/daily-companion";

type CrewScope = { missionId: string; crewMemberId: string };
const scopeKey = (m: CrewScope) => `${m.missionId}|${m.crewMemberId}`;

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
        {new Date(last.item.observedAt).toLocaleDateString()} · {geometry.points.length} observations
        {geometry.truncated ? " (latest 30 shown)" : ""} · {unit} · range shown is the observed
        minimum/maximum only; no clinical thresholds
      </p>
    </div>
  );
}

export function AstronautDailyHealthCompanion() {
  const [environment, setEnvironment] = useState<CompanionEnvironment>("station");
  const [completed, setCompleted] = useState<string[]>([]);
  const [memberships, setMemberships] = useState<CrewScope[]>([]);
  const [selected, setSelected] = useState("");
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const [status, setStatus] = useState("Checking mission authorization...");
  const [metric, setMetric] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getCloudMissionContext()
      .then((ctx) => {
        if (cancelled) return;
        const allowed = ctx.memberships
          .filter(
            (m): m is typeof m & { crewMemberId: string } =>
              m.role === "crew_self" && Boolean(m.crewMemberId),
          )
          .map((m) => ({ missionId: m.missionId, crewMemberId: m.crewMemberId }));
        setMemberships(allowed);
        setSelected(allowed.length ? scopeKey(allowed[0]!) : "");
        if (!allowed.length)
          setStatus(
            ctx.signedIn
              ? "No authorized Crew Self mission context. Private health data is unavailable."
              : "Sign in as the assigned Crew Self member to view your own health trends.",
          );
      })
      .catch(() => {
        if (!cancelled) setStatus("Mission authorization unavailable; no private data loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const membership = memberships.find((m) => scopeKey(m) === selected);
    if (!membership) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setReport(null);
    setStatus("Loading authorized read-only evidence...");
    void loadCrewScientificEvidence(membership.missionId, membership.crewMemberId)
      .then((result) => {
        if (cancelled) return;
        setReport(result.report);
        const firstMetric = result.report?.metrics[0];
        setMetric(firstMetric ? `${firstMetric.metricCode}|${firstMetric.unit}` : "");
        setStatus(
          result.reason ?? (result.report ? "Read-only evidence loaded." : "No eligible evidence."),
        );
      })
      .catch(() => {
        if (!cancelled) setStatus("Evidence unavailable; no interpretation performed.");
      });
    return () => {
      cancelled = true;
    };
  }, [memberships, selected]);

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
          <CardTitle>1 · Mission environment</CardTitle>
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
          <CardTitle>2 · Daily routine & reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Suggested checklist only. No automated notifications or medically prescribed
            frequencies. Completion is kept in memory for this page session; nothing is saved to the
            medical record.
          </p>
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
                <Link className="mt-2 inline-block text-sm text-primary underline" to={item.href}>
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
              <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
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
          <CardTitle>3 · Dynamic health trends</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" data-testid="trend-status">
            {status}
          </p>
          {memberships.length > 1 && (
            <label className="block text-sm">
              Authorized crew mission
              <select
                className="mt-1 block w-full max-w-xl rounded border bg-background p-2"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {memberships.map((m) => (
                  <option key={scopeKey(m)} value={scopeKey(m)}>
                    {m.missionId} · {m.crewMemberId}
                  </option>
                ))}
              </select>
            </label>
          )}
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
                    onChange={(e) => setMetric(e.target.value)}
                    className="w-full max-w-xl rounded border bg-background p-2"
                  >
                    {report.metrics.map((m) => (
                      <option key={`${m.metricCode}|${m.unit}`} value={`${m.metricCode}|${m.unit}`}>
                        {m.metricCode} · {m.unit} · {m.count} samples
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
                      <MetricChart items={series} unit={current.unit} />
                    </>
                  )}
                </>
              )}
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
          <CardTitle>4 · Understand the indicators and colors</CardTitle>
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
            For individual measurement technique, approved thresholds, symptoms or emergency actions,
            use your mission-approved medical protocol and designated medical authority.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link className="text-primary underline" to="/mission/guidance">
              Action Guidance
            </Link>
            <Link className="text-primary underline" to="/mission/intelligence">
              Health Intelligence
            </Link>
            <Link className="text-primary underline" to="/mission/validation">
              Validation & limitations
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
