import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const engine='nomadtips3-engine-343';
const restore='c4174e9b-50ab-4e15-a7f5-6ef637fb6599';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{...options,signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${token}`,...options.headers}});
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}
async function active(){
  const r=await api(`/scripts/${engine}/deployments`);
  const v=r.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_VERSION_AMBIGUOUS');
  return v[0].version_id;
}
async function json(url){
  const u=new URL(url);u.searchParams.set('_',Date.now());
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
  assert(r.ok,`HTTP_${r.status}:${u.pathname}`);
  return r.json();
}

const before=await active();
console.log('ACTIVE_BEFORE',before);
await api(`/scripts/${engine}/deployments`,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({
    strategy:'percentage',
    versions:[{version_id:restore,percentage:100}],
    annotations:{'workers/message':'Emergency restore Statistics after scale backend regression'}
  })
});
for(let i=0;i<20;i++){
  if(await active()===restore)break;
  await new Promise(r=>setTimeout(r,1500));
}
assert.equal(await active(),restore,'RESTORE_VERSION_NOT_ACTIVE');

const publicStats=await json('https://ball46.com/api/engine/statistics');
assert(publicStats?.ok===true,'PUBLIC_STATS_NOT_OK');
assert(Array.isArray(publicStats?.rows),'PUBLIC_STATS_ROWS_MISSING');
assert(Number.isFinite(Number(publicStats?.total)),'PUBLIC_STATS_TOTAL_MISSING');
assert(Number.isFinite(Number(publicStats?.ledgerTotal)),'PUBLIC_STATS_LEDGER_TOTAL_MISSING');

const directStats=await json('https://nomadtips3-engine-343.mccarey-supon.workers.dev/statistics');
assert(directStats?.ok===true,'DIRECT_STATS_NOT_OK');
assert.equal(Number(publicStats.total),Number(directStats.total),'PUBLIC_DIRECT_TOTAL_MISMATCH');
assert.equal(Number(publicStats.ledgerTotal),Number(directStats.ledgerTotal),'PUBLIC_DIRECT_LEDGER_MISMATCH');

console.log('STATISTICS_EMERGENCY_RESTORE_SUCCESS',JSON.stringify({
  before,
  restore,
  total:publicStats.total,
  ledgerTotal:publicStats.ledgerTotal,
  pending:publicStats.pending,
  returned:publicStats.rows.length
}));
