/** Non-generating organization reporting only. Admin key never leaves server. */
export interface ProviderTotals { month:string; project:string; costMicrousd:number; inputTokens:number; outputTokens:number; requests:number }
export async function readOpenAIOrganizationTotals(key:string, project:string, now:Date, transport:typeof fetch=fetch):Promise<ProviderTotals> {
 if (!/^proj_[A-Za-z0-9_-]+$/.test(project)) throw new Error('Dedicated OpenAI project required');
 const start = Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)/1000;
 const end = Math.floor(now.getTime()/1000);
 const totals:ProviderTotals={month:new Date(start*1000).toISOString().slice(0,10),project,costMicrousd:0,inputTokens:0,outputTokens:0,requests:0};
 for (const kind of ['costs','usage/completions'] as const) {
  let cursor:string|null=null; let complete=false; const seen=new Set<string>();
  for(let page=0;page<40;page++) {
   const url=new URL(`https://api.openai.com/v1/organization/${kind}`);
   url.searchParams.set('start_time',String(start));url.searchParams.set('end_time',String(end));url.searchParams.set('bucket_width','1d');url.searchParams.set('limit','31');url.searchParams.append('project_ids[]',project);url.searchParams.append('group_by[]','project_id');
   if(cursor) url.searchParams.set('page',cursor);
   const response=await transport(url,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});
   if(!response.ok) throw new Error(response.status===401||response.status===403?'OpenAI administrative reporting access denied':'OpenAI reporting unavailable');
   const body=await response.json() as {data?:Array<{start_time?:number;end_time?:number;results?:Array<Record<string,unknown>>}>;has_more?:boolean;next_page?:string|null};
   if(!Array.isArray(body.data)||typeof body.has_more!=='boolean') throw new Error('Invalid provider report');
   for(const bucket of body.data) {
    if(!Array.isArray(bucket.results)) throw new Error('Invalid reporting bucket');
    for(const row of bucket.results) {
     if(row['project_id']!==project) throw new Error('Provider attribution mismatch');
     if(kind==='costs') {
      const amount=row['amount'] as {value?:unknown;currency?:unknown}|undefined;
      if(amount?.currency!=='usd'||typeof amount.value!=='number'||!Number.isFinite(amount.value)||amount.value<0) throw new Error('Invalid recorded USD amount');
      totals.costMicrousd+=Math.ceil(amount.value*1000000);
     } else {
      for(const [field,target] of [['input_tokens','inputTokens'],['output_tokens','outputTokens'],['num_model_requests','requests']] as const) {
       const value=row[field];if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0) throw new Error('Invalid provider usage');
       totals[target]+=value;
      }
     }
    }
   }
   if(!body.has_more){complete=true;break;}
   if(!body.next_page||seen.has(body.next_page))throw new Error('Incomplete provider pagination');
   seen.add(body.next_page);cursor=body.next_page;
  }
  if(!complete)throw new Error('Provider reporting page bound reached; totals withheld');
 }
 if(Object.values(totals).some(v=>typeof v==='number'&&!Number.isSafeInteger(v)))throw new Error('Provider totals exceed safe bounds');
 return totals;
}
