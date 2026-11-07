/**
 * Keeps this device's mission-scoped SYNTHETIC DEMO catalogs current: refreshes
 * on sign-in / membership change, when connectivity returns, on focus and every
 * few minutes. Renders nothing. Offline devices keep their last verified snapshot.
 */
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSignedSyntheticDemoSnapshot } from "@/lib/p37-synthetic-demo.functions";
import { loadMissionIdentity, subscribeMissionIdentity } from "@/infrastructure/mission-identity";
import { browserSnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";
import { refreshSyntheticDemoCatalogs } from "@/domain/health-intelligence/synthetic-demo-catalog-sync";

const INTERVAL_MS = 5 * 60_000;

export function SyntheticDemoCatalogAutoRefresh() {
  const fetchSnapshot = useServerFn(getSignedSyntheticDemoSnapshot);
  useEffect(() => {
    let active = true;
    let running = false;
    const run = async () => {
      if (running || !active) return;
      running = true;
      try {
        const storage = browserSnapshotStorage();
        if (!storage || !navigator.onLine) return;
        const identity = await loadMissionIdentity().catch(() => null);
        if (!active || !identity?.signedIn || identity.error) return;
        const missions = identity.memberships.map((m) => m.missionId);
        if (!missions.length) return;
        await refreshSyntheticDemoCatalogs(
          missions,
          (missionId) => fetchSnapshot({ data: { missionId } }),
          { storage, isOnline: () => navigator.onLine },
        );
      } catch (error) {
        console.warn("Synthetic demo catalog refresh failed", error);
      } finally {
        running = false;
      }
    };
    void run();
    const unsubscribe = subscribeMissionIdentity(() => void run());
    const onOnline = () => void run();
    const onVisible = () => {
      if (document.visibilityState === "visible") void run();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void run(), INTERVAL_MS);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [fetchSnapshot]);
  return null;
}
