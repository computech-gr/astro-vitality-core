import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import {
  Pause,
  Play,
  RefreshCw,
  Save,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import {
  getResearchAdministration,
  configureResearchPolicy,
  pauseResearchAI,
  synchronizeResearchCosts,
  resolveResearchAttempt,
} from "@/lib/synthetic-research-admin.functions";
import {
  budgetAlerts,
  OPENAI_BILLING_URL,
} from "@/domain/health-intelligence/synthetic-research-policy";
import { operationalRouteHead } from "@/infrastructure/seo";
export const Route = createFileRoute("/mission/ai-administration")({
  head: () =>
    operationalRouteHead({
      path: "/mission/ai-administration",
      title: "Synthetic AI Administration & Usage | Mitochondria",
      description:
        "Owner-authorized synthetic research AI budget, usage, provider reporting and emergency controls.",
    }),
  component: Administration,
});
type View = Awaited<ReturnType<typeof getResearchAdministration>>;
const usd = (value: number | null) =>
  value === null ? "Unavailable" : `USD ${(value / 1000000).toFixed(2)}`;
function Administration() {
  const load = useServerFn(getResearchAdministration),
    configure = useServerFn(configureResearchPolicy),
    pause = useServerFn(pauseResearchAI),
    sync = useServerFn(synchronizeResearchCosts),
    resolve = useServerFn(resolveResearchAttempt);
  const [view, setView] = useState<View | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState("0"),
    [limit, setLimit] = useState("10"),
    [seconds, setSeconds] = useState("1800"),
    [project, setProject] = useState(""),
    [requireSync, setRequireSync] = useState(false),
    [reference, setReference] = useState("");
  const refresh = async () => {
    const v = await load();
    setView(v);
    setBudget(String(v.status.budgetMicrousd / 1000000));
    setLimit(String(v.status.rollingLimit ?? 10));
    setSeconds(String(v.status.rollingSeconds ?? 1800));
    setProject(v.status.providerProject ?? "");
    setRequireSync(v.status.syncRequired ?? false);
  };
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Operation unavailable");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void run(refresh);
  }, []);
  const save = async (enabled: boolean) => {
    if (!view?.status.revision) throw new Error("Policy not provisioned");
    await configure({
      data: {
        enabled,
        budgetUsd: Number(budget),
        rollingLimit: Number(limit),
        rollingSeconds: Number(seconds),
        providerProject: project || null,
        syncRequired: requireSync,
        revision: view.status.revision,
        reference,
      },
    });
    await refresh();
    setMessage(enabled ? "Synthetic research AI resumed." : "Policy saved; AI paused.");
  };
  const s = view?.status;
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-5 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
        <div>
          <p className="text-sm text-muted-foreground">Mitochondria / Owner controls</p>
          <h1 className="mt-2 text-3xl font-semibold">AI Administration & Usage</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Synthetic research only · Clinical review disabled
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void run(refresh)}>
          <RefreshCw size={16} />
          Refresh
        </Button>
      </header>
      {message && (
        <p role="status" className="border-l-2 border-destructive pl-3 text-sm">
          {message}
        </p>
      )}
      {!view && (
        <section className="border-b pb-8">
          <ShieldCheck className="mb-3 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Owner access required</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Administration remains unavailable until the separately approved policy is installed and
            an owner is provisioned.
          </p>
        </section>
      )}
      {s && (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{s.enabled ? "Enabled" : "Paused"}</h2>
              <p className="text-sm text-muted-foreground">
                {s.version} · {s.month.slice(0, 7)} UTC · Application capability{" "}
                {view.configurationEnabled ? "configured" : "off"}
              </p>
            </div>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await pause({ data: { reference: reference || "owner-emergency-pause" } });
                  await refresh();
                  setMessage("Paused. Already permitted requests may still complete and bill.");
                })
              }
            >
              <Pause />
              Emergency pause
            </Button>
          </section>
          <section className="grid gap-6 border-y py-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Monthly internal budget", usd(s.budgetMicrousd)],
              ["Conservative reservations", usd(s.heldMicrousd)],
              ["Recorded provider project costs", usd(s.recordedMicrousd)],
              ["Remaining internal budget", usd(s.remainingMicrousd)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
              </div>
            ))}
          </section>
          {budgetAlerts(s.budgetMicrousd, s.remainingMicrousd).length > 0 && (
            <p role="alert" className="flex gap-2 text-sm text-destructive">
              <AlertTriangle size={18} />
              Budget alerts reached:{" "}
              {budgetAlerts(s.budgetMicrousd, s.remainingMicrousd)
                .map((v) => `${v}%`)
                .join(", ")}
            </p>
          )}
          <section className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Budget & rolling quota</h2>
              <label className="block text-sm">
                Monthly budget (USD)
                <input
                  className="mt-1 w-full rounded border bg-background p-2"
                  type="number"
                  min="0"
                  max="100000"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Requests
                  <input
                    className="mt-1 w-full rounded border bg-background p-2"
                    type="number"
                    min="1"
                    max="10000"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  Rolling period (seconds)
                  <input
                    className="mt-1 w-full rounded border bg-background p-2"
                    type="number"
                    min="60"
                    max="2678400"
                    value={seconds}
                    onChange={(e) => setSeconds(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm">
                Dedicated OpenAI project
                <input
                  className="mt-1 w-full rounded border bg-background p-2"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  disabled={Boolean(s.providerProject)}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requireSync}
                  onChange={(e) => setRequireSync(e.target.checked)}
                />
                Require provider synchronization within one hour
              </label>
              <label className="block text-sm">
                Audit / authorization reference
                <input
                  className="mt-1 w-full rounded border bg-background p-2"
                  maxLength={200}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || !reference} onClick={() => void run(() => save(false))}>
                  <Save />
                  Save paused
                </Button>
                <Button
                  variant="outline"
                  disabled={busy || !reference || Boolean(s.activeAttempt)}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Resume synthetic-only AI with these limits? Already permitted requests may bill after a pause.",
                      )
                    )
                      void run(() => save(true));
                  }}
                >
                  <Play />
                  Resume synthetic AI
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Provider & consumption</h2>
              <dl className="space-y-3 text-sm">
                {[
                  ["Requests", s.attempts],
                  ["Input tokens", s.inputTokens],
                  ["Output tokens", s.outputTokens],
                  ["Failed / unresolved requests", s.failures],
                  ["Last synchronization", s.synchronizedAt ?? "Never"],
                  [
                    "Generation credentials",
                    view.generationCredentialConfigured
                      ? "Configured · availability not measured"
                      : "Not configured",
                  ],
                  [
                    "Administrative reporting",
                    view.adminCredentialConfigured
                      ? "Configured · connectivity requires synchronization"
                      : "Not connected",
                  ],
                  ["Prepaid credit balance", "Balance unavailable — check OpenAI Billing"],
                ].map(([label, value]) => (
                  <div className="flex flex-wrap justify-between gap-2 border-b pb-2" key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="break-all">{value}</dd>
                  </div>
                ))}
              </dl>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const r = await sync();
                    await refresh();
                    setMessage(r.message);
                  })
                }
              >
                <RefreshCw />
                Synchronize provider usage
              </Button>
              <Button asChild variant="outline">
                <a href={OPENAI_BILLING_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink />
                  OpenAI Billing / purchase credits
                </a>
              </Button>
            </div>
          </section>
          {s.activeAttempt && (
            <section className="space-y-3 border-t pt-6">
              <h2 className="text-xl font-semibold">Unresolved request</h2>
              <p className="break-all text-sm">{s.activeAttempt}</p>
              <Button
                variant="outline"
                disabled={busy || s.enabled || reference.length < 10}
                onClick={() => {
                  if (
                    window.confirm(
                      "Close the unresolved request without refunding its hold? Confirm provider settlement separately.",
                    )
                  )
                    void run(async () => {
                      await resolve({ data: { attempt: s.activeAttempt ?? "", reference } });
                      await refresh();
                    });
                }}
              >
                Resolve with hold retained
              </Button>
            </section>
          )}
          <p className="text-sm text-muted-foreground">
            The internal ledger adds irreversible conservative reservations and recorded project
            spend. It is not a prepaid balance or a guaranteed provider cap. In-flight charges,
            external usage and delayed reconciliation may exceed the budget; emergency pause stops
            new permits, not already permitted requests.
          </p>
          <section className="border-t pt-6">
            <h2 className="mb-4 text-xl font-semibold">Recent control audit</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2">UTC</th>
                    <th className="p-2">Action</th>
                    <th className="p-2">Actor</th>
                  </tr>
                </thead>
                <tbody>
                  {view.audit.map((e, i) => (
                    <tr className="border-b" key={`${e.at}-${i}`}>
                      <td className="p-2">{e.at}</td>
                      <td className="p-2">{e.action}</td>
                      <td className="break-all p-2">{e.actor_id ?? "Trusted SQL owner"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
