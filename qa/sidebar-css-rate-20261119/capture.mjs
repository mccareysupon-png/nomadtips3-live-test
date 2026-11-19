import {createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const token=process.env.CLOUDFLARE_API_TOKEN;
assert(token,'AUDIT_AUTH_MISSING');
const key=createHmac('sha256',token).update('ball46/receiver/https-audit/v1/20261118').digest('hex');
console.log('::add-mask::'+key);
const base='https://ball46-shadow-receiver-production.mccarey-supon.workers.dev/audit-projection-graph-v1';
const names=[['all','all'],['1x2','1X2'],['ah','AH'],['ou','O/U'],['corners','Corners'],['btts','BTTS'],['cards','Cards'],['other','Other']];
let snapshot;
for(let attempt=0;attempt<4;attempt++){
 const data=await Promise.all(names.map(async([id,market])=>{
  const url=base+'?'+new URLSearchParams({market,variant:'all',filter:'all',range:'all'});
  const response=await fetch(url,{headers:{authorization:'Bearer '+key},signal:AbortSignal.timeout(20000)});
  assert.equal(response.status,200,'RECEIVER '+market);
  const d=await response.json();
  assert(d.ok&&d.market===market&&d.range==='all'&&d.filter==='all'&&d.variant==='all','INVALID_GRAPH '+market);
  assert(Number.isSafeInteger(d.sequence)&&Number.isSafeInteger(d.generation),'INVALID_SEQUENCE');
  assert(d.counts&&['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'].every(k=>Number.isSafeInteger(d.counts[k])&&d.counts[k]>=0),'INVALID_COUNTS '+market);
  assert(typeof d.win_rate==='number'&&Number.isFinite(d.win_rate)&&d.win_rate>=0&&d.win_rate<=100,'MISSING_STORED_WIN_RATE '+market);
  const w=d.counts.WIN+d.counts.HALF_WIN,l=d.counts.LOSS+d.counts.HALF_LOSS;
  assert(Math.abs(d.win_rate-(w+l?w/(w+l)*100:0))<1e-8,'STORED_RATE_DRIFT '+market);
  return {id,sequence:d.sequence,generation:d.generation,rate:w+l?d.win_rate:null,counts:d.counts};
 }));
 if(!data.every(d=>d.sequence===data[0].sequence&&d.generation===data[0].generation))continue;
 for(const k of ['WIN','HALF_WIN','LOSS','HALF_LOSS','PUSH'])assert.equal(data.slice(1).reduce((n,d)=>n+d.counts[k],0),data[0].counts[k],'MARKET_COUNT_DRIFT '+k);
 snapshot={mode:'RECEIVER_STORED_SNAPSHOT',capturedAt:new Date().toISOString(),sequence:data[0].sequence,generation:data[0].generation,rates:Object.fromEntries(data.map(d=>[d.id,d.rate]))};break;
}
assert(snapshot,'NO_COHERENT_RECEIVER_SNAPSHOT');
await writeFile(new URL('./snapshot.mjs',import.meta.url),'export const snapshot='+JSON.stringify(snapshot)+';\n');
console.log('RECEIVER_RATE_SNAPSHOT '+JSON.stringify(snapshot));
