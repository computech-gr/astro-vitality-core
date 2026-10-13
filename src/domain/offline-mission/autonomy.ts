/** P29 conservative foreground-only store-and-forward policy. No clinical autonomy. */
export interface AutonomySnapshot {
  online: boolean;
  visible: boolean;
  authenticated: boolean;
  pending: number;
  review: number;
  inFlight: boolean;
  lastAttemptMs?: number;
  consecutiveFailures: number;
  nowMs: number;
}
export type AutonomyDecision = { allowed: true; reason: 'ready' } | { allowed: false; reason: 'offline' | 'hidden' | 'unauthorized' | 'empty' | 'busy' | 'backoff' };
export function retryDelayMs(failures: number): number {
  return Math.min(300000, 15000 * 2 ** Math.min(5, Math.max(0, Math.floor(failures))));
}
export function decideForegroundSync(s: AutonomySnapshot): AutonomyDecision {
  if (!s.online) return { allowed: false, reason: 'offline' };
  if (!s.visible) return { allowed: false, reason: 'hidden' };
  if (!s.authenticated) return { allowed: false, reason: 'unauthorized' };
  if (s.inFlight) return { allowed: false, reason: 'busy' };
  if (s.pending <= 0) return { allowed: false, reason: 'empty' };
  if (s.lastAttemptMs !== undefined && s.nowMs - s.lastAttemptMs < retryDelayMs(s.consecutiveFailures)) {
    return { allowed: false, reason: 'backoff' };
  }
  return { allowed: true, reason: 'ready' };
}
