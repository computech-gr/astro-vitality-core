import { expect, it } from "bun:test";
import { resolve } from "node:path";

// Resolve the repository root from this file so the contract runs identically in the
// local workspace and on CI runners (e.g. /home/runner/work/<repo>/<repo>). A hard-coded
// absolute checkout path made posix_spawn fail with a misleading "ENOENT ... 'bun'" error
// when that directory did not exist.
const ROOT = resolve(import.meta.dir, "../..");
const src = (path: string) => JSON.stringify(resolve(ROOT, "src", path));

it("all four domain import scopes retain Crew Self binding, Ground Medical roster checks and fail-closed denial", () => {
  // Isolated process prevents module stubs contaminating the full suite.
  // process.execPath is the running Bun binary, so no PATH lookup is required.
  const result = Bun.spawnSync([process.execPath, "--eval", `
    import { mock } from 'bun:test';
    let identity={signedIn:true,userId:'u',memberships:[],error:null}; let roster=[],rosterError=null;
    mock.module(${src("infrastructure/mission-identity.ts")},()=>({loadMissionIdentity:async()=>identity}));
    mock.module(${src("integrations/supabase/client.ts")},()=>({supabase:{from(){const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:roster,error:rosterError}).then(r)}};return q}}}));
    const {authorizeBoneImport}=await import(${src("domain/bone-health/import-authorization.ts")});
    const {MEASUREMENT_PROFILES}=await import(${src("domain/health-measurements/profiles.ts")});
    let checked=0;
    for(const profile of Object.values(MEASUREMENT_PROFILES)){
      const scope={missionId:'m',crewMemberId:'c',dataOrigin:'synthetic',domainId:profile.domainId};
      const deny=async()=>{let denied=false;try{await authorizeBoneImport(scope)}catch{denied=true}if(!denied)throw Error('expected denied');checked++};
      identity.memberships=[{missionId:'m',crewMemberId:'c',role:'crew_self'}];
      if((await authorizeBoneImport(scope)).userId!=='u')throw Error('self failed'); checked++;
      identity.memberships=[{missionId:'m',crewMemberId:'other',role:'crew_self'}];await deny();
      identity.memberships=[{missionId:'other',role:'ground_medical'}];await deny();
      identity.memberships=[{missionId:'m',role:'ground_medical'}];roster=[];await deny();
      roster=[{crew_member_id:'c'}];if((await authorizeBoneImport(scope)).userId!=='u')throw Error('ground failed');checked++;
      rosterError={message:'denied'};await deny();rosterError=null;
      identity.memberships=[{missionId:'m',role:'mission_operator'}];await deny();
      identity.error='unavailable';await deny();identity.error=null;
    }
    console.log(checked);
  `], { cwd: ROOT });
  const stderr = new TextDecoder().decode(result.stderr);
  expect({ exitCode: result.exitCode, stderr: result.exitCode === 0 ? "" : stderr }).toEqual({ exitCode: 0, stderr: "" });
  expect(new TextDecoder().decode(result.stdout).trim()).toBe("32");
});
