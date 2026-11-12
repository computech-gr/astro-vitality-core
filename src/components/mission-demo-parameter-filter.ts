/** Pure, offline helpers for the mission synthetic demo parameters panel (presentation only). */
import { DOMAIN_LABELS } from "@/domain/health-domains/document-domain-projection";
import type { EvaluatedDemoCatalog } from "@/domain/health-intelligence/synthetic-demo-catalog";

export interface DemoParameterRow {
  key: string;
  demoId: string;
  displayName: string;
  aliases: readonly string[];
  unit: string;
  category: string;
  status: "ACTIVE" | "REVOKED";
}

export function demoParameterRows(
  catalog: Pick<EvaluatedDemoCatalog, "active" | "revoked">,
): DemoParameterRow[] {
  return [
    ...catalog.active.map((e) => ({
      key: `a-${e.demoId}`,
      demoId: e.demoId,
      displayName: e.displayName,
      aliases: e.aliases,
      unit: e.unit,
      category: DOMAIN_LABELS[e.domain],
      status: "ACTIVE" as const,
    })),
    ...catalog.revoked.map((e) => ({
      key: `r-${e.demoId}-${e.activation.activationEventId}`,
      demoId: e.demoId,
      displayName: e.displayName,
      aliases: e.aliases,
      unit: e.unit,
      category: DOMAIN_LABELS[e.domain],
      status: "REVOKED" as const,
    })),
  ];
}

/** Case-insensitive match on name, observed labels, identifier, category or unit. */
export function filterDemoParameters(
  rows: readonly DemoParameterRow[],
  query: string,
): DemoParameterRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((r) =>
    [r.displayName, r.demoId, r.category, r.unit, ...r.aliases].some((v) =>
      v.toLowerCase().includes(q),
    ),
  );
}
