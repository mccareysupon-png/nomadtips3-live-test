import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeHistory} from '../form-last5-20261025/history-core.mjs';
import {prepareFromHistoryGateStorage} from './history-storage-adapter.mjs';
const p=JSON.parse(readFileSync(new URL('../form-last5-20261025/real-history-fixture.json',import.meta.url),'utf8'));
test('read-only HistoryGate storage keys build 5/5 from authenticated captured data, zero external requests',async()=>{
 const f=p.fixture,now=Date.now(),cutoff=Date.parse(f.kickoffUtc),values=new Map();
 for(let i=0;i<2;i++){
  const teamId=String(p.provider[i].teamId),rows=normalizeHistory(p.provider[i].data,teamId,cutoff,f.fixtureId);
  values.set('team:'+teamId+':'+cutoff,{expires:now+60_000,data:{source:'5USD',verified:true,teamId,cutoffUtc:new Date(cutoff).toISOString(),fetchedAt:new Date(now).toISOString(),count:rows.length,rows}});
 }
 let reads=0;const storage={get:async k=>{reads++;return values.get(k);}};
 const result=await prepareFromHistoryGateStorage({storage,board:{ok:true,stale:false,fixtures:[f]},revision:'read-only-1',now});
 assert.equal(result.quality.full,1);assert.equal(reads,2);assert.equal(result.storageReads,2);assert.equal(result.providerRequests,0);
});
test('cold HistoryGate cache does not request missing history or claim coverage',async()=>{
 const result=await prepareFromHistoryGateStorage({storage:{get:async()=>undefined},board:{ok:true,stale:false,fixtures:[p.fixture]},revision:'cold'});
 assert.equal(result.quality.full,0);assert.equal(result.cacheInput.missingTeamCutoffs,2);
 assert.equal(result.providerRequests,0);
});
