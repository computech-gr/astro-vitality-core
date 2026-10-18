import { buildFinalDemoReadiness, buildFinalHandoff } from "@/domain/mission-access/final-demo-readiness";
import type { MissionIdentitySnapshot } from "@/infrastructure/mission-identity";

/** Transparent completion matrix: never automatically marks privileged gates complete. */
export function FinalDemoHandoff({ identity, missionCode }: { identity: MissionIdentitySnapshot | null; missionCode: string }) {
  const gates = buildFinalDemoReadiness(identity, missionCode);
  const download = () => {
    const payload = JSON.stringify(buildFinalHandoff(identity, missionCode), null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mitochondria-final-handoff-${missionCode.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return <section className="mt-4 rounded-md border border-border p-4" aria-label="Final NASA demo readiness and handoff">
    <h3 className="text-base font-semibold">Final integrated demo — governed acceptance</h3>
    <p className="mt-2 text-xs text-muted-foreground">One consolidated checklist for identity, isolated mission, scientific domains, documents, devices, reporting and independent acceptance. This is not an Administrator grant, a medical decision or a release authorization.</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{gates.map(gate => <article key={gate.id} className="rounded border border-border p-3 text-xs"><h4 className="font-semibold">{gate.label}</h4><p className="mt-1">{gate.state.replaceAll("_", " ")}</p><p className="mt-1 text-muted-foreground">{gate.evidence}</p></article>)}</div>
    <button type="button" onClick={download} className="mt-3 rounded border border-border px-3 py-2 text-xs">Export final acceptance handoff (local JSON)</button>
    <p className="mt-2 text-xs text-muted-foreground">Never import this planning file as authorization evidence. No server writes. MISSION_TEST remains reserved. Administrator, Ground Medical and independent scientific review require separate verified authority.</p>
  </section>;
}
