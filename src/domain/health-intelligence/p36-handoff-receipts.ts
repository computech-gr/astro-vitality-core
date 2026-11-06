import { getReviewLedgerStore, type ReviewLedgerStore } from "@/infrastructure/offline/review-ledger-store";
import type { HandoffReceipt } from "./p36-cloud-handoff";
import type { ReviewScope } from "./unknown-biomarker-review";
import { canonicalJson } from "./observation-envelope";
import { sha256Hex } from "./p36-scientific-authorization";

export async function appendHandoffReceipt(r: HandoffReceipt, store: ReviewLedgerStore = getReviewLedgerStore()) {
  return store.append({ id: `p36-handoff:${await sha256Hex(canonicalJson(r))}`, ledger: "p36-handoff-receipt", ...r.scope, actorUserId: r.actorUserId, createdAt: r.receivedAt, payload: r });
}
export async function listHandoffReceipts(scope: ReviewScope, actorUserId: string, store: ReviewLedgerStore = getReviewLedgerStore()): Promise<HandoffReceipt[]> {
  const rows = await store.list({ ledger: "p36-handoff-receipt", ...scope });
  return rows.filter((r) => r.actorUserId === actorUserId).map((r) => r.payload as HandoffReceipt).filter((r) => r.actorUserId === actorUserId && canonicalJson(r.scope) === canonicalJson(scope) && ["SUBMITTED", "CONFLICT"].includes(r.status) && /^[0-9a-f]{64}$/.test(r.payloadSha256)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}