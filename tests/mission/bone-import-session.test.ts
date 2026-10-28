import { expect, test } from "bun:test";
import { retainBoneImport, restoreBoneImport, BONE_IMPORT_SESSION_KEY } from "@/domain/bone-health/import-session";
import type { QueueItem } from "@/domain/bone-health/file-queue";
const scope = { userId: "u", missionId: "m", crewMemberId: "c", dataOrigin: "synthetic" as const };
const memory = () => { const values = new Map<string,string>(); return { getItem: (k:string) => values.get(k) ?? null, setItem: (k:string,v:string) => {values.set(k,v);}, removeItem: (k:string) => {values.delete(k);} }; };
const item: QueueItem = { id:"file",name:"synthetic.csv",kind:"CSV",file:new File(["original bytes"],"synthetic.csv"),status:"review",detail:"ready",review:{text:"synthetic extracted text",method:"CSV parsing",errors:[],rows:[{id:"stable",variableId:"bone-001",value:12,unit:"custom-unit",observedAt:"2026-10-28T08:13:00Z",sourceLabel:"Synthetic lab",specimen:"",assayMethod:"",notes:"Synthetic edit",selected:true,saved:true}]} };
test("synthetic remount restores bounded edits and saved receipts, never files or checked review", () => {
 const storage=memory(); retainBoneImport(storage,scope,[item]); const raw=storage.getItem(BONE_IMPORT_SESSION_KEY) ?? "";
 expect(raw).not.toContain("original bytes"); expect(raw).not.toContain('"selected"'); expect(raw).not.toContain('"file":');
 const restored=restoreBoneImport(storage,scope); expect(restored[0]?.file).toBeUndefined(); expect(restored[0]?.detail).toBe("Re-select original file to reprocess"); expect(restored[0]?.review?.rows[0]?.notes).toBe("Synthetic edit"); expect(restored[0]?.review?.rows[0]?.selected).toBe(false); expect(restored[0]?.review?.rows[0]?.saved).toBe(true);
});
test("real provenance is never retained", () => { const s=memory(); retainBoneImport(s,{...scope,dataOrigin:"real"},[item]); expect(s.getItem(BONE_IMPORT_SESSION_KEY)).toBeNull(); });
test.each(["userId","missionId","crewMemberId","dataOrigin"] as const)("scope change clears %s", key => { const s=memory();retainBoneImport(s,scope,[item]);expect(restoreBoneImport(s,{...scope,[key]:key==="dataOrigin"?"real":"other"})).toEqual([]);expect(s.getItem(BONE_IMPORT_SESSION_KEY)).toBeNull(); });
test("oversized extracted text is not retained", () => {const s=memory();retainBoneImport(s,scope,[{...item,review:{...item.review as NonNullable<QueueItem["review"]>,text:"x".repeat(500001)}}]);expect(s.getItem(BONE_IMPORT_SESSION_KEY)).toBeNull();});
test("interrupted processing restores metadata as unavailable, not a loaded file", () => {const s=memory();retainBoneImport(s,scope,[{...item,status:"processing",review:undefined}]);expect(restoreBoneImport(s,scope)[0]?.status).toBe("error");});
test("explicit removal persists an empty queue", () => {const s=memory();retainBoneImport(s,scope,[item]);retainBoneImport(s,scope,[]);expect(restoreBoneImport(s,scope)).toEqual([]);});