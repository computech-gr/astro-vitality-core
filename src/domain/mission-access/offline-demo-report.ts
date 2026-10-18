import type { SyntheticDemoDataset, SyntheticDemoDomain } from "@/domain/mission-access/synthetic-demo-dataset";

/** Non-clinical, offline report derived exclusively from the fixed synthetic fixture. */
export type DemoReportMetric = { domain: SyntheticDemoDomain; metric: string; unit: string; points: {day:number; value:number}[]; first:number; last:number; delta:number; direction:"higher"|"lower"|"unchanged" };
export function buildOfflineDemoReport(dataset: SyntheticDemoDataset) {
  if (!dataset.synthetic || !dataset.exportOnly || dataset.importAuthorized || dataset.observations.some(o => o.provenance !== "synthetic_generated" || o.quality !== "illustrative_only" || !Number.isFinite(o.value))) throw new Error("Only verified fictional fixture data may be rendered");
  const groups = new Map<string, DemoReportMetric>();
  for (const o of dataset.observations) {
    const key = `${o.domain}::${o.metric}::${o.unit}`;
    if (!groups.has(key)) groups.set(key, {domain:o.domain, metric:o.metric, unit:o.unit, points:[], first:0,last:0,delta:0,direction:"unchanged"});
    groups.get(key)!.points.push({day:o.day,value:o.value});
  }
  const metrics = [...groups.values()].map(m => {
    m.points.sort((a,b)=>a.day-b.day);
    m.first=m.points[0]?.value ?? 0; m.last=m.points[m.points.length-1]?.value ?? 0;
    m.delta=Number((m.last-m.first).toFixed(5));
    m.direction=m.delta>0?"higher":m.delta<0?"lower":"unchanged";
    return m;
  }).sort((a,b)=>a.domain.localeCompare(b.domain)||a.metric.localeCompare(b.metric));
  return {schema:"mitochondria.offline-synthetic-intelligence-report.v1" as const, missionCode:dataset.missionCode, subjectId:dataset.subjectId, synthetic:true as const, reportMode:"non_clinical_offline_preview" as const, metrics, observationCount:dataset.observations.length, domainCount:new Set(metrics.map(m=>m.domain)).size, timepoints:[...new Set(dataset.observations.map(o=>o.day))].sort((a,b)=>a-b), limitations:[...dataset.limitations,"Differences are arithmetic descriptions of fictional values, not biological trends or clinical conclusions.","No reviewed clinical ranges, diagnoses, alerts, medical advice, or scientific validation.","This report is not a canonical Cloud health record, reviewer decision or administrator authorization."]};
}
export function offlineDemoReportCsv(report:ReturnType<typeof buildOfflineDemoReport>):string {
 const quote=(v:string|number)=>`"${String(v).replaceAll('"','""')}"`;
 return ["domain,metric,unit,day,value,provenance,quality",...report.metrics.flatMap(m=>m.points.map(p=>[m.domain,m.metric,m.unit,p.day,p.value,"synthetic_generated","illustrative_only"].map(quote).join(",")))].join("\n")+"\n";
}
