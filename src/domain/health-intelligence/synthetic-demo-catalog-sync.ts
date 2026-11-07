/**
 * Automatic refresh of mission-scoped SYNTHETIC DEMO catalogs (browser-safe,
 * framework-free). When online, each of the caller's missions is asked for its
 * signed demo snapshot (caller-scoped on the server); only snapshots that verify
 * against the bundled synthetic_demo key, belong to that mission and are newer
 * are installed. Offline or on any failure the device keeps its last verified
 * snapshot, so a revocation reaches a device the next time it is online.
 */
import {
  getInstalledDemoSnapshot,
  installOfferedDemoCatalog,
  type DemoRuntimeOptions,
} from "./synthetic-demo-catalog-runtime";

export type DemoSnapshotFetch = (
  missionId: string,
) => Promise<{ ok: true; signed: unknown } | { ok: false; message: string } | null>;

export interface DemoRefreshOutcome {
  missionId: string;
  outcome: "installed" | "current" | "refused" | "unavailable" | "offline";
  reason: string;
}

export async function refreshSyntheticDemoCatalogs(
  missionIds: readonly string[],
  fetchSnapshot: DemoSnapshotFetch,
  o: DemoRuntimeOptions & { isOnline?: () => boolean },
): Promise<DemoRefreshOutcome[]> {
  const out: DemoRefreshOutcome[] = [];
  for (const missionId of [...new Set(missionIds)].sort()) {
    if (o.isOnline && !o.isOnline()) {
      out.push({
        missionId,
        outcome: "offline",
        reason: "Offline: using the last verified synthetic demo catalog.",
      });
      continue;
    }
    let r: Awaited<ReturnType<DemoSnapshotFetch>> = null;
    try {
      r = await fetchSnapshot(missionId);
    } catch {
      r = null;
    }
    if (!r || !r.ok) {
      out.push({
        missionId,
        outcome: "unavailable",
        reason: r?.message ?? "Synthetic demo catalog unavailable; kept the last verified one.",
      });
      continue;
    }
    const offeredVersion = (r.signed as { snapshot?: { demoCatalogVersion?: unknown } } | null)
      ?.snapshot?.demoCatalogVersion;
    // Missions that never had a demo activation are not stored on the device.
    if (offeredVersion === 0 && !getInstalledDemoSnapshot(missionId)) {
      out.push({
        missionId,
        outcome: "current",
        reason: "No synthetic demo entries for this mission.",
      });
      continue;
    }
    const res = await installOfferedDemoCatalog(r.signed, missionId, o);
    out.push({
      missionId,
      outcome: res.installed ? "installed" : /up to date/.test(res.reason) ? "current" : "refused",
      reason: res.reason,
    });
  }
  return out;
}
