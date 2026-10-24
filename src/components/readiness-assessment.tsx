import { useEffect, useMemo, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

import {
  ingestDailyBehavioralCheckIn,
  ingestPsychomotorVigilanceResult,
  scorePsychomotorVigilance,
  validateDailyBehavioralCheckIn,
  validateTaskLinkedWorkload,
  type DailyBehavioralCheckIn,
  type ReactionTimeTrial,
  type NasaTlxDimension,
  type NasaTlxRawRatings,
  type TaskLinkedWorkloadCheckIn,
} from "@/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  addVigilanceTrial,
  assessmentElapsedSeconds,
  completeReadinessAssessment,
  createReadinessAssessmentState,
  recordDailyCheckIn,
  recordVigilanceResult,
  recordTaskLinkedWorkload,
} from "@/app/readiness-assessment";
import { persistOfflineMissionEvent } from "@/infrastructure/offline";
import { loadMissionIdentity, subscribeMissionIdentity } from "@/infrastructure/mission-identity";


const DEMO_PROTOCOL = {
  id: "p11-brief-vigilance-demo",
  version: "1.0.0",
  durationSeconds: 60,
  sourceIds: ["SRC-15", "SRC-33"],
} as const;

const KSS_ANCHORS = [
  "extremely alert",
  "very alert",
  "alert",
  "fairly alert",
  "neither alert nor sleepy",
  "some signs of sleepiness",
  "sleepy, but no effort to keep awake",
  "sleepy, some effort to keep awake",
  "very sleepy, great effort to keep awake",
] as const;

