import assert from'node:assert/strict';
import{createHash}from'node:crypto';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const WORKER='ball46-production',ACTIVE='04b634d7-5dd3-48c4-93c0-bd2124ae129f',DEPLOYMENT='a51fbb87-ae64-4110-98f3-b117dbc5c8f3';
const JS_SHA='f57d5431327ad9a99398513c34c0daed4317769808665c129c80e524efaba6dc',HTML_SHA='06ec5da75cbfb914f5167de9ff439ee63ea43b9e2f37a50df92168e8d0840d81';
const root='https://api.cloudflare.com/client/v4/accounts/'+A,sha=b=>createHash('sha256').update(b).digest('hex');
const headers={authorization:'Bearer '+T};
const j=await fetch(root+'/workers/scripts/'+WORKER+'/deployments?per_page=1',{headers,signal:AbortSignal.timeout(45000)}).then(r=>r.json());
assert(j.success&&j.result.deployments.length);
const live=j.result.deployments[0];assert.equal(live.id,DEPLOYMENT,'DEPLOYMENT_NOT_CURRENT');assert.deepEqual(live.versions,[{version_id:ACTIVE,percentage:100}],'LIVE_TRAFFIC_WRONG');
const out={at:new Date().toISOString(),active:ACTIVE,deployment:DEPLOYMENT,checks:[]};
for(const host of ['https://ball46.com','https://www.ball46.com']){
 for(const [p,expected]of [['/signal.html',HTML_SHA],['/signal-next.js',JS_SHA]]){
  const u=new URL(p,host);u.searchParams.set('independentSignalFix',Date.now());const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(55000)}),b=Buffer.from(await r.arrayBuffer());
  assert.equal(r.status,200,'STATUS_'+host+p);assert.equal(sha(b),expected,'SHA_DRIFT_'+host+p);
  assert.equal(r.headers.get('x-ball46-signal-repair'),'standalone-fetch-20261023');
  out.checks.push({host,p,sha:expected});
 }
 for(const p of ['/api/engine/health','/api/engine/signals','/api/full-market/health']){
  const r=await fetch(host+p,{signal:AbortSignal.timeout(50000)});assert.equal(r.status,200,'API_HTTP_'+host+p);
  const x=await r.json();assert.equal(x.ok,true,'API_NOT_OK_'+host+p);
  out.checks.push({host,p,ok:true,signalCount:x.signals?.length,engineSignalCount:x.signalCount});
 }
}
console.log('B46_SIGNAL_INDEPENDENT_POST_DEPLOY='+JSON.stringify({ok:true,...out}));
