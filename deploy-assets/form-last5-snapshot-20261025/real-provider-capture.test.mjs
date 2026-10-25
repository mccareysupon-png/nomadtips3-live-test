import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildLast5Snapshot} from './snapshot-core.mjs';
// Captured authenticated 5USD read-only responses from Work on 24 Oct 2026.
// No provider calls, Cloudflare access or secret needed at test runtime.
const p=JSON.parse(readFileSync(new URL('../form-last5-20261025/real-history-fixture.json',import.meta.url),'utf8'));
const fixture=p.fixture;
const source=p.provider.flatMap(x=>x.data?.data||[]);
test('recorded real 5USD provider response produces 5/5 verified FT rows',()=>{
 assert.equal(p.mode,'READ_ONLY');assert.equal(p.productionWrites,0);
 assert.equal(p.providerRequests,2);
 assert.deepEqual(p.provider.map(x=>x.status),[200,200]);
 const snapshot=buildLast5Snapshot([fixture],source);
 const row=snapshot.fixtures[String(fixture.fixtureId)];
 assert.ok(row,'fixture indexed');
 assert.equal(row.home.count,5);assert.equal(row.away.count,5);
 for(const side of ['home','away'])for(const game of row[side].rows){
  assert.equal(game.status,'FT');
  assert.ok(Date.parse(game.kickoffUtc)<Date.parse(fixture.kickoffUtc));
  assert.ok(['W','D','L'].includes(game.result));
 }
});
