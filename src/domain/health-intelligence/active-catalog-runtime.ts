/**
 * Device-side active catalog: the last verified signed snapshot, used by every
 * classification path (intake, uploaded results, stored-record review, sync)
 * online or offline. Only a verified snapshot is ever installed; there is no
 * local activation path. Storage is injectable (localStorage in the browser,
 * in-memory in tests); the snapshot holds catalog definitions only, never
 * observations or medical values.
 */
import {
  EMPTY_CATALOG, evaluateCatalogSnapshot, type CatalogEnvironment, type EvaluatedCatalog,
} from "./catalog-lifecycle";
import {
  BUNDLED_TRUSTED_KEYS, decideSnapshotInstall, verifySignedCatalogSnapshot,
  type SignedCatalogSnapshot, type TrustedKey,
} from "./catalog-snapshot-signing";

export const ACTIVE_CATALOG_STORAGE_KEY = "mitochondria.active-catalog-snapshot.v1";
export interface SnapshotStorage { get(key: string): string | null; set(key: string, value: string): void }

let current: EvaluatedCatalog = EMPTY_CATALOG;
let installed: SignedCatalogSnapshot | null = null;
const listeners = new Set<() => void>();

export const getActiveCatalog = (): EvaluatedCatalog => current;
export const getInstalledSnapshot = (): SignedCatalogSnapshot | null => installed;
export function subscribeActiveCatalog(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }
function apply(s: SignedCatalogSnapshot | null) {
  installed = s;
  current = s ? evaluateCatalogSnapshot(s.snapshot) : EMPTY_CATALOG;
  for (const fn of listeners) fn();
}
/** Test hook: clears the in-memory catalog (never touches storage). */
export function resetActiveCatalogForTests() { apply(null); }

export interface RuntimeOptions { storage: SnapshotStorage; trustedKeys?: readonly TrustedKey[]; environments?: readonly CatalogEnvironment[] }

/** Load the last verified snapshot from device storage (works with no network). */
export async function loadInstalledCatalog(o: RuntimeOptions): Promise<{ loaded: boolean; reason: string }> {
  const raw = o.storage.get(ACTIVE_CATALOG_STORAGE_KEY);
  if (!raw) { apply(null); return { loaded: false, reason: "No synchronized catalog on this device; the bundled catalog is used." }; }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { apply(null); return { loaded: false, reason: "Stored catalog is unreadable; the bundled catalog is used." }; }
  const v = await verifySignedCatalogSnapshot(parsed, o.trustedKeys ?? BUNDLED_TRUSTED_KEYS, o.environments ?? ["production"]);
  if (!v.ok) { apply(null); return { loaded: false, reason: `Stored catalog rejected: ${v.reason}` }; }
  apply(parsed as SignedCatalogSnapshot);
  return { loaded: true, reason: `Verified catalog version ${v.snapshot.catalogVersion} loaded.` };
}

/** Install a downloaded snapshot only if it verifies and is newer; otherwise keep the last verified one. */
export async function installOfferedCatalog(offered: unknown, o: RuntimeOptions): Promise<{ installed: boolean; reason: string }> {
  const d = await decideSnapshotInstall(installed, offered, o.trustedKeys ?? BUNDLED_TRUSTED_KEYS, o.environments ?? ["production"]);
  if (d.action === "keep") return { installed: false, reason: d.reason };
  o.storage.set(ACTIVE_CATALOG_STORAGE_KEY, JSON.stringify(d.snapshot));
  apply(d.snapshot);
  return { installed: true, reason: `Catalog version ${d.snapshot.snapshot.catalogVersion} verified and installed for offline use.` };
}

export function browserSnapshotStorage(): SnapshotStorage | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  return { get: (k) => window.localStorage.getItem(k), set: (k, v) => window.localStorage.setItem(k, v) };
}
