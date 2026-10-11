import fs from "node:fs";
const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const transport = read("src/infrastructure/ground-research/supabase-transport.ts");
const bone = read("src/components/bone-health-entry.tsx");
const readiness = read("src/components/readiness-assessment.tsx");
for (const [ok, reason] of [
 [transport.includes('return Promise.all(records.map(async (record)') && transport.includes('message: error.message'), "per-record RPC isolation"],
 [bone.includes('loadMissionIdentity') && bone.includes('authorizedSelection') && !bone.includes('mission-local-p14'), "authorized Bone Health selectors"],
 [readiness.includes('loadMissionIdentity') && !readiness.includes('local-p11-session') && readiness.includes('if (!MISSION) return'), "readiness mission identity guard"],
]) if (!ok) throw new Error(`P23C FAIL: ${reason}`);
console.log("P23C PASS: isolated RPC results and membership-gated Bone Health/readiness sources (static checks only)");
