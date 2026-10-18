import { useState } from "react";
import { createMissionOperation } from "@/infrastructure/mission-operations";
import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";
import { DEMO_APPROVAL_PHRASE, DEMO_MISSION_CODE, DEMO_MISSION_NAME, evaluateDemoMissionActivation } from "@/domain/mission-access/demo-mission-activation";

/** A deliberate owner-triggered Cloud write through the existing audited mission RPC. */
export function GovernedDemoMissionActivation({ identity }: { identity: MissionIdentitySnapshot | null }) {
  const [approval, setApproval] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const memberships = identity?.memberships ?? [];
  const decision = evaluateDemoMissionActivation({
    signedIn: identity?.signedIn === true,
    hasOperatorMembership: memberships.some(m => m.role === "mission_operator"),
    approval, confirmed,
    existingMissionCodes: memberships.map(m => m.missionCode ?? ""),
  });
  const activate = async () => {
    if (!decision.allowed || busy) return;
    setBusy(true);
    setResult("Requesting audited mission creation from backend...");
    try {
      const created = await createMissionOperation({ code: DEMO_MISSION_CODE, name: DEMO_MISSION_NAME });
      setResult(`Created dedicated mission (${created.mission_id}). Reload mission selection to access it. This does not grant Administrator, Crew Self or Ground Medical rights.`);
      setApproval(""); setConfirmed(false);
    } catch (error) {
      setResult(`Backend denied or could not complete mission creation: ${error instanceof Error ? error.message : "unknown error"}. No role override attempted.`);
    } finally { setBusy(false); }
  };
  return <section className="mt-4 rounded-md border border-border p-4" aria-label="Governed synthetic demo mission activation">
    <h3 className="text-sm font-semibold">Dedicated synthetic demo mission — owner-controlled activation</h3>
    <p className="mt-2 text-xs text-muted-foreground">Target: {DEMO_MISSION_CODE}. Creating this mission is a real Cloud write. It uses the existing server-side create_mission_operation RPC, which enforces Mission Operator authorization and records an audit event. It does not change MISSION_TEST, grant Administrator rights or seed health records.</p>
    <label className="mt-3 block text-xs">Type <strong>{DEMO_APPROVAL_PHRASE}</strong> to approve this specific Cloud operation
      <input className="mt-1 block w-full max-w-sm rounded border border-border bg-background p-2 text-sm" value={approval} onChange={event => setApproval(event.target.value)} autoComplete="off" />
    </label>
    <label className="mt-2 flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I explicitly authorize creating one new synthetic demo mission in Lovable Cloud.</label>
    <button type="button" disabled={!decision.allowed || busy} onClick={() => { void activate(); }} className="mt-3 rounded border border-border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Creating..." : "Create dedicated demo mission"}</button>
    <p className="mt-2 text-xs text-muted-foreground">{decision.reason}. No automatic creation occurs when this patch is applied.</p>
    {result && <p role="status" className="mt-2 text-xs">{result}</p>}
  </section>;
}
