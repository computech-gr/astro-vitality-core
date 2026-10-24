/** Browser-safe DTO and canonical byte contract; this module never attests local evidence. */
import type { DraftEvidence } from "./ai-draft-validation";

export const SYNTHETIC_CATALOG_SHA256 =
  "ce2271260428b152778ad67d1cad36306a7913dd3a4442abe3aa11ea65297148";
export const SYNTHETIC_SOURCE_VERSION = "mitochondria.synthetic-fixture.v1";
export interface SyntheticEvidenceSnapshot {
  missionId: string;
  crewMemberId: string;
  canonical: string;
  sha256: string;
  evidence: DraftEvidence[];
}

/** Sorted ASCII keys, no whitespace, explicit nulls. Arrays retain resolver order.
 * Production authority is the SQL resolver's reconstruction, not this helper. */
export function canonicalSyntheticJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalSyntheticJson).join(",")}]`;
  if (typeof value === "object" && value) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalSyntheticJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported canonical evidence value; use exact strings and explicit nulls.");
}

export async function syntheticSha256(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `sha256-${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}