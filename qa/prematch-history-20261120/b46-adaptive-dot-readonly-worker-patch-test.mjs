// One version-locked, additive TEST Worker patch; no public Ledger, owner control, formula, price changes.
import assert from 'node:assert/strict';
const one=(s,needle,next,code)=>{
 const count=s.split(needle).length-1;
 assert.equal(count,1,code+'_ANCHOR_EXPECTED_ONE_GOT_'+count);
 return s.replace(needle,next);
};
export function patchAdaptiveDotRiskReadOnly(s){
 assert(!s.includes('B46_DOT_READ_ONLY_CRON_V1'),'DOT_PATCH_ALREADY_INSTALLED');
 const importRisk="import {adaptiveControlOverview,adaptiveControlCommand,applyAdaptiveAutoStops,adaptiveActiveSelections} from './b46-adaptive-formula-control-risk-test.mjs';";
 s=one(s,importRisk,importRisk+"\nimport {buildAdaptiveDotReadReport} from './b46-adaptive-dot-risk-readonly-v1-test.mjs';",'IMPORT');
 const doAnchor="if(path==='/adaptive-control-api-test'&&req.method==='GET'){";
 const doRead=String.raw`if(path==='/adaptive-dot-risk-internal-test'){
 if(req.method!=='GET')return Response.json({status:'METHOD_NOT_ALLOWED',readOnly:true},{status:405,headers:{'cache-control':'no-store'}});
 if(req.headers.get('x-b46-control-role')!=='DOT_READER')return Response.json({status:'UNAUTHORIZED',readOnly:true},{status:403,headers:{'cache-control':'no-store'}});
 try{
  const heartbeat=await this.ctx.storage.get('b46AdaptiveRiskCronLastV1')??null;
  const run=await this.ctx.storage.get('b46AdaptiveOuResearchLastV1')??null;
  const report=buildAdaptiveDotReadReport(this.db,now,{cron:heartbeat,run});
  return Response.json(report,{status:report.status==='OK'?200:503,headers:{'cache-control':'no-store'}});
 }catch(error){
  console.log('B46_DOT_READ_UNAVAILABLE_TEST');
  return Response.json({code:'B46_ADAPTIVE_DOT_SUPERVISOR_READ_V1_TEST',status:'UNAVAILABLE',
   readOnly:true,reason:'WORKER_SNAPSHOT_READ_FAILED',formulas:null,summary:null},{status:503,headers:{'cache-control':'no-store'}});
 }
}
`;
 s=one(s,doAnchor,doRead+doAnchor,'DO_READ_ONLY_ROUTE');
 const save="  await this.ctx.storage.put('b46AdaptiveOuResearchLastV1',{...last,fixtures,fixtureFeed});";
 const audit=String.raw`  await this.ctx.storage.put('b46AdaptiveOuResearchLastV1',{...last,fixtures,fixtureFeed});
  if(req.headers.get('x-b46-adaptive-cron-source')==='CLOUDFLARE_SCHEDULED_15M'){
    await this.ctx.storage.put('b46AdaptiveRiskCronLastV1',{
      origin:'CLOUDFLARE_SCHEDULED_15M',status:'SUCCESS',startedAt:now,
      completedAt:Math.floor(Date.now()/1000),invocationId:'scheduled-15m-'+now,
      riskGuardBefore:{checked:beforeRiskGuard.checked,paused:beforeRiskGuard.paused},
      riskGuardAfter:{checked:afterRiskGuard.checked,paused:afterRiskGuard.paused}
    });
  }`;
 s=one(s,save,audit,'PERSIST_REAL_CRON_GUARD');
 const schedule="b46s.fetch('https://prematch.internal/ou-adaptive-research-run-test', {method:'POST'})";
 const triggered="b46s.fetch('https://prematch.internal/ou-adaptive-research-run-test', {method:'POST',headers:{'x-b46-adaptive-cron-source':'CLOUDFLARE_SCHEDULED_15M'}})";
 s=one(s,schedule,triggered,'ACTUAL_SCHEDULED_HANDLER');
 const external="if((p==='/adaptive-control-api-test'||p==='/adaptive-control-active-test'||p==='/adaptive-control-dot-test')&&['GET','POST'].includes(req.method)){";
 const dot=String.raw`// B46_DOT_READ_ONLY_CRON_V1
if(p==='/adaptive-dot-risk-read-test'){
 const securityHeaders={'cache-control':'no-store, private','x-robots-tag':'noindex,nofollow',
  'referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
 if(req.method!=='GET')return new Response(JSON.stringify({status:'METHOD_NOT_ALLOWED',readOnly:true}),{
   status:405,headers:{...securityHeaders,'content-type':'application/json','allow':'GET'}});
 const want=env.B46_ADAPTIVE_DOT_READ_HASH;
 const bearer=req.headers.get('authorization')||'';
 const supplied=bearer.startsWith('Bearer ')?bearer.slice(7):'';
 // Fail closed. No cookies, no owner credential fallback, no CORS.
 if(!want||!/^[0-9a-f]{64}$/.test(want))return new Response(JSON.stringify({status:'UNAVAILABLE',reason:'READER_CREDENTIAL_NOT_CONFIGURED',formulas:null}),{
   status:503,headers:{...securityHeaders,'content-type':'application/json'}});
 if(!/^[0-9a-f]{64}$/.test(supplied))return new Response(JSON.stringify({status:'UNAUTHORIZED',formulas:null}),{
   status:401,headers:{...securityHeaders,'content-type':'application/json'}});
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)));
 let delta=0;for(let j=0;j<32;j++)delta|=digest[j]^parseInt(want.slice(j*2,j*2+2),16);
 if(delta!==0)return new Response(JSON.stringify({status:'UNAUTHORIZED',formulas:null}),{
   status:401,headers:{...securityHeaders,'content-type':'application/json'}});
 const store=env.STORE.get(env.STORE.idFromName('prematch-only-v1'));
 const result=await store.fetch(new Request('https://prematch.internal/adaptive-dot-risk-internal-test',{
   method:'GET',headers:{'x-b46-control-role':'DOT_READER','accept':'application/json'}}));
 const headers=new Headers(result.headers);
 for(const [k,v]of Object.entries(securityHeaders))headers.set(k,v);
 headers.delete('access-control-allow-origin');
 return new Response(result.body,{status:result.status,headers});
}
`;
 s=one(s,external,dot+external,'AUTHENTICATED_DOT_ROUTE');
 return s;
}
