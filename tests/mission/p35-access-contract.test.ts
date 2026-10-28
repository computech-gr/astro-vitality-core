import { expect, it } from "bun:test";

it("all four domain import scopes retain Crew Self binding, Ground Medical roster checks and fail-closed denial", () => {
  // Isolated process prevents module stubs contaminating the full suite.
  const result = Bun.spawnSync(["bun", "--eval", `
    import { mock } from 'bun:test';
    let identity={signedIn:true,userId:'u',memberships:[],error:null}; let roster=[],rosterError=null;
    mock.module('/dev-server/src/infrastructure/mission-identity.ts',()=>({loadMissionIdentity:async()=>identity}));
    mock.module('/dev-server/src/integrations/supabase/client.ts',()=>({supabase:{from(){const q={select(){return q},eq(){return q},then(r){return Promise.resolve({data:roster,error:rosterError}).then(r)}};return q}}}));
    const {authorizeBoneImport}=await import('/dev-server/src/domain/bone-health/import-authorization.ts');
    const {MEASUREMENT_PROFILES}=await import('/dev-server/src/domain/health-measurements/profiles.ts');
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
  `], { cwd: "/dev-server" });
  expect(result.exitCode).toBe(0);
  expect(new TextDecoder().decode(result.stdout).trim()).toBe("32");
});