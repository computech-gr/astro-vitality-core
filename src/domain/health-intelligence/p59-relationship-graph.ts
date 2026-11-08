/**
 * P59 — dynamic cross-domain relationship graph (pure, deterministic).
 * Nodes appear only for markers actually present; established edges only when both ends are present;
 * co-occurrence edges only when both ends changed or were flagged in the same period; hypotheses only
 * when their recorded-data trigger holds. Never draws a causal arrow for co-occurrence.
 */
import modelJson from "../../../data/scientific/p59-relationship-model.v1.json";

export type EdgeClass = "ESTABLISHED_MECHANISM" | "OBSERVED_CO_OCCURRENCE" | "HYPOTHESIS";
export interface SeriesFact {
  metricId: string;
  /** Last-minus-first sign over the period; null for a single observation. */
  direction: "up" | "down" | "flat" | null;
  /** Changed or flagged by review / data-quality / classification. */
  notable: boolean;
  /** First and last examination days (ISO) used for the same-interval trigger. */
  interval: [string, string] | null;
}
export interface GraphNode { id: string; label: string; domain: string; markers: string[]; notable: boolean }
export interface GraphEdge { id: string; from: string; to: string; cls: EdgeClass; label: string; style: "solid-arrow" | "dashed" | "dashed-labelled"; sources: string[]; referencePending: boolean }

interface Model {
  schema: string;
  nodes: { id: string; label: string; domain: string; markers: string[] }[];
  aliases: { map: Record<string, string> };
  edges: { id: string; from: string; to: string; class: EdgeClass; label: string; sources: string[]; referencePending?: boolean; contextOnly?: boolean; trigger?: { allIncrease: string[]; sameInterval: boolean } }[];
  unsupported: string[];
}

export function relationshipGraph(facts: readonly SeriesFact[], raw: unknown = modelJson): { nodes: GraphNode[]; edges: GraphEdge[]; unsupported: string[] } {
  const m = raw as Model;
  if (!m || m.schema !== "mitochondria.p59-relationship-model.v1") return { nodes: [], edges: [], unsupported: [] };
  const nodeOf = (id: string) => m.nodes.find((n) => n.markers.includes(id))?.id ?? m.aliases.map[id] ?? null;
  const present = new Map<string, GraphNode>();
  for (const f of facts) {
    const nid = nodeOf(f.metricId);
    if (!nid) continue;
    const def = m.nodes.find((n) => n.id === nid)!;
    const cur = present.get(nid) ?? { id: nid, label: def.label, domain: def.domain, markers: [], notable: false };
    cur.markers.push(f.metricId);
    cur.notable ||= f.notable;
    present.set(nid, cur);
  }
  const edges: GraphEdge[] = [];
  for (const e of m.edges) {
    if (e.contextOnly) continue;
    const a = present.get(e.from), b = present.get(e.to);
    if (!a || !b) continue;
    if (e.class === "ESTABLISHED_MECHANISM") {
      edges.push({ id: e.id, from: e.from, to: e.to, cls: e.class, label: e.label, style: "solid-arrow", sources: e.sources, referencePending: Boolean(e.referencePending) || !e.sources.length });
    } else if (e.class === "OBSERVED_CO_OCCURRENCE") {
      if (a.notable && b.notable) edges.push({ id: e.id, from: e.from, to: e.to, cls: e.class, label: e.label, style: "dashed", sources: [], referencePending: false });
    } else if (e.class === "HYPOTHESIS" && e.trigger) {
      const fs = e.trigger.allIncrease.map((id) => facts.find((f) => f.metricId === id));
      const ok = fs.every((f) => f && f.direction === "up") && (!e.trigger.sameInterval || new Set(fs.map((f) => JSON.stringify(f!.interval))).size === 1);
      if (ok) edges.push({ id: e.id, from: e.from, to: e.to, cls: e.class, label: e.label, style: "dashed-labelled", sources: [], referencePending: false });
    }
  }
  return { nodes: [...present.values()].sort((x, y) => x.id.localeCompare(y.id)), edges, unsupported: m.unsupported };
}
