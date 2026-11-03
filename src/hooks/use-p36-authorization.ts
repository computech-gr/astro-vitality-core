/** Mission-scoped, fail-closed loader for the P36 cloud authorization ledger. Late responses from a previous mission are discarded. */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadMissionIdentity } from "@/infrastructure/mission-identity";
import { buildAuthorizationView, type AuthorizationLedgerRow, type AuthorizationView } from "@/domain/health-intelligence/p36-scientific-authorization";
import { listScientificAuthorization } from "@/lib/p36-scientific-authorization.functions";

export interface AuthorityMission {
  missionId: string;
  label: string;
  roles: ("ground_medical" | "researcher")[];
}

export type AuthorizationLoad = "signed_out" | "no_role" | "loading" | "ready" | "migration_required" | "error";

export function useP36Authorization() {
  const [userId, setUserId] = useState<string | null>(null);
  const [missions, setMissions] = useState<AuthorityMission[]>([]);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [view, setView] = useState<AuthorizationView | null>(null);
  const [load, setLoad] = useState<AuthorizationLoad>("loading");
  const [error, setError] = useState("");
  const epoch = useRef(0);

  useEffect(() => {
    let live = true;
    void loadMissionIdentity().then((id) => {
      if (!live) return;
      if (!id.signedIn || id.error || !id.userId) {
        setUserId(null);
        setMissions([]);
        setLoad("signed_out");
        return;
      }
      const byMission = new Map<string, AuthorityMission>();
      for (const m of id.memberships) {
        if (m.role !== "ground_medical" && m.role !== "researcher") continue;
        const cur = byMission.get(m.missionId) ?? { missionId: m.missionId, label: m.missionCode ?? m.missionName ?? m.missionId, roles: [] };
        if (!cur.roles.includes(m.role)) cur.roles.push(m.role);
        byMission.set(m.missionId, cur);
      }
      const list = [...byMission.values()].sort((a, b) => a.label.localeCompare(b.label));
      setUserId(id.userId);
      setMissions(list);
      setMissionId(list.length === 1 ? list[0]!.missionId : null);
      setLoad(list.length ? "ready" : "no_role");
    });
    return () => {
      live = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const current = ++epoch.current;
    if (!missionId) {
      setView(await buildAuthorizationView(null, null));
      return;
    }
    setLoad("loading");
    setError("");
    const res = await listScientificAuthorization({ data: { missionId } }).catch(() => ({ ok: false as const, code: "unavailable" as const, message: "Scientific authorization is temporarily unavailable." }));
    if (current !== epoch.current) return;
    if (!res.ok) {
      setView(await buildAuthorizationView(null, null));
      setLoad(res.code === "migration_required" ? "migration_required" : "error");
      setError(res.message);
      return;
    }
    const v = await buildAuthorizationView(res.rows as AuthorizationLedgerRow[], missionId);
    if (current !== epoch.current) return;
    setView(v);
    setLoad("ready");
  }, [missionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const mission = missions.find((m) => m.missionId === missionId) ?? null;
  return { userId, missions, missionId, setMissionId, mission, view, load, error, reload };
}

