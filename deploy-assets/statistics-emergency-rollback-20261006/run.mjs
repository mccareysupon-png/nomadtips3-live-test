import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const engine='nomadtips3-engine-343';
const target='c4174e9b-50ab-4e15-a7f5-6ef637fb6599';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{
    ...options,
    signal:AbortSignal.timeout(60000),
    headers:{Authorization:`Bearer ${token}`,...options.headers}
  });
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}

async function active(){
  const r=await api(`/scripts/${engine}/deployments`);
  const v=r.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ENGINE_ACTIVE_AMBIGUOUS');
  return v[0].version_id;
}

async function getJson(url){
  const u=new URL(url); u.searchParams.set('_',String(Date.now()));
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
  assert(r.ok,`HTTP_${r.status}:${u.pathname}`);
  const j=await r.json();
  assert(j?.ok===true,`NOT_OK:${u.pathname}`);
  return j;
}

const before=await active();
await api(`/workers/${engine}/versions/${target}?include=modules`);
if(before!==target){
  await api(`/scripts/${engine}/deployments`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:target,percentage:100}],
      annotations:{'workers/message':'Emergency rollback: restore last confirmed-good Ball46 Statistics engine'}
    })
  });
}
for(let i=0;i<15;i++){
  if(await active()===target) break;
  await new Promise(r=>setTimeout(r,2000));
}
assert.equal(await active(),target,'ROLLBACK_NOT_ACTIVE');

const stats=await getJson('https://ball46.com/api/engine/statistics');
assert(Number.isSafeInteger(stats.ledgerTotal),'STATISTICS_LEDGER_TOTAL_MISSING');
assert(Number.isSafeInteger(stats.total),'STATISTICS_TOTAL_MISSING');
assert(stats.ledgerTotal>=stats.total,'STATISTICS_TOTALS_INVALID');

console.log('BALL46_STATISTICS_ROLLBACK_OK',JSON.stringify({
  before,
  active:target,
  total:stats.total,
  ledgerTotal:stats.ledgerTotal,
  pending:stats.pending,
  win:stats.win,
  loss:stats.loss,
  push:stats.push,
  halfWin:stats.halfWin,
  halfLoss:stats.halfLoss,
  unresolved:stats.unresolved
}));
