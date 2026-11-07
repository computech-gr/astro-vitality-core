/**
 * Device-side SYNTHETIC DEMO catalogs: the last verified signed demo snapshot
 * per mission, kept apart from the production active catalog (separate storage
 * key, schema, environment and trusted key). Works offline from storage; only
 * verified, same-mission, newer snapshots are installed.
 */
import { BUNDLED_TRUSTED_KEYS, type TrustedKey } from "./catalog-snapshot-signing";
import {
  evaluateSyntheticDemoSnapshot,
  verifySyntheticDemoSnapshot,
  type EvaluatedDemoCatalog,
  type SignedSyntheticDemoSnapshot,
} from "./synthetic-demo-catalog";
import { canonicalJson } from "./observation-envelope";
import type { SnapshotStorage } from "./active-catalog-runtime";

export const SYNTHETIC_DEMO_STORAGE_KEY = "mitochondria.synthetic-demo-catalog-snapshots.v1";

let catalogs: ReadonlyMap<string, EvaluatedDemoCatalog> = new Map();
let installed = new Map<string, SignedSyntheticDemoSnapshot>();
const listeners = new Set<() => void>();

export const getSyntheticDemoCatalogs = (): ReadonlyMap<string, EvaluatedDemoCatalog> => catalogs;
export const getInstalledDemoSnapshot = (missionId: string) => installed.get(missionId) ?? null;
export function subscribeSyntheticDemoCatalogs(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function apply(next: Map<string, SignedSyntheticDemoSnapshot>) {
  installed = next;
  const m = new Map<string, EvaluatedDemoCatalog>();
  for (const [mission, s] of next) m.set(mission, evaluateSyntheticDemoSnapshot(s.snapshot));
  catalogs = m;
  for (const fn of listeners) fn();
}
export function resetSyntheticDemoCatalogsForTests() {
  apply(new Map());
}

export interface DemoRuntimeOptions {
  storage: SnapshotStorage;
  trustedKeys?: readonly TrustedKey[];
}

/** Load every stored demo snapshot that still verifies (no network needed). */
export async function loadInstalledDemoCatalogs(
  o: DemoRuntimeOptions,
): Promise<{ loaded: number; rejected: number }> {
  const raw = o.storage.get(SYNTHETIC_DEMO_STORAGE_KEY);
  let parsed: Record<string, unknown> = {};
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  const next = new Map<string, SignedSyntheticDemoSnapshot>();
  let rejected = 0;
  for (const [mission, signed] of Object.entries(parsed ?? {})) {
    const v = await verifySyntheticDemoSnapshot(signed, o.trustedKeys ?? BUNDLED_TRUSTED_KEYS);
    if (v.ok && v.snapshot.missionId === mission) next.set(mission, signed as SignedSyntheticDemoSnapshot);
    else rejected++;
  }
  apply(next);
  return { loaded: next.size, rejected };
}

/** Install a downloaded demo snapshot for one mission only if it verifies and is newer. */
export async function installOfferedDemoCatalog(
  offered: unknown,
  missionId: string,
  o: DemoRuntimeOptions,
): Promise<{ installed: boolean; reason: string }> {
  const v = await verifySyntheticDemoSnapshot(offered, o.trustedKeys ?? BUNDLED_TRUSTED_KEYS);
  if (!v.ok) return { installed: false, reason: v.reason };
  if (v.snapshot.missionId !== missionId)
    return { installed: false, reason: "Synthetic demo catalog belongs to another mission; refused." };
  const current = installed.get(missionId);
  if (current) {
    if (v.snapshot.demoCatalogVersion < current.snapshot.demoCatalogVersion)
      return { installed: false, reason: "Offered synthetic demo catalog is older; kept the installed one." };
    if (v.snapshot.demoCatalogVersion === current.snapshot.demoCatalogVersion)
      return canonicalJson(v.snapshot.entries) === canonicalJson(current.snapshot.entries)
        ? { installed: false, reason: "Synthetic demo catalog is already up to date." }
        : { installed: false, reason: "Same synthetic demo version with different content; refused." };
  }
  const next = new Map(installed);
  next.set(missionId, offered as SignedSyntheticDemoSnapshot);
  o.storage.set(SYNTHETIC_DEMO_STORAGE_KEY, JSON.stringify(Object.fromEntries(next)));
  apply(next);
  return {
    installed: true,
    reason: `Synthetic demo catalog version ${v.snapshot.demoCatalogVersion} verified and installed for offline use.`,
  };
}
