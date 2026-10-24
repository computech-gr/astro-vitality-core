import type { UnifiedObservation } from "./observation-envelope";
import { domainReadableObservations } from "./observation-store";
import { HEALTH_DOMAINS, type HealthDomainId } from "@/domain/health-domains/registry";

export const REPORT_DISCLAIMER = "Research-use-only assessment. Not clinically validated. Not a medical diagnosis or treatment recommendation.";
export interface ReportFinding { domain: HealthDomainId; text: string; observationIds: string[]; kind: "fact" | "exploratory" | "limitation" }
export interface HealthHistoryReport {
  missionId: string; crewMemberId: string; generatedAt: string; periodStart: string | null; periodEnd: string | null;
  provenance: "real" | "synthetic"; observations: UnifiedObservation[]; findings: ReportFinding[];
  excluded: { unreviewed: number; erroneous: number; otherProvenance: number }; disclaimer: string;
}
/** Deterministic research narrative. Never invents history, diagnoses, ranges or treatments. */
export function buildHealthHistoryReport(history: readonly UnifiedObservation[], missionId: string, crewMemberId: string, provenance: "real" | "synthetic", generatedAt = new Date().toISOString()): HealthHistoryReport {
  const scoped = history.filter(o => o.missionId === missionId && o.crewMemberId === crewMemberId);
  const readable = domainReadableObservations(scoped).filter(o => o.provenance === provenance && !o.supersedesId);
  const supersededIds = new Set(scoped.filter(o => o.provenance === provenance && o.supersedesId && o.status !== "erroneous").map(o => o.supersedesId!));
  const observations = [...readable.filter(o => !supersededIds.has(o.id)), ...domainReadableObservations(scoped).filter(o => o.provenance === provenance && o.supersedesId && o.status !== "erroneous")].sort((a,b) => a.observedAt.localeCompare(b.observedAt));
  const findings: ReportFinding[] = [];
  for (const domain of HEALTH_DOMAINS) {
    const entries = observations.filter(o => o.domain === domain.id);
    if (!entries.length) { findings.push({domain:domain.id, kind:"limitation", observationIds:[], text:`No reviewer-accepted ${domain.title.toLowerCase()} observations are available in this reporting selection.`}); continue; }
    findings.push({domain:domain.id, kind:"fact", observationIds:entries.map(o=>o.id), text:`${entries.length} reviewer-confirmed ${domain.title.toLowerCase()} observation(s) are available. Reviewer confirmation does not establish scientific validity.`});
    const byMetric = new Map<string, UnifiedObservation[]>();
    for (const o of entries) byMetric.set(o.metricId, [...(byMetric.get(o.metricId) ?? []), o]);
    for (const [metricId, series] of byMetric) {
      if (series.length < 2) continue;
      const first=series[0]!, last=series[series.length-1]!;
      const firstNumber=Number(first.value.replace(",",".")), lastNumber=Number(last.value.replace(",","."));
      if (first.originalUnit !== last.originalUnit || !Number.isFinite(firstNumber) || !Number.isFinite(lastNumber)) {
        findings.push({domain:domain.id,kind:"limitation",observationIds:series.map(o=>o.id),text:`${metricId}: repeated results use incompatible units or non-comparable values; no numerical trend is inferred.`});
        continue;
      }
      const direction=lastNumber > firstNumber ? "higher" : lastNumber < firstNumber ? "lower" : "unchanged";
      findings.push({domain:domain.id,kind:"exploratory",observationIds:[first.id,last.id],text:`${metricId}: latest recorded value (${last.value} ${last.originalUnit}) is ${direction} than earliest (${first.value} ${first.originalUnit}) across ${series.length} records. This is a descriptive comparison only, not a clinical trend, diagnosis, baseline or risk assessment.`});
    }
  }
  findings.push({domain:"bone",kind:"limitation",observationIds:[],text:"Available records do not constitute a complete medical history. Absence of recorded findings must not be interpreted as absence of disease. Scientific review and measurement-method context may be pending."});
  return {missionId,crewMemberId,generatedAt,provenance,observations,findings,periodStart:observations[0]?.observedAt ?? null,periodEnd:observations.at(-1)?.observedAt ?? null,excluded:{unreviewed:scoped.filter(o=>o.reviewState!=="accepted").length,erroneous:scoped.filter(o=>o.status==="erroneous").length,otherProvenance:scoped.filter(o=>o.provenance!==provenance).length},disclaimer:REPORT_DISCLAIMER};
}
export function healthReportPlainText(report: HealthHistoryReport): string {
 const lines=["MITOCHONDRIA — Astronaut Health History & Research Assessment",`Mission: ${report.missionId}`,`Crew member: ${report.crewMemberId}`,`Provenance: ${report.provenance.toUpperCase()}`,`Generated (UTC): ${report.generatedAt}`,`Observation period: ${report.periodStart ?? "No records"} to ${report.periodEnd ?? "No records"}`,report.disclaimer,"", "RESEARCH ASSESSMENT"];
 for(const f of report.findings) lines.push(`[${f.domain.toUpperCase()}] ${f.kind.toUpperCase()}: ${f.text}${f.observationIds.length ? ` [Evidence IDs: ${f.observationIds.join(", ")}]` : ""}`);
 lines.push("","SOURCE OBSERVATIONS");
 for(const o of report.observations) lines.push(`${o.observedAt} | ${o.domain} | ${o.metricId} | ${o.value} ${o.originalUnit} | ${o.source.label} | ${o.id}`);
 lines.push("",`Excluded: ${report.excluded.unreviewed} unreviewed, ${report.excluded.erroneous} erroneous, ${report.excluded.otherProvenance} other-provenance record(s).`);
 return lines.join("\n");
}
