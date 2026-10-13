import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { decideForegroundSync } from '@/domain/offline-mission/autonomy';
import { getOfflineMissionStore } from '@/infrastructure/offline';
import { getCloudMissionContext, syncRecordedMissionQueue } from '@/infrastructure/mission-records';

/** Explicit session-only opt-in: never syncs in the background or without current authorization. */
export function OfflineAutonomy() {
  const [enabled, setEnabled] = useState(false);
  const [detail, setDetail] = useState('Paused — enable foreground sync for this session.');
  const running = useRef(false);
  const lastAttempt = useRef<number | undefined>(undefined);
  const failures = useRef(0);
  const tick = useCallback(async () => {
    if (running.current || typeof document === 'undefined' || !navigator.onLine || document.visibilityState !== 'visible') return;
    running.current = true;
    try {
      const cloud = await getCloudMissionContext();
      const queue = await getOfflineMissionStore().listQueueItems();
      const pending = queue.filter(item => item.state === 'pending' || item.state === 'failed').length;
      const review = queue.filter(item => item.state === 'needs_review' || item.state === 'conflict').length;
      const decision = decideForegroundSync({
        online: navigator.onLine, visible: document.visibilityState === 'visible',
        authenticated: cloud.signedIn && !cloud.error && cloud.memberships.length > 0,
        pending, review, inFlight: false, lastAttemptMs: lastAttempt.current,
        consecutiveFailures: failures.current, nowMs: Date.now(),
      });
      if (!decision.allowed) {
        setDetail(`No automatic transfer: ${decision.reason}. ${review} record(s) require manual review.`);
        return;
      }
      // Recheck visibility and connectivity immediately before network work.
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      lastAttempt.current = Date.now();
      const result = await syncRecordedMissionQueue();
      if (result === 'synced') {
        failures.current = 0;
        setDetail(`Authorized foreground sync completed. ${review} record(s) still require manual review.`);
      } else {
        failures.current += 1;
        setDetail(`Sync withheld: ${result}. Local encrypted records remain intact.`);
      }
    } catch (error) {
      failures.current += 1;
      setDetail(error instanceof Error ? `Sync unavailable: ${error.message}` : 'Sync unavailable; local records retained.');
    } finally {
      running.current = false;
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void tick();
    const timer = window.setInterval(() => void tick(), 15000);
    const onOnline = () => void tick();
    const onVisible = () => { if (document.visibilityState === 'visible') void tick(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, tick]);
  return <Card className="mt-6"><CardHeader><CardTitle>Foreground mission sync · P29</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">Optional session-only retry while this page is visible, online and signed in with active mission access. No background transmission, clinical automation, or automatic conflict resolution.</p>
    <Button variant={enabled ? 'outline' : 'default'} onClick={() => { setEnabled(v => !v); setDetail(enabled ? 'Paused by operator.' : 'Checking local queue and current authorization…'); }}>{enabled ? 'Pause automatic retries' : 'Enable foreground retries'}</Button>
    <p role="status" className="text-sm text-muted-foreground">{detail}</p>
  </CardContent></Card>;
}
