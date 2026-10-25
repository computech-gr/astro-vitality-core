import type { SyntheticEvidenceSnapshot } from "./synthetic-evidence";
import { SYNTHETIC_DEMO_QUESTIONS } from "./production-synthetic-demo";
import { exactEvidenceStatement } from "./synthetic-evidence-qa";

export const SYNTHETIC_TAB_CACHE_KEY = "mitochondria:synthetic-qa:v1";
export interface SyntheticTabText {
  question: string;
  answer: string;
  draft: string;
  final: string;
}
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Only exact, authorized fixture facts may enter unencrypted convenience storage. */
export function safeSyntheticText(text: unknown, snapshot: SyntheticEvidenceSnapshot): string {
  if (typeof text !== "string" || text.length > 12000) return "";
  const allowed = new Set(snapshot.evidence.map((o) => `${exactEvidenceStatement(o)} [${o.id}]`));
  return text.split("\n").every((line) => !line.trim() || allowed.has(line.trim())) ? text : "";
}

export function readSyntheticTabState(
  store: Store,
  userId: string,
  snapshot: SyntheticEvidenceSnapshot,
): SyntheticTabText | null {
  try {
    const raw = store.getItem(SYNTHETIC_TAB_CACHE_KEY);
    if (!raw) return null;
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Invalid cache");
    const row = saved as Record<string, unknown>;
    if (row["userId"] !== userId || row["sha256"] !== snapshot.sha256 ||
        row["missionId"] !== snapshot.missionId || row["crewMemberId"] !== snapshot.crewMemberId)
      throw new Error("Stale cache");
    return {
      question: typeof row["question"] === "string" && SYNTHETIC_DEMO_QUESTIONS.some((q) => q === row["question"])
        ? row["question"] : SYNTHETIC_DEMO_QUESTIONS[0],
      answer: safeSyntheticText(row["answer"], snapshot),
      draft: safeSyntheticText(row["draft"], snapshot),
      final: safeSyntheticText(row["final"], snapshot),
    };
  } catch {
    try { store.removeItem(SYNTHETIC_TAB_CACHE_KEY); } catch { /* Storage is optional. */ }
    return null;
  }
}

export function writeSyntheticTabState(
  store: Store,
  userId: string,
  snapshot: SyntheticEvidenceSnapshot,
  text: SyntheticTabText,
): void {
  try {
    store.setItem(SYNTHETIC_TAB_CACHE_KEY, JSON.stringify({
      userId, sha256: snapshot.sha256,
      missionId: snapshot.missionId, crewMemberId: snapshot.crewMemberId,
      question: SYNTHETIC_DEMO_QUESTIONS.some((q) => q === text.question)
        ? text.question : SYNTHETIC_DEMO_QUESTIONS[0],
      answer: safeSyntheticText(text.answer, snapshot),
      draft: safeSyntheticText(text.draft, snapshot),
      final: safeSyntheticText(text.final, snapshot),
    }));
  } catch { /* Storage is optional; never weaken authorization to retain text. */ }
}