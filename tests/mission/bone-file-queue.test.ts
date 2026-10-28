import { describe, expect, test } from "bun:test";
import { BoneFileQueue, boneFileIssue, processBoneFile, reviewedBoneEntries, duplicateBoneImportIds, persistReviewedBoneEntries, MAX_BONE_FILES, type FileReview, type ReviewRow } from "@/domain/bone-health/file-queue";
const csv = "variable,value,unit,observed_at,source\nbone-001,12,custom-unit,2026-10-28T07:18:00Z,Reported lab";
const result: FileReview = {rows:[],errors:[],text:"",method:"test"};
const row: ReviewRow = {id:"stable", variableId:"bone-001",value:12,unit:"custom-unit",observedAt:"2026-10-28T07:18:00Z",sourceLabel:"Reported lab",specimen:"",assayMethod:"",notes:"Exact notes",selected:true};
const scope = {missionId:"m",crewMemberId:"c",dataOrigin:"synthetic" as const};
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
describe("Bone local multi-file queue", () => {
  test("retains CSV parser and unchecked defaults without OCR", async () => {
    const output = await processBoneFile(new File([csv], "results.csv"), new AbortController().signal);
    expect(output.rows.length).toBe(1); expect(output.rows[0]?.selected).toBe(false);
    expect(output.rows[0]?.unit).toBe("custom-unit"); expect(output.rows[0]?.observedAt).toBe("2026-10-28T07:18:00.000Z");
  });
  test("supports all six extensions and rejects unsupported/oversized files", () => {
    for (const extension of ["csv","pdf","png","jpg","jpeg","webp"]) expect(boneFileIssue({name:`test.${extension}`,size:1})).toBeNull();
    expect(boneFileIssue({name:"a.exe",size:1})).not.toBeNull();
    expect(boneFileIssue({name:"a.csv",size:2_000_001})).not.toBeNull();
    expect(boneFileIssue({name:"a.pdf",size:12_000_001})).not.toBeNull();
  });
  test("bounds file count to 10", () => {
    const queue = new BoneFileQueue(() => {}, async () => result);
    expect(queue.add(Array.from({length:11}, (_, i) => new File([csv], `${i}.csv`)))).toBe(1);
    expect(queue.items.length).toBe(MAX_BONE_FILES); queue.dispose();
  });
  test("processes serially and retains per-file errors", async () => {
    let active=0, maximum=0;
    const queue = new BoneFileQueue(() => {}, async file => { active++; maximum=Math.max(maximum,active); await tick(); active--; if(file.name==='bad.pdf')throw new Error('OCR unavailable'); return result; });
    queue.add([new File([csv],'good.csv'),new File(['x'],'bad.pdf'),new File([csv],'next.csv')]);
    await new Promise(resolve => setTimeout(resolve,70));
    expect(maximum).toBe(1); expect(queue.items.map(item=>item.status)).toEqual(['review','error','review']);
    expect(queue.items[1]?.detail).toBe('OCR unavailable'); queue.dispose();
  });
  test("cancelled and removed jobs cannot publish late results", async () => {
    let finish: (review:FileReview)=>void = () => {};
    const queue = new BoneFileQueue(() => {}, () => new Promise(resolve=>{finish=resolve}));
    queue.add([new File(['x'],'scan.png')]); const item=queue.items[0]; if(!item)throw new Error('Missing item');
    queue.cancel(item.id); finish(result); await tick(); expect(item.status).toBe('cancelled'); expect(item.review).toBeUndefined();
    queue.remove(item.id); expect(queue.items).toEqual([]); queue.dispose();
  });
  test("validates all selected measurements before writing and preserves exact dates", () => {
    expect(()=>reviewedBoneEntries([row,{...row,id:'bad',unit:''}],scope)).toThrow();
    expect(reviewedBoneEntries([row],scope)[0]?.observedAt).toBe(row.observedAt);
    expect(reviewedBoneEntries([{...row,saved:true}],scope)).toEqual([]);
  });
  test("duplicate warnings are scoped and include duplicates in the same batch", () => {
    const entries=reviewedBoneEntries([row,{...row,id:'second'}],scope);
    expect(duplicateBoneImportIds(entries,[])).toEqual(['second']);
    expect(duplicateBoneImportIds(entries.slice(0,1),[{...entries[0],...scope,id:'other',crewMemberId:'other',variableId:row.variableId,value:row.value,unit:row.unit,observedAt:row.observedAt,sourceLabel:row.sourceLabel,specimen:'',assayMethod:'',notes:''}])).toEqual([]);
  });
  test("duplicate checks compare equivalent instants without rewriting reported timestamps", () => {
    const entries = reviewedBoneEntries([row], scope);
    const history = reviewedBoneEntries([{ ...row, id: 'prior', observedAt: '2026-10-28T09:18:00+02:00' }], scope);
    expect(duplicateBoneImportIds(entries, history)).toEqual(['stable']);
    expect(history[0]?.observedAt).toBe('2026-10-28T09:18:00+02:00');
  });
  test("partial failure records success immediately and retries only unsaved stable IDs", async () => {
    const rows=[row,{...row,id:'second'}]; const receipts:string[]=[]; const writes:string[]=[];
    await expect(persistReviewedBoneEntries(reviewedBoneEntries(rows,scope),async entry=>{if(entry.id==='second')throw new Error('failed');writes.push(entry.id)},id=>{receipts.push(id); const r=rows.find(row=>row.id===id);if(r)r.saved=true})).rejects.toThrow('failed');
    expect(receipts).toEqual(['stable']);
    await persistReviewedBoneEntries(reviewedBoneEntries(rows,scope),async entry=>{writes.push(entry.id)},()=>{});
    expect(writes).toEqual(['stable','second']);
  });
});
