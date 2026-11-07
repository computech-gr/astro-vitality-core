/**
 * Read-only Global Scientific Review panel. Lists only missions the server
 * authorizes for this account (own Researcher missions, or missions whose
 * sharing policy permits an explicitly granted global reviewer). Shows
 * submitted metadata only, with crew pseudonyms; decisions stay on the
 * existing mission-scoped path and nothing here writes or activates anything.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listGlobalReviewMissions, listGlobalReviewSubmissions } from "@/lib/p36-global-review.functions";
import type { GlobalReviewMission, GlobalReviewSubmission } from "@/lib/p36-global-review.server";
import { ALL_MISSIONS, canChooseAllMissions, groupByMissionAndCrew, missionsForSelection } from "@/lib/p36-global-review-view";

const BASIS_LABEL = { mission_researcher: "Mission Researcher", global_scientific_review: "Global scientific review" } as const;

function MissionComboBox({ missions, value, onChange }: { missions: GlobalReviewMission[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const allowAll = canChooseAllMissions(missions);
  const selected = missions.find((m) => m.missionId === value);
  const label = value === ALL_MISSIONS ? "All authorized missions" : selected ? `${selected.missionName} (${selected.missionCode})` : "Choose a mission";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} aria-label="Mission for scientific review" className="w-full justify-between sm:w-[28rem]">
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(28rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search mission name or code…" />
          <CommandList>
            <CommandEmpty>No authorized mission matches.</CommandEmpty>
            <CommandGroup heading="Authorized missions">
              {allowAll ? (
                <CommandItem value="all authorized missions" onSelect={() => { onChange(ALL_MISSIONS); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === ALL_MISSIONS ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  <span className="flex-1">All authorized missions</span>
                  <Badge variant="secondary">{missions.reduce((n, m) => n + m.pendingTermCount, 0)} pending</Badge>
                </CommandItem>
              ) : null}
              {missions.map((m) => (
                <CommandItem key={m.missionId} value={`${m.missionName} ${m.missionCode} ${m.missionId}`} onSelect={() => { onChange(m.missionId); setOpen(false); }}>
                  <Check className={`mr-2 h-4 w-4 ${value === m.missionId ? "opacity-100" : "opacity-0"}`} aria-hidden />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{m.missionName}</span>
                    <span className="text-xs text-muted-foreground">{m.missionCode} · {BASIS_LABEL[m.accessBasis]}</span>
                  </span>
                  <Badge variant="secondary">{m.pendingTermCount} pending</Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function P36GlobalReviewPanel() {
  const listMissions = useServerFn(listGlobalReviewMissions);
  const listSubmissions = useServerFn(listGlobalReviewSubmissions);
  const [missions, setMissions] = useState<GlobalReviewMission[]>([]);
  const [missionState, setMissionState] = useState<"loading" | "ready" | "error">("loading");
  const [missionMessage, setMissionMessage] = useState("");
  const [selection, setSelection] = useState("");
  const [submissions, setSubmissions] = useState<GlobalReviewSubmission[]>([]);
  const [subState, setSubState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [subMessage, setSubMessage] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    let live = true;
    listMissions({ data: { provenance: "synthetic" } })
      .then((r) => {
        if (!live) return;
        if (!r.ok) { setMissionState("error"); setMissionMessage(r.message); return; }
        setMissions(r.missions);
        setMissionState("ready");
        if (r.missions.length === 1 && r.missions[0]) setSelection(r.missions[0].missionId);
      })
      .catch(() => { if (live) { setMissionState("error"); setMissionMessage("Sign in with an authorized Researcher account to view submitted metadata."); } });
    return () => { live = false; };
  }, [listMissions]);

  const load = useCallback(async (value: string) => {
    const mine = ++epoch.current;
    setSubmissions([]);
    const targets = missionsForSelection(missions, value);
    if (!targets.length) { setSubState("idle"); return; }
    setSubState("loading");
    const all: GlobalReviewSubmission[] = [];
    for (const m of targets) {
      const r = await listSubmissions({ data: { missionId: m.missionId, provenance: "synthetic" } }).catch(() => null);
      if (mine !== epoch.current) return;
      if (!r || !r.ok) { setSubState("error"); setSubMessage(r?.message ?? "Submitted metadata could not be read. Nothing is shown."); return; }
      all.push(...r.submissions);
    }
    setSubmissions(all);
    setSubState("ready");
  }, [missions, listSubmissions]);

  useEffect(() => { if (selection) void load(selection); }, [selection, load]);
  const groups = useMemo(() => groupByMissionAndCrew(submissions), [submissions]);
  const totalTerms = groups.reduce((n, g) => n + g.termCount, 0);

  return (
    <section aria-labelledby="p36-global-review-heading" className="space-y-4 rounded-lg border border-border bg-card p-4 text-sm">
      <div className="space-y-1">
        <h2 id="p36-global-review-heading" className="text-lg font-semibold">Submitted metadata across authorized missions</h2>
        <p className="text-muted-foreground">
          Read-only. Synthetic submissions only; crew appear as mission-specific pseudonyms. No measurements, documents or encrypted local evidence are shown,
          and every term stays pending until an independent Researcher decision on its own mission.
        </p>
      </div>

      {missionState === "loading" ? <p role="status" className="text-muted-foreground">Checking which missions this account may review…</p> : null}
      {missionState === "error" ? <p role="status" className="text-muted-foreground">{missionMessage}</p> : null}
      {missionState === "ready" && !missions.length ? (
        <p role="status" className="text-muted-foreground">This account has no mission available for scientific review. No access was broadened.</p>
      ) : null}
      {missionState === "ready" && missions.length ? <MissionComboBox missions={missions} value={selection} onChange={setSelection} /> : null}

      {subState === "loading" ? <p role="status" className="text-muted-foreground">Reading submitted metadata…</p> : null}
      {subState === "error" ? <p role="alert" className="text-destructive">{subMessage}</p> : null}
      {subState === "ready" ? (
        <div className="space-y-4">
          <p role="status" className="font-medium">{submissions.length} submission{submissions.length === 1 ? "" : "s"} · {totalTerms} submitted term{totalTerms === 1 ? "" : "s"}</p>
          {!groups.length ? <p className="text-muted-foreground">No submissions for this selection.</p> : null}
          {groups.map((g) => (
            <article key={g.missionId} className="space-y-3 rounded-md border border-border p-3">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{g.missionName} <span className="text-muted-foreground">({g.missionCode})</span></h3>
                <Badge variant="outline">{g.pendingTermCount} of {g.termCount} pending</Badge>
              </header>
              {g.crews.map((c) => (
                <div key={c.crewPseudonym} className="space-y-2">
                  <p className="font-mono text-xs text-muted-foreground">Crew {c.crewPseudonym} · {c.termCount} terms</p>
                  {c.submissions.map((s) => (
                    <details key={s.submissionId} className="rounded border border-border p-2">
                      <summary className="cursor-pointer">
                        <span className="font-medium">{s.requestId}</span> · {s.terms.length} terms · received {new Date(s.receivedAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                        <span className="block break-all font-mono text-xs text-muted-foreground">receipt SHA-256 {s.payloadSha256} · {BASIS_LABEL[s.accessBasis]}</span>
                      </summary>
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full min-w-[36rem] text-left text-xs">
                          <thead className="text-muted-foreground">
                            <tr><th className="py-1 pr-2">Term</th><th className="py-1 pr-2">Original label</th><th className="py-1 pr-2">Exact unit</th><th className="py-1 pr-2">Classification</th><th className="py-1 pr-2">Candidates</th><th className="py-1">Status</th></tr>
                          </thead>
                          <tbody>
                            {s.terms.map((t) => (
                              <tr key={t.termId} className="border-t border-border">
                                <td className="py-1 pr-2 font-mono">{t.termId}</td>
                                <td className="py-1 pr-2">{t.originalLabels.join(" · ")}</td>
                                <td className="py-1 pr-2">{t.exactUnit}</td>
                                <td className="py-1 pr-2">{t.classification}</td>
                                <td className="py-1 pr-2 font-mono">{t.candidateMetricIds.join(", ") || "—"}</td>
                                <td className="py-1">{t.decision ?? "Pending review"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  ))}
                </div>
              ))}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
