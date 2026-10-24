import assert from 'node:assert/strict';
const equal=(a,b)=>a.status===b.status&&a.sha===b.sha;
export async function waitForPublicCutover({read,active,expectedActive,baseline,changed,observe=async()=>{},sleep=ms=>new Promise(r=>setTimeout(r,ms)),now=Date.now,deadlineMs=30000,intervalMs=2000,stableRequired=2}){
 const start=now(),original=new Map(baseline.map(x=>[x.path,x]));let stable=0;
 for(;;){
  assert.equal((await active()).id,expectedActive,'ACTIVE_CHANGED_DURING_CUTOVER');
  const entries=await Promise.all(Object.keys(changed).map(async path=>{const actual=await read(path),target=changed[path],old=original.get(path);assert(old,'CUTOVER_BASELINE_MISSING:'+path);assert(equal(actual,target)||equal(actual,old),'PUBLIC_CUTOVER_UNKNOWN:'+path+':'+actual.status+':'+actual.sha);return {path,status:actual.status,sha:actual.sha,current:equal(actual,target)};}));
  stable=entries.every(x=>x.current)?stable+1:0;await observe({elapsedMs:now()-start,stable,entries});if(stable>=stableRequired)return;
  const remaining=deadlineMs-(now()-start);assert(remaining>0,'PUBLIC_CUTOVER_TIMEOUT');await sleep(Math.min(intervalMs,remaining));
 }
}
