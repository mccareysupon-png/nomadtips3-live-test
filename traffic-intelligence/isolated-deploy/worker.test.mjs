import assert from 'node:assert/strict';
import test from 'node:test';
import app from './worker.mjs';
import collector from './collector.mjs';
test('dedicated service reports identity without exposing data',async()=>{
 const r=await app.fetch(new Request('https://test.invalid/health'),{COLLECT_ENABLED:'false'});
 const j=await r.json();assert.equal(r.status,200);assert.equal(j.isolated,true);assert.equal(j.collectionEnabled,false);
});
test('owner page fails closed when Access has not been configured',async()=>{
 const r=await app.fetch(new Request('https://test.invalid/'),{});
 assert.equal(r.status,403);
});
test('analytics JSON fails closed without Access',async()=>{
 const r=await app.fetch(new Request('https://test.invalid/api/summary'),{});
 assert.equal(r.status,403);
});
test('collector refuses external origins and is disabled until configured',async()=>{
 const other=await collector.fetch(new Request('https://test.invalid/api/collect',{method:'POST',headers:{Origin:'https://bad.example'}}),{});
 assert.equal(other.status,403);
 const legit=await collector.fetch(new Request('https://test.invalid/api/collect',{method:'POST',headers:{Origin:'https://ball46.com'}}),{COLLECT_ENABLED:'false'});
 assert.equal(legit.status,503);
});
test('presence reads require owner Access and Collector never exposes private reads',async()=>{
 assert.equal((await app.fetch(new Request('https://test.invalid/api/presence'),{})).status,403);
 for(const path of ['/','/api/summary','/api/presence'])assert.equal((await collector.fetch(new Request('https://test.invalid'+path),{})).status,404);
 assert.equal((await app.fetch(new Request('https://test.invalid/api/collect',{method:'POST'}),{COLLECT_ENABLED:'true'})).status,404);
});
test('unknown routes do not reveal admin page',async()=>{
 const r=await app.fetch(new Request('https://test.invalid/secret'),{});
 assert.equal(r.status,404);
});
