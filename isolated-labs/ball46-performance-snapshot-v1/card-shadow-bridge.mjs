/*
 * BALL46 Snapshot V1 browser SHADOW bridge — isolated, unmounted and never
 * injected into Production. Never modifies DOM, intercepts fetch, or disables
 * legacy statistics refresh. Full card replacement is separately gated.
 */
export const CARD_FIELDS=[
  ['today','win','[data-b46-stat="today-win"]'],
  ['today','loss','[data-b46-stat="today-loss"]'],
  ['today','push','[data-b46-stat="today-push"]'],
  ['today','pending','[data-b46-stat="today-pending"]'],
  ['yesterday','win','[data-b46-stat="yesterday-win"]'],
  ['yesterday','loss','[data-b46-stat="yesterday-loss"]'],
  ['yesterday','push','[data-b46-stat="yesterday-push"]'],
  ['today','winRate','[data-b46-rate="today"]'],
  ['yesterday','winRate','[data-b46-rate="yesterday"]'],
  ['today','avgOdds','[data-b46-avg-odds="today"]'],
  ['yesterday','avgOdds','[data-b46-avg-odds="yesterday"]'],
  ['today','totalPicks','[data-b46-total="today"]'],
  ['yesterday','totalPicks','[data-b46-total="yesterday"]'],
];
const validCount=n=>Number.isSafeInteger(n)&&n>=0;
function sportDay(ms){
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',hourCycle:'h23'
  }).formatToParts(new Date(ms)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const day=p.year+'-'+p.month+'-'+p.day;
  if(Number(p.hour)>=6)return day;
  const [y,m,d]=day.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10);
}
export function validateBrowserSnapshot(data,now=Date.now()){
  if(data?.ok!==true||data?.schema!=='ball46-performance-snapshot-v1'
    ||data.londonDay?.timezone!=='Europe/London'||data.londonDay?.cutHour!==6
    ||data.londonDay?.today!==sportDay(now))throw Error('SNAPSHOT_CONTRACT_OR_DAY_MISMATCH');
  const generated=Date.parse(data.generatedAtUtc);
  if(!Number.isFinite(generated)||generated>now||now-generated>360000)throw Error('SNAPSHOT_EXPIRED');
  for(const day of ['today','yesterday']){
    const b=data[day];
    if(!b||!['win','loss','push','pending','totalPicks'].every(k=>validCount(b[k]))
      ||!['winRate','avgOdds'].every(k=>typeof b[k]==='string')
      ||b.totalPicks!==b.win+b.loss+b.push+b.pending)
      throw Error('SNAPSHOT_COUNTERS_INVALID');
  }
  if(data.yesterday.pending!==0)throw Error('SNAPSHOT_OLD_PENDING_INVALID');
  return true;
}
export function assertPreviewEndpoint(url){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||!parsed.hostname.startsWith('ball46-performance-snapshot-preview-only.')
    ||!parsed.hostname.endsWith('.workers.dev')
    ||parsed.pathname!=='/api/performance/snapshot'
    ||parsed.username||parsed.password||parsed.hash)throw Error('UNTRUSTED_SNAPSHOT_ORIGIN');
  return url;
}
export async function auditCardSnapshot({endpoint,fetchFn=fetch,documentRef=document,nowMs=Date.now()}){
  assertPreviewEndpoint(endpoint);
  const response=await fetchFn(endpoint,{method:'GET',cache:'no-store',
    headers:{Accept:'application/json'},redirect:'manual'});
  if(!response.ok)throw Error('SNAPSHOT_PREVIEW_HTTP_'+response.status);
  const json=await response.json();
  validateBrowserSnapshot(json,nowMs);
  const card=documentRef.getElementById('ball46-daily-performance');
  if(!card)throw Error('EXISTING_PRODUCTION_CARD_NOT_FOUND');
  const comparisons=[];
  for(const [day,field,selector] of CARD_FIELDS){
    const element=card.querySelector(selector),expected=String(json[day][field]);
    const observed=element?.textContent?.trim()??null;
    const rendered=observed!==null&&observed!==''&&observed!=='—';
    comparisons.push({day,field,selector,rendered,
      equal:rendered?observed===expected:null, // NULL if not yet rendered
      expected,observed});
  }
  return {mode:'SHADOW_READ_ONLY',productionDomMutations:0,
    visibleFieldsChecked:comparisons.filter(x=>x.rendered).length,
    missingFields:comparisons.filter(x=>!x.rendered).map(x=>x.field),
    mismatchFields:comparisons.filter(x=>x.equal===false).map(x=>x.day+'.'+x.field),
    comparisons};
}
export function enableSnapshotCardRenderer(){
  // Deny activation until all market subcards are validated and card fallback is tested.
  throw Error('MARKET_PARITY_AND_PRODUCTION_ASSET_GATES_NOT_YET_PASSED');
}
