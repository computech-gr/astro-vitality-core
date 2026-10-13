/**
 * FV-01-11: browser mission selection is bound to the signed-in account.
 * A stored selection from another user (or a signed-out state) is discarded.
 */
export const ACTIVE_MEMBERSHIP_KEY = "mitochondria.active-mission-membership.v2";
export const LEGACY_ACTIVE_MEMBERSHIP_KEYS = ["mitochondria.active-mission-membership.v1"] as const;

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function clearActiveSelection(store: KeyStore): void {
  store.removeItem(ACTIVE_MEMBERSHIP_KEY);
  for (const key of LEGACY_ACTIVE_MEMBERSHIP_KEYS) store.removeItem(key);
}

export function readActiveSelection(store: KeyStore, userId: string | undefined): string | undefined {
  for (const key of LEGACY_ACTIVE_MEMBERSHIP_KEYS) store.removeItem(key);
  const raw = store.getItem(ACTIVE_MEMBERSHIP_KEY);
  if (!raw) return undefined;
  const separator = raw.indexOf("|");
  const owner = separator > 0 ? raw.slice(0, separator) : "";
  if (!userId || owner !== userId) {
    store.removeItem(ACTIVE_MEMBERSHIP_KEY);
    return undefined;
  }
  return raw.slice(separator + 1);
}

export function writeActiveSelection(store: KeyStore, userId: string, membershipKey: string): void {
  store.setItem(ACTIVE_MEMBERSHIP_KEY, `${userId}|${membershipKey}`);
}

/** Auth events that must invalidate a stored selection. */
export function shouldClearSelection(event: string, previousUserId: string | undefined, nextUserId: string | undefined): boolean {
  if (event === "SIGNED_OUT") return true;
  return Boolean(previousUserId && nextUserId && previousUserId !== nextUserId);
}
