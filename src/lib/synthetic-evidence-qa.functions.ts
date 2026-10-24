import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const askSyntheticEvidence = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({question:z.string().max(1000),consent:z.literal(true),provenance:z.literal("synthetic"),missionId:z.string().min(1).max(100),crewMemberId:z.string().min(1).max(100)}).strict().parse(input))
  .handler(async ({data,context})=>{
    // Both flags remain unset in production. No browser can authorize isolation or enablement.
    const {answerSyntheticQuestion}=await import("./synthetic-evidence-qa.server");
    const response=await answerSyntheticQuestion(data,{
      enabled:process.env["MITO_MEDICAL_QA_ISOLATED_ENABLED"]==="true" && process.env["MITO_MEDICAL_TEST_ENVIRONMENT"]==="disposable",
      apiKey:process.env["OPENAI_API_KEY"],model:process.env["MITO_MEDICAL_AI_MODEL"],
      rpc:(name,args)=>context.supabase.rpc(name,args),providerFetch:fetch,now:()=>new Date().toISOString(),
    });
    const body=await response.json() as {error?:string;text?:string;citedIds?:string[];evidence_sha256?:string;generated_at?:string;warning?:string};
    return {status:response.status,...body};
  });