function formatSeconds(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export function ReadinessAssessment() {
  const [MISSION, setMission] = useState<{ missionId: string; crewMemberId: string } | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void loadMissionIdentity().then(snapshot => {
      if (!alive) return;
      const member = snapshot.active?.role === "crew_self" ? snapshot.active : snapshot.memberships.find(m => m.role === "crew_self" && m.crewMemberId);
      setMission(member?.crewMemberId ? { missionId: member.missionId, crewMemberId: member.crewMemberId } : null);
    }).catch(() => { if (alive) setMission(null); }); };
    refresh();
    const unsubscribe = subscribeMissionIdentity(refresh);
  return () => { alive = false; unsubscribe(); };
  }, []);
  const [state, setState] = useState(() =>
    createReadinessAssessmentState(new Date().toISOString()),
  );
  const [fatigue, setFatigue] = useState(3);
  const [sleepiness, setSleepiness] = useState("4");
  const [stress, setStress] = useState(3);
  const [recentSleep, setRecentSleep] = useState("7.5");
  const [workRestState, setWorkRestState] =
    useState<NonNullable<DailyBehavioralCheckIn["schedule"]["workRestState"]>>("routine_work");
  const [taskRunning, setTaskRunning] = useState(false);
  const [workloadTaskLabel, setWorkloadTaskLabel] = useState("");
  const [tlx, setTlx] = useState<NasaTlxRawRatings>({
    mental_demand: 50,
    physical_demand: 20,
    temporal_demand: 50,
    performance: 50,
    effort: 50,
    frustration: 20,
  });
  const [stimulusVisible, setStimulusVisible] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(DEMO_PROTOCOL.durationSeconds);
  const stimulusAtRef = useRef<number | null>(null);
  const taskStartRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const progress = state.completedAt
    ? 100
    : state.step === "context"
      ? 10
      : state.step === "check_in"
        ? 30
        : state.step === "vigilance"
          ? 60
          : 90;

  useEffect(
    () => () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  function saveCheckIn() {
    if (!MISSION) return;
    const now = new Date().toISOString();
    const checkIn: DailyBehavioralCheckIn = {
      id: `p11-check-${crypto.randomUUID()}`,
      mission: MISSION,
      recordedAt: now,
      fatigueVas0To10: fatigue,
      sleepinessKss1To9: Number(sleepiness),
      stressVas0To10: stress,
      schedule: {
        workRestState,
        recentSleepHours: Number(recentSleep),
        tags: ["source:p11-readiness-ui", "privacy:crew-health"],
      },
      privateToCrewHealth: true,
    };
    const issues = validateDailyBehavioralCheckIn(checkIn);
    if (issues.length) {
      setState((current) => ({ ...current, issues }));
      return;
    }
    const batch = ingestDailyBehavioralCheckIn(checkIn);
    if (batch.issues.length) {
      setState((current) => ({ ...current, issues: batch.issues }));
      return;
    }
    setState((current) => recordDailyCheckIn({ ...current, issues: [] }, checkIn));
    void persistOfflineMissionEvent({
      kind: "readiness_assessment",
      id: checkIn.id,
      mission: MISSION,
      eventTimestamp: checkIn.recordedAt,
      sourceId: "p11-daily-check-in",
      sourceVersion: "1.0.0",
      sourcePriority: 70,
      classification: "medical_sensitive",
      payload: checkIn,
    }).catch((error) => console.warn("Offline readiness check-in persistence failed", error));
  }

  function scheduleStimulus() {
    const delay = 1200 + Math.floor(Math.random() * 1800);
    timeoutRef.current = window.setTimeout(() => {
      stimulusAtRef.current = performance.now();
      setStimulusVisible(true);
    }, delay);
  }

  function finishVigilance() {
    if (!MISSION) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    setStimulusVisible(false);
    setTaskRunning(false);
    const result = scorePsychomotorVigilance({
      protocolId: DEMO_PROTOCOL.id,
      protocolVersion: DEMO_PROTOCOL.version,
      trials: stateRef.current.trials,
      practiceRunNumber: 1,
    });
    const batch = ingestPsychomotorVigilanceResult({
      id: `p11-pvt-${crypto.randomUUID()}`,
      mission: MISSION,
      recordedAt: new Date().toISOString(),
      result,
      tags: ["protocol-status:demo-only"],
    });
    setState((current) => recordVigilanceResult({ ...current, issues: batch.issues }, result));
    void persistOfflineMissionEvent({
      kind: "readiness_assessment",
      id: `p11-pvt-result-${crypto.randomUUID()}`,
      mission: MISSION,
      eventTimestamp: new Date().toISOString(),
      sourceId: DEMO_PROTOCOL.id,
      sourceVersion: DEMO_PROTOCOL.version,
      sourcePriority: 70,
      classification: "medical_sensitive",
      payload: result,
    }).catch((error) => console.warn("Offline vigilance-result persistence failed", error));
  }

  function startVigilance() {
    if (!MISSION) return;
    setState((current) => ({ ...current, trials: [], issues: [] }));
    setRemainingSeconds(DEMO_PROTOCOL.durationSeconds);
    setTaskRunning(true);
    setStimulusVisible(false);
    taskStartRef.current = performance.now();
    scheduleStimulus();
  }

  useEffect(() => {
    if (!taskRunning) return;
    const interval = window.setInterval(() => {
      if (taskStartRef.current === null) return;
      const elapsedSeconds = (performance.now() - taskStartRef.current) / 1000;
      const remaining = Math.max(0, DEMO_PROTOCOL.durationSeconds - elapsedSeconds);
      setRemainingSeconds(remaining);
      if (remaining <= 0) finishVigilance();
    }, 200);
    return () => window.clearInterval(interval);
  }, [taskRunning]);

  function respondToStimulus() {
    if (!taskRunning) return;
    const responseAt = new Date().toISOString();
    const current = stateRef.current;
    const index = current.trials.length + 1;
    let trial: ReactionTimeTrial;
    if (stimulusVisible && stimulusAtRef.current !== null) {
      trial = {
        index,
        responseAt,
        rawReactionTimeMs: Math.max(0, performance.now() - stimulusAtRef.current),
        falseStart: false,
      };
      stimulusAtRef.current = null;
      setStimulusVisible(false);
      setState((snapshot) => addVigilanceTrial(snapshot, trial));
      scheduleStimulus();
    } else {
      trial = {
        index,
        responseAt,
        falseStart: true,
      };
      setState((snapshot) => addVigilanceTrial(snapshot, trial));
    }
  }

  function saveWorkload() {
    if (!MISSION) return;
    const recordedAt = new Date().toISOString();
    const workload: TaskLinkedWorkloadCheckIn = {
      id: `p11-tlx-${crypto.randomUUID()}`,
      mission: MISSION,
      recordedAt,
      taskLabel: workloadTaskLabel.trim(),
      ratings: tlx,
      privateToCrewHealth: true,
      interpretation: "task_linked_context_only",
    };
    const issues = validateTaskLinkedWorkload(workload);
    if (issues.length) {
      setState((current) => ({ ...current, issues }));
      return;
    }
    setState((current) => recordTaskLinkedWorkload({ ...current, issues: [] }, workload));
    void persistOfflineMissionEvent({
      kind: "readiness_assessment",
      id: workload.id,
      mission: MISSION,
      eventTimestamp: workload.recordedAt,
      sourceId: "p11-task-linked-workload",
      sourceVersion: "1.0.0",
      sourcePriority: 70,
      classification: "medical_sensitive",
      payload: workload,
    }).catch((error) => console.warn("Offline workload persistence failed", error));
  }

  function complete() {
    setState((current) => completeReadinessAssessment(current, new Date().toISOString()));
  }

  const resultSummary = useMemo(() => {
    const result = state.vigilanceResult;
    if (!result) return "No vigilance result yet";
    return `${result.validResponses} valid responses · ${result.falseStarts} false starts · ${
      typeof result.medianReactionTimeMs === "number"
        ? `${Math.round(result.medianReactionTimeMs)} ms median RT`
        : "median RT unavailable"
    }`;
  }, [state.vigilanceResult]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-5xl px-5 py-8 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="section-kicker">Daily readiness flow</p>
            <h1 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">
              Measure performance. <span className="text-primary">Protect interpretation.</span>
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
              A short, privacy-sensitive check-in combining state measures and an objective
              vigilance task. Results are longitudinal context, not a psychiatric diagnosis or an
              autonomous fitness-for-duty decision.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:items-end">
            <Button asChild variant="outline">
              <a href="/mission/live">Live dashboard</a>
            </Button>
            <div className="rounded-lg border border-border bg-card/70 px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Demo target</p>
              <strong className="font-mono text-sm">&lt; 3 MINUTES</strong>
            </div>
          </div>
        </section>

        {!MISSION && (
          <section aria-label="Identity and access status" className="mt-8 rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-semibold">Authorized crew access required</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status">Sign in and select an authorized crew mission before recording readiness assessments. No placeholder records will be created.</p>
            <Button asChild variant="outline" className="mt-4"><a href="/mission/identity">Mission identity &amp; sign-in</a></Button>
          </section>
        )}
        {MISSION && <>
        <h2 id="readiness-flow-heading" className="mt-10 font-display text-2xl font-semibold">
          Daily check-in steps
        </h2>
        <Progress className="mt-5" value={progress} aria-label="Assessment progress" />

        <div aria-labelledby="readiness-flow-heading" className="mt-6 grid gap-5">
          <Card className="border-border bg-card/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="text-primary" />
                Scientific & privacy boundary
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <p>Personal baseline and repeated measures matter more than a single score.</p>
              <p>Mood/psychiatric diagnosis is intentionally not inferred from this flow.</p>
              <p>
                P11 records are encrypted locally by P14 and queued for governed store-and-forward synchronization.
              </p>
            </CardContent>
          </Card>

          {state.step === "context" && (
            <Card className="border-border bg-card/70">
              <CardHeader>
                <CardTitle>1. Schedule context</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 md:grid-cols-2">
                <div>
                  <Label htmlFor="work-rest">Current context</Label>
                  <Select
                    value={workRestState}
                    onValueChange={(value) => setWorkRestState(value as typeof workRestState)}
                  >
                    <SelectTrigger id="work-rest" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rest">Rest</SelectItem>
                      <SelectItem value="routine_work">Routine work</SelectItem>
                      <SelectItem value="critical_task">Critical task</SelectItem>
                      <SelectItem value="exercise">Exercise</SelectItem>
                      <SelectItem value="eva">EVA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="recent-sleep">Recent sleep duration (hours)</Label>
                  <Input
                    id="recent-sleep"
                    type="number"
                    min="0"
                    max="24"
                    step="0.1"
                    className="mt-2"
                    value={recentSleep}
                    onChange={(event) => setRecentSleep(event.target.value)}
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={() => setState((current) => ({ ...current, step: "check_in" }))}>
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {state.step === "check_in" && (
            <Card className="border-border bg-card/70">
              <CardHeader>
                <CardTitle>2. State check-in</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Fatigue/stress use consistent 0–10 state anchors. Sleepiness uses KSS 1–9. Do not
                  reinterpret these as diagnoses.
                </p>
              </CardHeader>
              <CardContent className="space-y-7">
                <div>
                  <div className="flex justify-between">
                    <Label>Fatigue</Label>
                    <span className="font-mono text-sm">{fatigue}/10</span>
                  </div>
                  <Slider
                    className="mt-3"
                    min={0}
                    max={10}
                    step={1}
                    value={[fatigue]}
                    onValueChange={(value) => setFatigue(value[0] ?? 0)}
                  />
                </div>
                <div>
                  <Label htmlFor="sleepiness">Sleepiness (KSS)</Label>
                  <Select value={sleepiness} onValueChange={setSleepiness}>
                    <SelectTrigger id="sleepiness" className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KSS_ANCHORS.map((anchor, index) => (
                        <SelectItem key={index + 1} value={String(index + 1)}>
                          {index + 1} — {anchor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    1 = extremely alert · 9 = extremely sleepy
                  </p>
                </div>
                <div>
                  <div className="flex justify-between">
                    <Label>Current stress</Label>
                    <span className="font-mono text-sm">{stress}/10</span>
                  </div>
                  <Slider
                    className="mt-3"
                    min={0}
                    max={10}
                    step={1}
                    value={[stress]}
                    onValueChange={(value) => setStress(value[0] ?? 0)}
                  />
                </div>
                {state.issues.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                    {state.issues.join(" · ")}
                  </div>
                )}
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setState((current) => ({ ...current, step: "context" }))}
                  >
                    Back
                  </Button>
                  <Button onClick={saveCheckIn}>Save & continue</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {state.step === "vigilance" && (
            <Card className="border-border bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BrainCircuit className="text-primary" />
                  3. Brief vigilance measurement
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  This 60-second protocol is a software demonstration of the PVT measurement path,
                  not a claim that an abbreviated protocol is clinically or operationally validated.
                  A governed mission protocol must define duration and any lapse threshold.
                </p>
              </CardHeader>
              <CardContent>
                {!taskRunning ? (
                  <div className="flex flex-col items-center rounded-lg border border-dashed border-border p-8 text-center">
                    <Clock3 className="size-8 text-primary" />
                    <p className="mt-4 max-w-xl text-sm text-muted-foreground">
                      Start when ready. Respond only when the target appears. Early responses are
                      retained as false starts. No hard-coded lapse threshold is used in this demo.
                    </p>
                    <Button className="mt-5" onClick={startVigilance}>
                      Start 60-second task
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={respondToStimulus}
                    className="flex min-h-72 w-full items-center justify-center rounded-lg border border-border bg-surface/50 p-6 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Vigilance response area"
                  >
                    <div>
                      {stimulusVisible ? (
                        <div
                          className="mx-auto size-24 rounded-full bg-primary shadow-[0_0_50px_hsl(var(--primary)/0.45)]"
                          aria-label="Respond now"
                        />
                      ) : (
                        <p className="font-mono text-sm uppercase tracking-widest text-muted-foreground">
                          Wait for target…
                        </p>
                      )}
                      <p className="mt-8 font-mono text-xs text-muted-foreground">
                        {Math.ceil(remainingSeconds)} seconds remaining
                      </p>
                    </div>
                  </button>
                )}
              </CardContent>
            </Card>
          )}

          {state.step === "review" && (
            <Card className="border-border bg-card/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="text-primary" />
                  4. Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs uppercase text-muted-foreground">Fatigue</p>
                    <strong className="mt-1 block font-mono">
                      {state.checkIn?.fatigueVas0To10 ?? "—"}/10
                    </strong>
                  </div>
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs uppercase text-muted-foreground">Sleepiness KSS</p>
                    <strong className="mt-1 block font-mono">
                      {state.checkIn?.sleepinessKss1To9 ?? "—"}/9
                    </strong>
                  </div>
                  <div className="rounded-md border border-border p-4">
                    <p className="text-xs uppercase text-muted-foreground">Vigilance</p>
                    <strong className="mt-1 block text-sm">{resultSummary}</strong>
                  </div>
                </div>
                <div className="rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">Optional post-task workload</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        NASA-TLX raw dimensions are task-linked context and are not part of the
                        required daily &lt;3-minute flow.
                      </p>
                    </div>
                    {state.workload && (
                      <span className="font-mono text-xs text-primary">RECORDED</span>
                    )}
                  </div>
                  <div className="mt-4">
                    <Label htmlFor="tlx-task">Task / shift label</Label>
                    <Input
                      id="tlx-task"
                      className="mt-2"
                      value={workloadTaskLabel}
                      onChange={(event) => setWorkloadTaskLabel(event.target.value)}
                      placeholder="e.g. docking simulation"
                      maxLength={80}
                    />
                  </div>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    {(
                      [
                        ["mental_demand", "Mental demand"],
                        ["physical_demand", "Physical demand"],
                        ["temporal_demand", "Temporal demand"],
                        ["performance", "Performance"],
                        ["effort", "Effort"],
                        ["frustration", "Frustration"],
                      ] as const
                    ).map(([dimension, label]) => (
                      <div key={dimension}>
                        <div className="flex justify-between">
                          <Label>{label}</Label>
                          <span className="font-mono text-xs">{tlx[dimension]}</span>
                        </div>
                        <Slider
                          className="mt-2"
                          min={0}
                          max={100}
                          step={5}
                          value={[tlx[dimension]]}
                          onValueChange={(value) =>
                            setTlx((current) => ({
                              ...current,
                              [dimension as NasaTlxDimension]: value[0] ?? 0,
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="mt-5" onClick={saveWorkload}>
                    Record task workload
                  </Button>
                </div>
                <p className="text-sm leading-6 text-muted-foreground">
                  No readiness score, psychiatric label, diagnosis or alert is generated. P12 may
                  correlate governed longitudinal features with other signals while preserving
                  uncertainty and evidence.
                </p>
                {!state.completedAt ? (
                  <Button onClick={complete}>Complete assessment</Button>
                ) : (
                  <p className="font-mono text-sm text-primary">
                    Completed in {formatSeconds(assessmentElapsedSeconds(state, state.completedAt))}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        </>}
      </main>
    </div>
  );
}
