/** Presentation-only inventory. Never supplies classification or scientific authority. */
export interface ReviewTableRow {
  id: string;
  name: string;
  unit: string;
  domain: string;
  candidates: string[];
  evidence: string;
  decision: string;
  activation: string;
  origin: string;
}
export function reviewTablePage(rows: readonly ReviewTableRow[], query: string, domain: string, status: string, evidence: string, page: number, size = 10) {
  const q = query.trim().toLocaleLowerCase();
  const filtered = rows.filter((r) =>
    (!q || [r.name, r.unit, r.id, ...r.candidates].join(" ").toLocaleLowerCase().includes(q)) &&
    (!domain || r.domain === domain) && (!status || r.decision === status) && (!evidence || r.evidence === evidence),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / size));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { rows: filtered.slice(current * size, (current + 1) * size), total: filtered.length, page: current, pages };
}
export function scientificDisplayStatus(status: string): string {
  return status === "PENDING_NIKOLAS_REVIEW" ? "Pending Scientific Review" : status;
}