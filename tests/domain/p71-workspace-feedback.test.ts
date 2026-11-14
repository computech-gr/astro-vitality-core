import { afterAll, describe, expect, test } from "bun:test";

import { buildP69SeedDocument } from "@/domain/public-demo/catalog";
import { formatDemoExaminationDate, SEED_DATE_NOTE } from "@/domain/public-demo/presentation";
import { canSubmitExamination, checkTransition, type DemoRole } from "@/domain/public-demo/workflow";
import {
  createSingleFlight,
  isRecordConflict,
  recordConflictNotice,
  runWorkspaceAction,
  type DemoActionOutcome,
} from "@/domain/public-demo/workspace-feedback";

describe("P71 stale review feedback", () => {
  test("stale and changed-state refusals are treated as record conflicts; other refusals are not", () => {
    expect(isRecordConflict("stale")).toBe(true);
    expect(isRecordConflict("invalid_state")).toBe(true);
    expect(isRecordConflict("wrong_role")).toBe(false);
    expect(isRecordConflict("unavailable")).toBe(false);
    expect(isRecordConflict(undefined)).toBe(false);
  });

  test("refused medical review says it was not saved and that the latest state was loaded", () => {
    const n = recordConflictNotice("medical_review_recorded", "EXAM-0003", true);
    expect(n.tone).toBe("warning");
    expect(n.text).toContain("EXAM-0003 changed");
    expect(n.text).toContain("Your medical review was not saved");
    expect(n.text).toContain("The latest state has been loaded");
  });

  test("when the latest state cannot be loaded the message says so instead", () => {
    const n = recordConflictNotice("medical_review_recorded", "EXAM-0003", false);
    expect(n.text).toContain("Your medical review was not saved");
    expect(n.text).toContain("could not be loaded");
    expect(n.text).not.toContain("has been loaded");
  });
});

describe("P71 Reset/Restore completion", () => {
  test("restore reports success only after the reload has finished successfully", async () => {
    const order: string[] = [];
    const notice = await runWorkspaceAction({
      kind: "restore",
      epoch: 1,
      perform: async () => {
        order.push("perform");
        return { ok: true };
      },
      reload: async () => {
        order.push("reload");
        return true;
      },
    });
    expect(order).toEqual(["perform", "reload"]);
    expect(notice).toEqual({ tone: "success", text: "Workspace version 1 restored." });
  });

  test("restore with a failed reload is reported as unconfirmed, not as success", async () => {
    const failed = await runWorkspaceAction({ kind: "restore", epoch: 2, perform: async () => ({ ok: true }), reload: async () => false });
    expect(failed.tone).toBe("warning");
    expect(failed.text).toContain("may have succeeded");
    expect(failed.text).toContain("could not be loaded to confirm");
    const thrown = await runWorkspaceAction({
      kind: "restore",
      epoch: 2,
      perform: async () => ({ ok: true }),
      reload: async () => {
        throw new Error("network");
      },
    });
    expect(thrown.tone).toBe("warning");
  });

  test("a refused restore is an error even when the reload works", async () => {
    const n = await runWorkspaceAction({
      kind: "restore",
      epoch: 1,
      perform: async (): Promise<DemoActionOutcome> => ({ ok: false, code: "stale", message: "Someone changed this." }),
      reload: async () => true,
    });
    expect(n.tone).toBe("error");
    expect(n.text).toContain("was not applied");
  });

  test("reset follows the same rule", async () => {
    expect((await runWorkspaceAction({ kind: "reset", perform: async () => ({ ok: true }), reload: async () => true })).tone).toBe("success");
    const unconfirmed = await runWorkspaceAction({ kind: "reset", perform: async () => ({ ok: true }), reload: async () => false });
    expect(unconfirmed.tone).toBe("warning");
    expect(unconfirmed.text).toContain("may have succeeded");
  });

  test("a second restore started while one is in flight is ignored", async () => {
    const flight = createSingleFlight();
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const first = flight.run(async () => {
      calls += 1;
      await gate;
      return "done";
    });
    expect(flight.active).toBe(true);
    const second = await flight.run(async () => {
      calls += 1;
      return "dup";
    });
    expect(second).toEqual({ started: false });
    release();
    expect(await first).toEqual({ started: true, value: "done" });
    expect(calls).toBe(1);
    expect(flight.active).toBe(false);
    expect((await flight.run(async () => "next")).started).toBe(true);
  });
});

describe("P71 seed examination date", () => {
  const originalTz = process.env["TZ"];
  afterAll(() => {
    if (originalTz === undefined) delete process.env["TZ"];
    else process.env["TZ"] = originalTz;
  });

  test("the 15 November date comes from the fixed P63 seed fixture, not from a clock", () => {
    expect(buildP69SeedDocument().examinations[0]?.observedOn).toBe("2026-11-15");
  });

  test("calendar dates display unchanged across UTC/local time zone boundaries", () => {
    for (const tz of ["UTC", "Pacific/Pago_Pago", "America/Los_Angeles", "Europe/Athens", "Pacific/Kiritimati"]) {
      process.env["TZ"] = tz;
      expect(formatDemoExaminationDate({ observedOn: "2026-11-15", submittedRole: "seed" })).toBe(`2026-11-15 (${SEED_DATE_NOTE})`);
      expect(formatDemoExaminationDate({ observedOn: "2026-11-14", submittedRole: "astronaut" })).toBe("2026-11-14");
      expect(formatDemoExaminationDate({ observedOn: "2026-12-31", submittedRole: "medical" })).toBe("2026-12-31");
    }
  });
});

describe("P71 role permissions remain unchanged", () => {
  const base = { currentRevision: 1, expectedRevision: 1, note: "" };
  test("only Astronaut and Medical submit examinations", () => {
    const allowed: Record<DemoRole, boolean> = { astronaut: true, researcher: false, medical: true };
    for (const role of ["astronaut", "researcher", "medical"] as const) expect(canSubmitExamination(role)).toBe(allowed[role]);
  });

  test("only Researcher records a scientific assessment", () => {
    for (const role of ["astronaut", "researcher", "medical"] as const) {
      const r = checkTransition({ ...base, role, action: "scientific_assessment_recorded", currentState: "submitted", outcome: "consistent_with_synthetic_reference" });
      expect(r.ok).toBe(role === "researcher");
    }
  });

  test("only Medical records a medical review, and only after the assessment at the current revision", () => {
    for (const role of ["astronaut", "researcher", "medical"] as const) {
      const r = checkTransition({ ...base, currentRevision: 2, expectedRevision: 2, role, action: "medical_review_recorded", currentState: "scientific_assessment_recorded", outcome: "no_follow_up_needed" });
      expect(r.ok).toBe(role === "medical");
    }
    const stale = checkTransition({ ...base, currentRevision: 3, expectedRevision: 2, role: "medical", action: "medical_review_recorded", currentState: "scientific_assessment_recorded", outcome: "no_follow_up_needed" });
    expect(stale.ok).toBe(false);
    const done = checkTransition({ ...base, currentRevision: 3, expectedRevision: 3, role: "medical", action: "medical_review_recorded", currentState: "medical_review_recorded", outcome: "no_follow_up_needed" });
    expect(done.ok).toBe(false);
  });
});
