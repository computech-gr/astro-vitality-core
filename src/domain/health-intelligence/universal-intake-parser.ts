/** Local, deterministic candidate extraction; never authorizes storage or infers dates. */
export type Candidate = {label:string;value:string;unit:string;observedAt:string;excerpt:string};
const numeric = /^[-+]?(?:\d+(?:\.\d+)?|\.\d+)$/;
const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
function validDate(value:string) { return iso.test(value) && !Number.isNaN(Date.parse(value)); }
/** RFC4180-style quoted fields, including embedded commas and escaped quotes. */
export function csvCells(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<text.length;i++) { const c=text[i]!;
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
 const first=cells[0]!.map(x=>x.toLowerCase().replace(/^\ufeff/,''));
 const names=['label','variable','metric','metric_id','name'];
 const labelIndex=first.findIndex(x=>names.includes(x));
 const header=labelIndex>=0&&first.includes('value')&&first.includes('unit');
 const positions=header?[labelIndex,first.indexOf('value'),first.indexOf('unit'),first.indexOf('observed_at')]:[0,1,2,3];
 const rows:Candidate[]=[];let skipped=0;
 for(const cellsRow of cells.slice(header?1:0)){
  const [li,vi,ui,ti]=positions;const label=cellsRow[li!]??'',value=cellsRow[vi!]??'',unit=cellsRow[ui!]??'',observedAt=ti!<0?'':(cellsRow[ti!]??'');
  if(!label||!numeric.test(value)||!unit||(observedAt&&!validDate(observedAt))){skipped++;continue;}
  if(rows.length>=max){skipped++;continue;}
  rows.push({label,value,unit,observedAt,excerpt:cellsRow.join(',').slice(0,350)});
 }
 return {rows,skipped};
}
/** Conservative extraction of plain-text table rows with explicit ISO timestamp. */
export function extractTextTableCandidates(text:string,max=200):Candidate[]{
 const out:Candidate[]=[];
 for(const line of text.split(/\r?\n/)){
  if(line.length>500)continue;
  const m=/^\s*([A-Za-z][A-Za-z0-9-]{1,35})\s+([-+]?(?:\d+(?:\.\d+)?|\.\d+))\s+(.+?)\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))(?:\s+.*)?$/.exec(line);
  if(!m||!validDate(m[4]!))continue;
  const unit=m[3]!.trim();if(!unit||/\s{2,}/.test(unit))continue;
  out.push({label:m[1]!,value:m[2]!,unit,observedAt:m[4]!,excerpt:line.slice(0,350)});
  if(out.length>=max)break;
 }
 return out;
}
