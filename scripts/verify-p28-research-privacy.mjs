import { readFileSync, existsSync } from "node:fs";
const files = ["src/domain/research/privacy.ts", "src/components/ground-research-console.tsx", "src/infrastructure/ground-research/repository.ts", "supabase/migrations/20261013000000_p28_research_export_privacy.sql", "tests/domain/p28-research-privacy.test.ts"];
for (const f of files) if (!existsSync(f)) throw new Error(`Missing P28 file: ${f}`);
const sql = readFileSync(files[3],"utf8");
for (const marker of ["count(distinct crew_member_id)","v_crew < 3", "v_bucket < 10", "research_export_suppressed", "revoke all on function public.export_research_mission"]) if (!sql.includes(marker)) throw new Error(`P28 policy missing: ${marker}`);
const repo = readFileSync(files[2],"utf8"); if (!repo.includes("validateResearchAggregate")) throw new Error("Missing client privacy guard");
console.log("P28 research privacy verifier: PASS");
