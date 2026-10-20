import assert from 'node:assert/strict';
import test from 'node:test';
import {windows,loadAnalytics,assemble} from './analytics.mjs';
import app from './worker.mjs';
const now=Date.parse('2026-10-20T13:42:00Z');
const hourly=[{dimensions:{datetime:'2026-10-20T12:00:00Z'},sum:{requests:123,countryMap:[{clientCountryName:'TH',requests:100},{clientCountryName:'US',requests:23}]}}];
const daily=[{dimensions:{date:'2026-10-19'},sum:{requests:456}}];
test('Bangkok midnight and completed UTC windows stay explicit',()=>{
 const w=windows(now); assert.equal(new Date(w.today.start).toISOString(),'2026-10-19T17:00:00.000Z');assert.equal(new Date(w.today.end).toISOString(),'2026-10-20T13:00:00.000Z');
 assert.equal(w.last24h.end-w.last24h.start,86400000);assert.equal(w.last7d.end-w.last7d.start,7*86400000);
 const midnight=windows(Date.parse('2026-10-20T17:15:00Z'));assert.equal(midnight.today.start,midnight.today.end);
});
test('missing connection, API failures and empty datasets never become zero visitors',async()=>{
 for(const env of [{},{CF_ANALYTICS_TOKEN:'test-secret'}]){
  const x=await loadAnalytics(env,{now,fetcher:async()=>new Response('{}',{status:403})});
  for(const m of Object.values(x.metrics))assert.equal(m.value,null);
  assert.equal(x.online.value,null);assert.equal(x.uniqueVisitors.value,null);assert.equal(JSON.stringify(x).includes('test-secret'),false);
 }
 const x=assemble([],[],now);assert.equal(x.metrics.last24h.value,null);
});
test('Cloudflare aggregates remain requests with independent partial failure',async()=>{
 const fetcher=async(url,init)=>new Response(JSON.stringify(init.body.includes('httpRequests1hGroups')?{data:{viewer:{zones:[{httpRequests1hGroups:hourly}]}},errors:null}:{errors:[{message:'denied'}]}));
 const x=await loadAnalytics({CF_ANALYTICS_TOKEN:'test-secret'},{now,fetcher});
 assert.equal(x.metrics.last24h.value,123);assert.equal(x.metrics.last30d.value,null);assert.equal(x.online.value,null);assert.equal(x.countries[0].requests,100);
});
test('truncated, malformed and duplicate API rows fail closed',async()=>{
 for(const rows of [[...hourly,...hourly],[{...hourly[0],sum:{requests:-1}}]]){
  const x=await loadAnalytics({CF_ANALYTICS_TOKEN:'test-secret'},{now,fetcher:async()=>new Response(JSON.stringify({data:{viewer:{zones:[{httpRequests1hGroups:rows,httpRequests1dGroups:[]}]}},errors:null}))});
  assert.equal(x.metrics.last24h.value,null);
 }
});
test('zero returned by the source is distinct from absent data',()=>{
 const x=assemble([{...hourly[0],sum:{requests:0,countryMap:[]}}],daily,now);
 assert.equal(x.metrics.last24h.value,0);assert.equal(x.metrics.last24h.status,'connected');assert.equal(x.online.value,null);
});
test('anonymous and forged Access credentials cannot trigger Analytics API',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected');};
 try{for(const headers of [{},{'Cf-Access-Jwt-Assertion':'forged.jwt.value'},{cookie:'CF_Authorization=forged'}]){
  const r=await app.fetch(new Request('https://test.invalid/api/summary',{headers}),{ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',ACCESS_AUD:'aud',ADMIN_EMAIL:'owner@example.test',CF_ANALYTICS_TOKEN:'test-secret'});
  assert.equal(r.status,403);
 }assert.equal(calls,0);}finally{globalThis.fetch=original;}
});
