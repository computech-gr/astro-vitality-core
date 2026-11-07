/**
 * P54: in-page navigation from the Global Scientific Review table to the existing
 * P38 bulk synthetic demo section. Carries only a mission ID; the catalog panel
 * accepts it only when that mission is in its own caller-authorized list.
 */
const EVENT = "mitochondria:open-p38-bulk";

export function openBulkDemoDecisions(missionId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ missionId: string }>(EVENT, { detail: { missionId } }));
}

export function subscribeOpenBulkDemo(cb: (missionId: string) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const id = (e as CustomEvent<{ missionId?: unknown }>).detail?.missionId;
    if (typeof id === "string" && id) cb(id);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
