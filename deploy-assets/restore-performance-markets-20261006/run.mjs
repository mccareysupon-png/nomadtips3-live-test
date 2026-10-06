import assert from 'node:assert/strict';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const script='ball46-production';
const target='4f9b7e60-5dd8-4818-80f3-c8739b84de47';
const allowedBefore=new Set([
  target,
  '58569c5a-57f9-47f7-aad5-df81789897da',
  '2998bed7-7d95-4e31-b87e-1dda192f5841'
]);
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const r=await fetch(root+path,{
    ...options,
    signal:AbortSignal.timeout(60000),
    headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}
  });
  const j=await r.json();
  assert(r.ok&&j.success===true,`CLOUDFLARE_ERROR:${r.status}:${JSON.stringify(j.errors||[])}`);
  return j.result;
}
async function active(){
  const d=await api(`/scripts/${script}/deployments`);
  const v=d.deployments?.[0]?.versions;
  assert(v?.length===1&&Number(v[0].percentage)===100,'ACTIVE_VERSION_AMBIGUOUS');
  return v[0].version_id;
}
async function getText(url){
  const u=new URL(url);u.searchParams.set('_',String(Date.now()));
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
  assert(r.ok,`HTTP_${r.status}:${u.pathname}`);
  return r.text();
}
async function getJson(url){
  const j=JSON.parse(await getText(url));
  assert(j?.ok===true,'JSON_NOT_OK');
  return j;
}

function group(row){
  const x=String(row?.marketLabel??row?.market??row?.providerMarket??'').toLowerCase().replace(/[_-]+/g,' ');
  if(/btts|both teams/.test(x)) return 'btts';
  if(/corner/.test(x)) return 'corners';
  if(/card/.test(x)) return 'cards';
  if(/1x2|match result|moneyline/.test(x)) return '1x2';
  if(/asian|handicap|\bah\b/.test(x)) return 'ah';
  if(/over\s*\/?\s*under|\bover\b|\bunder\b|o\s*\/?\s*u|goal line|total/.test(x)) return 'ou';
  return 'other';
}

const before=await active();
console.log('RESTORE_PREFLIGHT',JSON.stringify({before,target}));
assert(allowedBefore.has(before),'STOP_FOREIGN_ACTIVE_VERSION');

await api(`/workers/${script}/versions/${target}?include=modules`);

if(before!==target){
  await api(`/scripts/${script}/deployments`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      strategy:'percentage',
      versions:[{version_id:target,percentage:100}],
      annotations:{'workers/message':'Restore Ball46 Performance Card and complete Statistics market strip'}
    })
  });
  for(let i=0;i<20;i++){
    if(await active()===target)break;
    await new Promise(r=>setTimeout(r,1500));
  }
}
assert.equal(await active(),target,'RESTORE_NOT_ACTIVE');

const index=await getText('https://ball46.com/index.html');
const statsPage=await getText('https://ball46.com/statistics.html');
const statsJs=await getText('https://ball46.com/statistics-next.js');
const stats=await getJson('https://ball46.com/api/engine/statistics');

assert(index.includes('b46-daily-performance-runtime'),'PERFORMANCE_CARD_RUNTIME_MISSING');
assert(index.includes('STATISTICS_LEDGER_INCOMPLETE'),'PERFORMANCE_CARD_RECONNECT_MISSING');
for(const [key,label] of [
  ['all','Total'],['1x2','1X2'],['ah','AH'],['ou','O/U'],
  ['btts','BTTS'],['corners','Corners'],['cards','Cards'],['other','Other']
]){
  assert(index.includes(`data-stat-market="${key}"`),`STATISTICS_NAV_MISSING:${key}`);
  assert(index.includes(`<span>${label}</span>`)||index.includes(`>${label}</span>`),`STATISTICS_LABEL_MISSING:${label}`);
}
assert(statsPage.includes('data-next-stat-markets'),'STATISTICS_MARKET_STRIP_MISSING');
assert(statsJs.includes('renderMarkets'),'STATISTICS_MARKET_RENDERER_MISSING');
assert(statsJs.includes('renderStats'),'STATISTICS_RENDERER_MISSING');

assert(Number.isSafeInteger(stats?.total),'STATISTICS_TOTAL_MISSING');
assert(Number.isSafeInteger(stats?.ledgerTotal),'STATISTICS_LEDGER_TOTAL_MISSING');
assert(Array.isArray(stats?.rows)&&stats.rows.length>0,'STATISTICS_ROWS_MISSING');

const counts={total:stats.rows.length,'1x2':0,ah:0,ou:0,btts:0,corners:0,cards:0,other:0};
for(const row of stats.rows) counts[group(row)]++;
for(const k of ['1x2','ah','ou','btts','corners','cards','other']){
  assert(Number.isSafeInteger(counts[k])&&counts[k]>=0,`STATISTICS_GROUP_INVALID:${k}`);
}
assert.equal(counts['1x2']+counts.ah+counts.ou+counts.btts+counts.corners+counts.cards+counts.other,counts.total,'STATISTICS_GROUP_SUM_MISMATCH');

console.log('BALL46_RESTORE_PERFORMANCE_MARKETS_OK',JSON.stringify({
  before,
  active:target,
  total:stats.total,
  ledgerTotal:stats.ledgerTotal,
  pending:stats.pending,
  counts
}));
