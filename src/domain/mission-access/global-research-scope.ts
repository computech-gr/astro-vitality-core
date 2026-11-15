/**
 * P72.6 global Researcher READ scope (browser-safe, pure).
 *
 * The scope comes only from the caller-scoped p726_global_research_scope_v1 RPC, which
 * the database answers from a SQL-provisioned grant row (never an email, a client role
 * or mission membership). It is kept apart from mission memberships so no existing role
 * check (Ground Medical attestation, corrections, imports, catalog activation, operator
 * actions) can treat it as a membership. It is synthetic-only and read-only; the server
 * re-checks every read.
 */
export const GLOBAL_RESEARCH_PROVENANCE = "synthetic" as const;

export interface GlobalResearchCrew {
  crewMemberId: string;
  displayName?: string;
  externalRef?: string;
}
export interface GlobalResearchMission {
  missionId: string;
  code?: string;
  name?: string;
  status?: string;
  crew: GlobalResearchCrew[];
}
export interface GlobalResearchScope {
  granted: true;
  provenance: typeof GLOBAL_RESEARCH_PROVENANCE;
  missions: GlobalResearchMission[];
}

const text = (v: unknown, max = 200): string | undefined =>
  typeof v === "string" && v.trim() && v.length <= max ? v : undefined;

/** Strict parse; anything unexpected (or not granted) yields null, i.e. no global access. */
export function parseGlobalResearchScope(raw: unknown): GlobalResearchScope | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o["granted"] !== true) return null;
  const prov = o["provenance"];
  if (!Array.isArray(prov) || prov.length !== 1 || prov[0] !== GLOBAL_RESEARCH_PROVENANCE) return null;
  if (!Array.isArray(o["missions"])) return null;
  const missions: GlobalResearchMission[] = [];
  const seen = new Set<string>();
  for (const m of o["missions"] as unknown[]) {
    if (!m || typeof m !== "object") return null;
    const r = m as Record<string, unknown>;
    const missionId = text(r["mission_id"], 128);
    if (!missionId || seen.has(missionId) || !Array.isArray(r["crew"])) return null;
    seen.add(missionId);
    const crew: GlobalResearchCrew[] = [];
    const crewSeen = new Set<string>();
    for (const c of r["crew"] as unknown[]) {
      if (!c || typeof c !== "object") return null;
      const cr = c as Record<string, unknown>;
      const crewMemberId = text(cr["crew_member_id"], 128);
      if (!crewMemberId) return null;
      if (crewSeen.has(crewMemberId)) continue;
      crewSeen.add(crewMemberId);
      const displayName = text(cr["display_name"]);
      const externalRef = text(cr["external_ref"]);
      crew.push({ crewMemberId, ...(displayName ? { displayName } : {}), ...(externalRef ? { externalRef } : {}) });
    }
    const code = text(r["code"]);
    const name = text(r["name"]);
    const status = text(r["status"], 40);
    missions.push({ missionId, ...(code ? { code } : {}), ...(name ? { name } : {}), ...(status ? { status } : {}), crew });
  }
  return { granted: true, provenance: GLOBAL_RESEARCH_PROVENANCE, missions };
}

export interface GlobalResearchSelection {
  key: string;
  missionId: string;
  crewMemberId: string;
  missionName: string | null;
  crewDisplayName: string | null;
  label: string;
}

export function missionLabel(m: GlobalResearchMission): string {
  return m.name && m.code ? `${m.code} — ${m.name}` : (m.code ?? m.name ?? m.missionId);
}

/** Every (mission, assigned crew) pair the global read scope covers. */
export function globalResearchSelections(scope: GlobalResearchScope | null | undefined): GlobalResearchSelection[] {
  if (!scope?.granted) return [];
  return scope.missions.flatMap((m) =>
    m.crew.map((c) => ({
      key: `${m.missionId}|${c.crewMemberId}`,
      missionId: m.missionId,
      crewMemberId: c.crewMemberId,
      missionName: m.name ?? m.code ?? null,
      crewDisplayName: c.displayName ?? null,
      label: `${m.name ?? m.code ?? m.missionId} — ${c.displayName ?? c.crewMemberId}`,
    })),
  );
}

/** Read-only, synthetic-only check used by the UI; the server and database decide again. */
export function globalResearchAllows(
  scope: GlobalResearchScope | null | undefined,
  missionId: string,
  crewMemberId: string,
  provenance: string,
): boolean {
  if (!scope?.granted || provenance !== GLOBAL_RESEARCH_PROVENANCE) return false;
  return scope.missions.some((m) => m.missionId === missionId && m.crew.some((c) => c.crewMemberId === crewMemberId));
}

// ---- Selection memory: mission + crew IDs only (no medical data), per account, per tab ----
const SELECTION_PREFIX = "mitochondria.p726.research-selection.";

export function readGlobalResearchSelection(storage: Pick<Storage, "getItem"> | undefined, userId: string | undefined): string {
  if (!storage || !userId) return "";
  try {
    const v = storage.getItem(SELECTION_PREFIX + userId) ?? "";
    return /^[^|]{1,128}\|[^|]{1,128}$/.test(v) ? v : "";
  } catch {
    return "";
  }
}

export function writeGlobalResearchSelection(storage: Pick<Storage, "setItem" | "removeItem"> | undefined, userId: string | undefined, key: string): void {
  if (!storage || !userId) return;
  try {
    if (/^[^|]{1,128}\|[^|]{1,128}$/.test(key)) storage.setItem(SELECTION_PREFIX + userId, key);
    else storage.removeItem(SELECTION_PREFIX + userId);
  } catch {
    // Selection memory is a convenience only.
  }
}

/**
 * Full Health Report export authorization for one scope: an exact crew_self / Ground
 * Medical membership, or the server-verified global Researcher READ scope for synthetic
 * records only.
 */
export function reportScopeAuthorized(
  identity: {
    memberships: readonly { missionId: string; crewMemberId?: string; role: string }[];
    globalResearch?: GlobalResearchScope | undefined;
  },
  scope: { missionId: string; crewMemberId: string },
  provenance: string,
): boolean {
  return (
    identity.memberships.some(
      (m) =>
        m.missionId === scope.missionId &&
        m.crewMemberId === scope.crewMemberId &&
        (m.role === "crew_self" || m.role === "ground_medical"),
    ) || globalResearchAllows(identity.globalResearch, scope.missionId, scope.crewMemberId, provenance)
  );
}

/** This tab's remembered Researcher selection (mission|crew IDs only), or "". */
export function rememberedGlobalResearchSelection(userId: string | undefined): string {
  return readGlobalResearchSelection(typeof window === "undefined" ? undefined : window.sessionStorage, userId);
}
