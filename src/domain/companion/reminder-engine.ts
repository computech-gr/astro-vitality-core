/** P46 opt-in, foreground-only, user-defined operational reminders.
 * Never represents a medically approved schedule or background delivery guarantee.
 */
export const REMINDER_INTERVAL_MINUTES = [1, 15, 30, 60, 120, 240] as const;
export type ReminderInterval = (typeof REMINDER_INTERVAL_MINUTES)[number];
export type ReminderPlan = { enabled: boolean; intervalMinutes: ReminderInterval; nextDueAt: number };
export function createReminderPlan(now: number, intervalMinutes: ReminderInterval): ReminderPlan {
  return { enabled: true, intervalMinutes, nextDueAt: now + intervalMinutes * 60_000 };
}
export function reminderDue(plan: ReminderPlan | null, now: number): boolean {
  return Boolean(plan?.enabled && Number.isFinite(now) && now >= plan.nextDueAt);
}
export function advanceReminder(plan: ReminderPlan, now: number): ReminderPlan {
  if (!reminderDue(plan, now)) return plan;
  return { ...plan, nextDueAt: now + plan.intervalMinutes * 60_000 };
}
export function reminderText(): string {
  return 'Your optional Daily Health Companion check-in is due. Review the mission-approved routine.';
}
