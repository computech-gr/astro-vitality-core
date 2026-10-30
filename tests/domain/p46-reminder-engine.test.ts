import { describe, expect, it } from "bun:test";
import {
  advanceReminder,
  createReminderPlan,
  reminderDue,
  reminderText,
} from "../../src/domain/companion/reminder-engine";
describe("P46 foreground reminders", () => {
  it("does not trigger before the user-selected due time", () => {
    const plan = createReminderPlan(1000, 15);
    expect(reminderDue(plan, 1000)).toBe(false);
    expect(reminderDue(plan, 901000)).toBe(true);
  });
  it("advances after a due reminder without replaying missed intervals", () => {
    const plan = createReminderPlan(1000, 1);
    const next = advanceReminder(plan, 500000);
    expect(next.nextDueAt).toBe(560000);
    expect(reminderDue(next, 500000)).toBe(false);
  });
  it("never creates clinical claims", () => {
    expect(reminderText()).toContain("mission-approved routine");
    expect(reminderDue(null, Date.now())).toBe(false);
  });
});
