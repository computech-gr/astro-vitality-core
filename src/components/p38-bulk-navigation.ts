/**
 * P54: in-page navigation from the Global Scientific Review table to the existing
 * P38 bulk synthetic demo section. Carries only a mission ID and, since P72.8, an
 * optional submission (request) ID used as a display filter; the catalog panel
 * accepts it only when that mission is in its own caller-authorized list.
 */
const EVENT = "mitochondria:open-p38-bulk";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function openBulkDemoDecisions(missionId: string, submissionId?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ missionId: string; submissionId?: string }>(EVENT, {
      detail: { missionId, ...(submissionId ? { submissionId } : {}) },
    }),
  );
}

export function subscribeOpenBulkDemo(cb: (missionId: string, submissionId: string | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (e: Event) => {
    const d = (e as CustomEvent<{ missionId?: unknown; submissionId?: unknown }>).detail;
    const id = d?.missionId;
    const sub = typeof d?.submissionId === "string" && UUID.test(d.submissionId) ? d.submissionId : null;
    if (typeof id === "string" && id) cb(id, sub);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
