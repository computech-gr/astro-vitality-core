import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  buildSyntheticBatch,
  P48_MAX_BATCH,
  P48_SYNTHETIC_METRICS,
  P48_SYNTHETIC_MISSION_CODE,
  P48_SYNTHETIC_SOURCES,
  SYNTHETIC_QUALITY_LEVELS,
  syntheticScenario,
  type SubmissionCounts,
  type SyntheticReadingInput,
  type SyntheticScope,
} from "@/domain/companion/synthetic-intake";
import {
  getP48SyntheticIntakeStatus,
  submitP48SyntheticReadings,
} from "@/lib/p48-synthetic-intake.functions";

const toLocalInput = (iso: string) => iso.slice(0, 16);
const fromLocalInput = (value: string) => (value ? `${value}:00.000Z` : "");

/**
 * Crew Self-only synthetic reading entry for the dedicated P48 mission. Renders nothing unless
 * the server reports the default-off flag enabled AND the caller eligible for this exact scope.
 * Writes happen only on an explicit, confirmed click; never on mount, sign-in or preview.
 */
export function P48SyntheticIntakePanel({
  scope,
  onSubmitted,
}: {
  scope: SyntheticScope | null;
  onSubmitted: () => void;
}) {
  const key = scope ? `${scope.missionId}|${scope.crewMemberId}` : "";
  const keyRef = useRef(key);
  keyRef.current = key;
  const [eligibleKey, setEligibleKey] = useState("");
  const [rows, setRows] = useState<SyntheticReadingInput[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [counts, setCounts] = useState<SubmissionCounts | null>(null);

  useEffect(() => {
    setEligibleKey("");
    setRows([]);
    setAcknowledged(false);
    setTyped("");
    setMessage("");
    setCounts(null);
    if (!scope) return;
    const requested = key;
    void getP48SyntheticIntakeStatus({ data: scope })
      .then((status) => {
        if (keyRef.current !== requested) return;
        if (status.enabled && status.reason === "eligible") setEligibleKey(requested);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const batch = useMemo(
    () => (scope && rows.length ? buildSyntheticBatch(scope, rows, new Date()) : null),
    [scope, rows],
  );

  if (!scope || eligibleKey !== key) return null;

  const resetConfirmation = () => {
    setAcknowledged(false);
    setTyped("");
  };
  const update = (index: number, patch: Partial<SyntheticReadingInput>) => {
    resetConfirmation();
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const ready =
    batch?.ok === true && acknowledged && typed === P48_SYNTHETIC_MISSION_CODE && !busy;

  const submit = async () => {
    if (!ready) return;
    const requested = key;
    setBusy(true);
    setMessage("Submitting synthetic readings...");
    try {
      const result = await submitP48SyntheticReadings({
        data: {
          scope,
          readings: rows,
          confirmation: {
            irreversible: true,
            typedMissionCode: typed,
            plannedCount: rows.length,
          },
        },
      });
      if (keyRef.current !== requested) return;
      setCounts(result.counts ?? null);
      setMessage(result.ok ? "Synthetic batch processed." : result.message);
      if (result.ok) {
        setRows([]);
        resetConfirmation();
      }
      onSubmitted();
    } catch {
      if (keyRef.current === requested) setMessage("Submission failed; no confirmation received.");
    } finally {
      if (keyRef.current === requested) setBusy(false);
    }
  };

  return (
    <section
      className="space-y-3 rounded border border-dashed border-primary p-4"
      aria-label="Synthetic demonstration readings"
    >
      <h3 className="font-semibold">Synthetic demonstration readings (Crew Self only)</h3>
      <p className="text-sm text-muted-foreground">
        For the dedicated {P48_SYNTHETIC_MISSION_CODE} mission only. Every reading is stored as{" "}
        <strong>synthetic</strong> and permanently: it cannot be edited or deleted. Not a real
        sensor reading, medical record or clinical baseline.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["A", "B"] as const).map((v) => (
          <Button
            key={v}
            type="button"
            variant="outline"
            onClick={() => {
              resetConfirmation();
              setCounts(null);
              setMessage("");
              setRows(syntheticScenario(v, new Date()));
            }}
          >
            Load scenario {v} (6 readings)
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={rows.length >= P48_MAX_BATCH}
          onClick={() => {
            resetConfirmation();
            setRows((prev) => [
              ...prev,
              {
                metricCode: "phys.heart_rate",
                value: 60,
                unit: "bpm",
                observedAt: new Date().toISOString().slice(0, 16) + ":00.000Z",
                source: "alpha",
                quality: "good",
              },
            ]);
          }}
        >
          Add reading
        </Button>
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded border">
          <table className="w-full min-w-[640px] text-left text-xs">
            <caption className="sr-only">Planned synthetic readings for review</caption>
            <thead>
              <tr>
                {["Metric", "Value", "Unit", "Observed (UTC)", "Source", "Quality", ""].map((h) => (
                  <th key={h} scope="col" className="p-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const metric =
                  P48_SYNTHETIC_METRICS[r.metricCode as keyof typeof P48_SYNTHETIC_METRICS];
                return (
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <select
                        aria-label={`Reading ${i + 1} metric`}
                        className="rounded border bg-background p-1"
                        value={r.metricCode}
                        onChange={(e) => {
                          const code = e.target.value as keyof typeof P48_SYNTHETIC_METRICS;
                          update(i, { metricCode: code, unit: P48_SYNTHETIC_METRICS[code].units[0] });
                        }}
                      >
                        {Object.entries(P48_SYNTHETIC_METRICS).map(([code, m]) => (
                          <option key={code} value={code}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Reading ${i + 1} value`}
                        type="number"
                        step="any"
                        className="w-20 rounded border bg-background p-1"
                        value={Number.isFinite(r.value) ? r.value : ""}
                        onChange={(e) =>
                          update(i, { value: e.target.value === "" ? NaN : Number(e.target.value) })
                        }
                      />
                    </td>
                    <td className="p-1">
                      <select
                        aria-label={`Reading ${i + 1} unit`}
                        className="rounded border bg-background p-1"
                        value={r.unit}
                        onChange={(e) => update(i, { unit: e.target.value })}
                      >
                        {(metric?.units ?? []).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Reading ${i + 1} observed time (UTC)`}
                        type="datetime-local"
                        className="rounded border bg-background p-1"
                        value={toLocalInput(r.observedAt)}
                        onChange={(e) => update(i, { observedAt: fromLocalInput(e.target.value) })}
                      />
                    </td>
                    <td className="p-1">
                      <select
                        aria-label={`Reading ${i + 1} source`}
                        className="rounded border bg-background p-1"
                        value={r.source}
                        onChange={(e) => update(i, { source: e.target.value })}
                      >
                        {Object.entries(P48_SYNTHETIC_SOURCES).map(([k, s]) => (
                          <option key={k} value={k}>
                            {s.sourceId}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <select
                        aria-label={`Reading ${i + 1} quality`}
                        className="rounded border bg-background p-1"
                        value={r.quality}
                        onChange={(e) => update(i, { quality: e.target.value })}
                      >
                        {SYNTHETIC_QUALITY_LEVELS.map((q) => (
                          <option key={q} value={q}>
                            {q}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-1">
                      <Button
                        type="button"
                        variant="outline"
                        aria-label={`Remove reading ${i + 1}`}
                        onClick={() => {
                          resetConfirmation();
                          setRows((prev) => prev.filter((_, j) => j !== i));
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {batch && !batch.ok && (
        <ul className="list-disc pl-5 text-sm" role="alert">
          {batch.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {batch?.ok && (
        <div className="space-y-2 rounded border p-3 text-sm">
          <p>
            <strong>Review:</strong> {rows.length} synthetic{" "}
            {rows.length === 1 ? "record" : "records"} → mission {P48_SYNTHETIC_MISSION_CODE},
            crew {scope.crewMemberId}.
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              I reviewed these {rows.length} synthetic records and understand they are permanent
              and cannot be edited or deleted.
            </span>
          </label>
          <label className="block">
            Type {P48_SYNTHETIC_MISSION_CODE} to confirm
            <input
              className="mt-1 block w-full max-w-xs rounded border bg-background p-2"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <Button type="button" disabled={!ready} onClick={() => void submit()}>
            Permanently add {rows.length} synthetic {rows.length === 1 ? "reading" : "readings"}
          </Button>
        </div>
      )}
      {(message || counts) && (
        <p className="text-sm" role="status">
          {message}
          {counts &&
            ` Accepted ${counts.accepted} · duplicate ${counts.duplicate} · conflict ${counts.conflict} · rejected ${counts.rejected} · not sent ${counts.notAttempted}.`}
        </p>
      )}
    </section>
  );
}
