import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectFtProof,handlePrivateFinal} from '../src/index.mjs';
const token='x'.repeat(48);
const proof=()=>({fixture:{id:'5D-1',status:'finished',status_code:'full',
 goals:{home:2,away:1},corners:{home:null,away:null}},
 provenance:{source:'goaloo',sourceFixtureId:'G-1',canonicalId:'5D-1',
 kickoffUtc:'2026-10-18T10:00:00Z',firstFtSeenAt:'2026-10-18T12:00:00Z',
 verifiedAt:'2026-10-18T12:01:10Z'}});
const request=(path,tokenValue=token,body=proof())=>new Request('https://private.internal'+path,{
 method:'POST',headers:{'x-ball46-result-auth':tokenValue,'content-type':'application/json'},
 body:JSON.stringify(body)});
const response=()=>({ok:true,status:200,json:async()=>({ok:true,fixtureId:'5D-1',
 statisticsLedgerVersion:'signal-ledger-v2-longterm',settled:1,ledgerInserted:0,ledgerUpdated:1})});
test('requires certified FT twice after full 90 min',()=>{
 assert.equal(inspectFtProof(proof(),{now:Date.parse('2026-10-18T12:05:00Z')}).ok,true);
 const p=proof();p.provenance.firstFtSeenAt='2026-10-18T12:00:50Z';
 assert.equal(inspectFtProof(p,{now:Date.parse('2026-10-18T12:05:00Z')}).ok,false);
});
test('does not use final goal score to settle corners',()=>{
 const p=proof();p.fixture.corners.home=9;
 assert.equal(inspectFtProof(p,{now:Date.parse('2026-10-18T12:05:00Z')}).ok,false);
});
test('goaloo source identity mismatch fails closed',()=>{
 const p=proof();p.fixture.id='DIFFERENT';
 assert.equal(inspectFtProof(p,{now:Date.parse('2026-10-18T12:05:00Z')}).ok,false);
});
test('missing auth prevents native Engine calls',async()=>{
 let count=0;const env={RESULT_PROXY_TOKEN:token,FIVEDOLLAR_API_KEY:token,
  ENGINE:{fetch:async()=>{count++;return response()}}};
 const r=await handlePrivateFinal(request('/verified-goaloo-ft','wrong'),env);
 assert.equal(r.status,401);assert.equal(count,0);
});
test('cannot call arbitrary Engine routes',async()=>{
 let count=0;const env={RESULT_PROXY_TOKEN:token,FIVEDOLLAR_API_KEY:token,
  ENGINE:{fetch:async()=>{count++;return response()}}};
 const r=await handlePrivateFinal(request('/ledger-import'),env);
 assert.equal(r.status,404);assert.equal(count,0);
});
test('verified FT uses current Engine native reconcile and expects Ledger V2',async()=>{
 let target,options;
 const env={RESULT_PROXY_TOKEN:token,FIVEDOLLAR_API_KEY:token,
  ENGINE:{fetch:async(u,o)=>{target=u;options=o;return response()}}};
 const p=proof();p.provenance.verifiedAt='2026-10-18T12:01:10Z';
 const r=await handlePrivateFinal(request('/verified-goaloo-ft',token,p),env);
 const d=await r.json();
 assert.equal(r.status,200);assert.equal(d.ledgerV2Native,true);
 assert.equal(d.requiresLedgerReadback,true);
 assert.equal(target,'https://engine.internal/reconcile-final');
 assert.equal(options.method,'POST');
 assert.equal(options.headers['x-settlement-token'],token);
});
test('native acknowledgement lacking Ledger V2 cannot claim success',async()=>{
 const env={RESULT_PROXY_TOKEN:token,FIVEDOLLAR_API_KEY:token,
  ENGINE:{fetch:async()=>({ok:true,json:async()=>({ok:true,fixtureId:'5D-1',settled:1,ledgerUpdated:1})})}};
 const r=await handlePrivateFinal(request('/verified-goaloo-ft'),env);
 assert.equal(r.status,502);
});
