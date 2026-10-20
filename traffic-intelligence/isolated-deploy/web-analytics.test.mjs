import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWebAnalytics,visitorQueries} from './web-analytics.mjs';
const now=Date.parse('2026-10-20T14:03:45Z');
const metric={count:114,sum:{visits:47},avg:{sampleInterval:1.1}};
const core={today:[metric],last24h:[metric],last7d:[metric],last30d:[metric],recent60m:[],hourly:[{...metric,dimensions:{datetimeHour:'2026-10-20T13:00:00Z'}}],daily:[{...metric,dimensions:{date:'2026-10-20'}}]};
const details={pages:[{...metric,dimensions:{requestPath:'/'}}],countries:[{...metric,dimensions:{countryName:'TH'}}],devices:[{...metric,dimensions:{deviceType:'desktop'}}],browsers:[{...metric,dimensions:{userAgentBrowser:'Chrome'}}],referrers:[{...metric,dimensions:{refererHost:''}}]};
const response=account=>new Response(JSON.stringify({data:{viewer:{accounts:[account]}},errors:null}));
const fetcher=async(url,init)=>response(init.body.includes('today:')?core:details);
test('visitor query is limited to the existing BALL46 beacon, main hosts and non-bot traffic',()=>{
 const q=visitorQueries(now);
 for(const query of [q.core,q.details]){assert(query.includes('siteTag:"8225c4c7c7b549909bac62b6385f09f7"'));assert(query.includes('requestHost_in:["ball46.com","www.ball46.com"]'));assert(query.includes('bot:0'));assert(!query.includes('member.ball46.com'));}
 assert.equal(q.periods.today.start,'2026-10-19T17:00:00.000Z');assert.equal(q.periods.last24h.end,'2026-10-20T14:03:00.000Z');
});
test('pageviews and visits remain distinct, with no conversion from requests or sampling multiplication',async()=>{
 const data=await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret'},{now,fetcher});
 assert.equal(data.status,'connected');assert.equal(data.metrics.last24h.visits,47);assert.equal(data.metrics.last24h.pageviews,114);assert.equal(data.metrics.last24h.sampleInterval,1.1);
 assert.equal(data.devices[0].name,'desktop');assert.equal(data.pages[0].name,'/');assert(!JSON.stringify(data).includes('test-secret'));
 assert.equal(data.uniqueVisitors,undefined);assert.equal(data.online,undefined);
});
test('missing token and failed API leave visitor metrics null',async()=>{
 for(const env of [{},{CF_WEB_ANALYTICS_TOKEN:'test-secret'}]){
  const data=await loadWebAnalytics(env,{now,fetcher:async()=>new Response('{}',{status:403})});
  assert.equal(data.status,'not_connected');assert.equal(data.metrics.last24h.visits,null);assert.equal(data.metrics.last24h.pageviews,null);
 }
});
test('an empty successful recent window means no recorded activity, not missing instrumentation',async()=>{
 const data=await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret'},{now,fetcher});assert.equal(data.metrics.recent60m.pageviews,0);assert.equal(data.metrics.recent60m.status,'connected');
});
test('details failure does not erase verified visit totals',async()=>{
 const data=await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret'},{now,fetcher:async(url,init)=>init.body.includes('today:')?response(core):new Response(JSON.stringify({errors:[{message:'unavailable'}]}))});
 assert.equal(data.metrics.last24h.visits,47);assert.equal(data.pages,null);assert.equal(data.devices,null);
});
test('malformed source values never become visitor counts',async()=>{
 const invalid={...core,last24h:[{count:-1,sum:{visits:999}}]};
 const data=await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret'},{now,fetcher:async(url,init)=>response(init.body.includes('today:')?invalid:details)});
 assert.equal(data.metrics.last24h.visits,null);assert.equal(data.status,'not_connected');
});
test('dedicated visitor cache contains aggregates without secrets and reuses fresh data',async()=>{
 let cached,savedKey;const EVENTS_KV={get:async()=>cached,put:async(key,value)=>{savedKey=key;cached=JSON.parse(value);}};
 await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret',EVENTS_KV},{now,fetcher});
 assert.equal(savedKey,'analytics/cloudflare-web-visitors-v1');assert(!JSON.stringify(cached).includes('test-secret'));
 const hit=await loadWebAnalytics({CF_WEB_ANALYTICS_TOKEN:'test-secret',EVENTS_KV},{now:now+1000,fetcher:async()=>{throw Error('Must use cache');}});assert.equal(hit.cached,true);
});
