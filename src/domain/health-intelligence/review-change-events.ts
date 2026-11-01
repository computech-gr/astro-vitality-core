/**
 * Local change notification so the report and domain views refresh right after
 * a correction, attestation, revocation or sync — no manual reload. Carries no
 * medical data: only the mission + crew scope that changed. Same-tab via a
 * window event, other tabs via BroadcastChannel (same origin only).
 */
const EVENT = "mitochondria:review-data-changed";
const CHANNEL = "mitochondria-review-data";

export interface ReviewChange {
  missionId: string;
  crewMemberId: string;
}

export function notifyReviewDataChanged(change: ReviewChange): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ReviewChange>(EVENT, { detail: { missionId: change.missionId, crewMemberId: change.crewMemberId } }));
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ missionId: change.missionId, crewMemberId: change.crewMemberId });
    channel.close();
  } catch {
    // BroadcastChannel unavailable: same-tab refresh still works.
  }
}

export function subscribeReviewDataChanged(listener: (change: ReviewChange) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const valid = (x: unknown): x is ReviewChange =>
    !!x && typeof (x as ReviewChange).missionId === "string" && typeof (x as ReviewChange).crewMemberId === "string";
  const onEvent = (e: Event) => {
    const d = (e as CustomEvent<unknown>).detail;
    if (valid(d)) listener(d);
  };
  window.addEventListener(EVENT, onEvent);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (m) => {
      if (valid(m.data)) listener(m.data);
    };
  } catch {
    channel = null;
  }
  return () => {
    window.removeEventListener(EVENT, onEvent);
    channel?.close();
  };
}
