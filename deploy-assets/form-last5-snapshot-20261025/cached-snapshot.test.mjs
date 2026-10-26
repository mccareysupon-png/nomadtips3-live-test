import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeHistory} from '../form-last5-20261025/history-core.mjs';
import {prepareCachedSnapshot} from './cached-snapshot.mjs';
const capture=JSON.parse(readFileSync(new URL('../form-last5-20261025/real-history-fixture.json',import.meta.url),'utf8'));
const fixture=capture.fixture,now=Date.now();
function input(){
 const cutoff=Date.parse(fixture.kickoffUtc);
 return {board:{ok:true,stale:false,fixtures:[fixture]},revision:'test-board-1',now,
 entries:['home','away'].map((side,i)=>{const teamId=String(fixture[side].id),rows=normalizeHistory(capture.provider[i].data,teamId,cutoff,fixture.fixtureId);
 return {expires:now+60000,data:{source:'5USD',verified:true,teamId,cutoffUtc:new Date(cutoff).toISOString(),fetchedAt:new Date(now-1000).toISOString(),count:rows.length,rows}};})};
}
test('recorded authenticated cache produces 5/5 without provider calls',()=>{
 const out=prepareCachedSnapshot(input());assert.equal(out.quality.full,1);assert.equal(out.revision,'test-board-1');assert.equal(out.cacheInput.providerRequests,0);
});
test('expired or different-cutoff cache cannot supply history',()=>{
 for(const mutate of [e=>e.expires=now-1,e=>e.data.cutoffUtc='2000-01-01T00:00:00Z',e=>e.data.verified=false]){
 const x=input();x.entries.forEach(mutate);const out=prepareCachedSnapshot(x);assert.equal(out.quality.full,0);assert.equal(out.cacheInput.acceptedTeamCutoffs,0);
 }
});
test('missing cache remains empty',()=>{const x=input();x.entries=[];const out=prepareCachedSnapshot(x);assert.equal(out.quality.missing,1);assert.equal(out.cacheInput.missingTeamCutoffs,2);});
test('stale board fails closed',()=>{const x=input();x.board.stale=true;assert.throws(()=>prepareCachedSnapshot(x),/BOARD_UNAVAILABLE/);});
test('foreign-team or future cache rows rejected',()=>{
 for(const mutate of [r=>{r.home.id='999999999';r.away.id='999999998';},r=>r.kickoffUtc='2099-01-01T00:00:00Z']){
 const x=input();x.entries.forEach(e=>mutate(e.data.rows[0]));assert.equal(prepareCachedSnapshot(x).cacheInput.acceptedTeamCutoffs,0);
 }
});
