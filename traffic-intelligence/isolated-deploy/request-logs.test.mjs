import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRequestLogs,requestLogQuery} from './request-logs.mjs';
const now=Date.parse('2026-10-20T14:40:45Z');
const row={clientIP:'192.0.2.12',clientCountryName:'TH',datetime:'2026-10-20T14:30:00Z',clientRequestHTTPHost:'ball46.com',clientRequestPath:'/',clientDeviceType:'desktop',userAgentBrowser:'Chrome',edgeResponseStatus:200};
const response=rows=>new Response(JSON.stringify({data:{viewer:{zones:[{httpRequestsAdaptive:rows}]}}}));
test('request IP query is limited to main hosts, eyeball requests, last24h and100 newest samples',()=>{
 const q=requestLogQuery(now);assert.equal(q.end,'2026-10-20T14:37:00.000Z');assert.equal(q.start,'2026-10-19T14:37:00.000Z');
 for(const part of ['limit:100','requestSource:"eyeball"','clientRequestHTTPHost_in:["ball46.com","www.ball46.com"]','datetime_DESC'])assert(q.query.includes(part));
 for(const part of ['clientRequestQuery','sessionIdHash','userAgent ','botScore'])assert(!q.query.includes(part));
});
test('confirmed IPv4/IPv6 records remain sampled network activity, never unique people',async()=>{
 const data=await loadRequestLogs({CF_ANALYTICS_TOKEN:'secret'},{now,fetcher:async()=>response([row,{...row,clientIP:'2001:db8::1234',clientCountryName:'US'}])});
 assert.equal(data.status,'connected');assert.equal(data.rows.length,2);assert.equal(data.sampledDistinctIPs,2);assert.equal(data.sampled,true);assert.equal(data.online,undefined);assert.equal(data.uniqueVisitors,undefined);
});
test('raw records and token are never persisted in KV',async()=>{
 let kvCalls=0;const data=await loadRequestLogs({CF_ANALYTICS_TOKEN:'private-token',EVENTS_KV:{get:()=>{kvCalls++;},put:()=>{kvCalls++;}}},{now,fetcher:async()=>response([row])});
 assert.equal(kvCalls,0);assert.equal(data.storedInKV,false);assert(!JSON.stringify(data).includes('private-token'));
});
test('query strings and sensitive account paths are not returned',async()=>{
 const data=await loadRequestLogs({CF_ANALYTICS_TOKEN:'secret'},{now,fetcher:async()=>response([{...row,clientRequestPath:'/index.html?token=private#secret'},{...row,clientRequestPath:'/account/reset/abcdef'}])});
 assert.equal(data.rows[0].path,'/index.html');assert.equal(data.rows[1].path,'[private path]');assert(!JSON.stringify(data).includes('token=private'));
});
test('API errors or malformed records fail closed without exposing API error text',async()=>{
 const invalid=[{...row,clientIP:'999.1.2.3'},{...row,clientIP:'<script>'},{...row,clientRequestHTTPHost:'member.ball46.com'},{...row,datetime:'2026-10-20T14:40:00Z'},{...row,datetime:'bad'},{...row,edgeResponseStatus:999}];
 for(const item of invalid){const x=await loadRequestLogs({CF_ANALYTICS_TOKEN:'secret'},{now,fetcher:async()=>response([item])});assert.equal(x.rows,null);assert.equal(x.sampledDistinctIPs,null);}
 const x=await loadRequestLogs({CF_ANALYTICS_TOKEN:'secret'},{now,fetcher:async()=>new Response(JSON.stringify({errors:[{message:'secret raw error'}]}))});assert.equal(x.status,'not_connected');assert(!JSON.stringify(x).includes('secret raw error'));
});
test('missing connection is null and successful empty source is recorded as an empty sample',async()=>{
 const absent=await loadRequestLogs({},{now});assert.equal(absent.rows,null);assert.equal(absent.sampledDistinctIPs,null);
 const empty=await loadRequestLogs({CF_ANALYTICS_TOKEN:'secret'},{now,fetcher:async()=>response([])});assert.equal(empty.status,'connected');assert.deepEqual(empty.rows,[]);assert.equal(empty.sampledDistinctIPs,0);
});
