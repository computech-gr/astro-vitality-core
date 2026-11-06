/** Local, deterministic candidate extraction; never authorizes storage or infers dates. */
import { isCalendarDate, isExplicitInstant, type ObservationDatePrecision } from "./observation-date";
export type Candidate = {label:string;value:string;unit:string;observedAt:string;datePrecision?:ObservationDatePrecision;collectionDate?:string;excerpt:string};
export function candidateDate(value:string): Pick<Candidate,"observedAt"|"datePrecision"|"collectionDate"> | null {
 if(!value)return {observedAt:""};
 if(isCalendarDate(value))return {observedAt:value,datePrecision:"date",collectionDate:value};
 if(isExplicitInstant(value))return {observedAt:value,datePrecision:"instant"};
 return null;
}
const numeric = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;
/** RFC4180-style quoted fields, including embedded commas and escaped quotes. */
export function csvCells(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) { const c=(text[i] ?? "");
    if(c==='"') { if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(field.trim());field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field.trim());if(row.some(Boolean))rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(quoted)throw new Error('Unclosed CSV quote');
  row.push(field.trim());if(row.some(Boolean))rows.push(row);
  return rows;
}
export function extractCsvCandidates(text:string,max=200):{rows:Candidate[];skipped:number} {
 const cells=csvCells(text);if(!cells.length)return {rows:[],skipped:0};
 const first=(cells[0] ?? []).map(x=>x.toLowerCase().replace(/^\ufeff/,''));
 const names=['label','variable','metric','metric_id','name'];
 const labelIndex=first.findIndex(x=>names.includes(x));
 const header=labelIndex>=0&&first.includes('value')&&first.includes('unit');
 const collectionIndex=first.findIndex(x=>['collection_date','collectiondate'].includes(x));
 const timeIndex=first.findIndex(x=>['observed_at','observedat'].includes(x));
 const positions=header?[labelIndex,first.indexOf('value'),first.indexOf('unit'),(timeIndex>=0?timeIndex:first.findIndex(x=>['collection_date','collectiondate','date'].includes(x)))]:[0,1,2,3];
 const rows:Candidate[]=[];let skipped=0;
 for(const cellsRow of cells.slice(header?1:0)){
  const [li,vi,ui,ti]=positions;const label=cellsRow[li ?? -1]??'',value=cellsRow[vi ?? -1]??'',unit=cellsRow[ui ?? -1]??'',observedAt=(ti ?? -1)<0?'':(cellsRow[ti ?? -1]??'');
  const collectionDate=collectionIndex>=0?cellsRow[collectionIndex]:undefined;
  const dateFields=candidateDate(observedAt||collectionDate||'');
  if(!label||!numeric.test(value)||!unit||!dateFields||(collectionDate&&!isCalendarDate(collectionDate))){skipped++;continue;}
  if(rows.length>=max){skipped++;continue;}
  rows.push({label,value,unit,...dateFields,...(collectionDate?{collectionDate}:{}),excerpt:cellsRow.join(',').slice(0,350)});
 }
 return {rows,skipped};
}
/** Conservative extraction of plain-text table rows with explicit ISO timestamp. */
export function extractTextTableCandidates(text:string,max=200):Candidate[]{
 const out:Candidate[]=[];
 for(const line of text.split(/\r?\n/)){
  if(line.length>500)continue;
  const m=/^\s*([A-Za-z][A-Za-z0-9-]{1,35})\s+([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s+(.+?)\s+(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?)(?:\s+.*)?$/.exec(line);
  if(!m||!candidateDate((m[4] ?? "")))continue;
  const unit=(m[3] ?? "").trim();if(!unit||/\s{2,}/.test(unit))continue;
  out.push({label:(m[1] ?? ""),value:(m[2] ?? ""),unit,...candidateDate(m[4] ?? ""),observedAt:(m[4] ?? ""),excerpt:line.slice(0,350)});
  if(out.length>=max)break;
 }
 return out;
}

/** P36.7: five-column laboratory PDF text rows, with date-only collection metadata.
 * This never interprets collection date as observation timestamp and never resolves units.
 * Ambiguous or unvalidated source rows remain candidates for human/catalog review.
 */
export function extractFiveColumnLabCandidates(text:string,max=200):Candidate[] {
 const rows:Candidate[]=[];
 const numericValue=/^[-+]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/;
 const date=/^\d{4}-\d{2}-\d{2}$/;
 const flags=/^(?:Review input|Unvalidated)$/i;
 for(const original of text.split(/\r?\n/)) {
  const line=original.trim();
  if(!line||line.length>500||/[<>≤≥]/.test(line))continue;
  // Existing geometry emits pipes; plain tables may use tabs or multiple spaces.
  const cells=line.split(/\s+\|\s+|\t+| {2,}/).map(x=>x.trim()).filter(Boolean);
  if(cells.length<4)continue;
  const dateIndex=cells.findIndex((c,i)=>i>=2&&date.test(c));
  if(dateIndex<3||!isCalendarDate(cells[dateIndex]))continue;
  const valueIndex=cells.findIndex((c,i)=>i>0&&i<dateIndex-1&&numericValue.test(c));
  if(valueIndex<1)continue;
  const label=cells.slice(0,valueIndex).join(' ');
  const unit=cells.slice(valueIndex+1,dateIndex).join(' ').trim();
  const value=cells[valueIndex] ?? '';
  const trailing=cells.slice(dateIndex+1).join(' ');
  if(!/^[\p{L}\p{N}][\p{L}\p{N}\s+()_./β-]{1,100}$/u.test(label)||!/[\p{L}]/u.test(label))continue;
  if(!unit||unit.length>90||/^(?:—|-|N\/?A)$/i.test(unit))continue;
  if(trailing&&!flags.test(trailing))continue;
  if(!Number.isFinite(Number(value.replace(',', '.'))))continue;
  // Date is collection metadata only. Explicit user confirmation is required.
  rows.push({label,value,unit,observedAt:'',datePrecision:'date',collectionDate:cells[dateIndex],excerpt:line.slice(0,350)});
  if(rows.length>=max)break;
 }
 return rows;
}
