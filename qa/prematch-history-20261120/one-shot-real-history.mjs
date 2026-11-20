import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import {init,normalize,ingest,totals,coverage,DAY} from './history.mjs';
// An explicitly requested, one-shot diagnostic. Not the production shared gateway,
// not a backfill, never a cron. No retry, no redirects, no second provider request.
assert(process.env.GITHUB_RUN_ATTEMPT==='1','RERUN_NOT_ALLOWED');assert(process.env.FIVEDOLLAR_API_KEY,'NO_APPROVED_KEY');
const host='https://nomadtips3-5usd-hub-343.mccarey-supon.workers.dev';
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers';
async function version(n){const r=await fetch(root+'/scripts/'+n+'/deployments?per_page=1',{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN},signal:AbortSignal.timeout(15000)});const j=await r.json();assert(r.ok&&j.success);return j.result.deployments[0].versions}
const names=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343'];
const before=Object.fromEntries(await Promise.all(names.map(async n=>[n,await version(n)])));
const snap=await(await fetch(host+'/snapshot',{signal:AbortSignal.timeout(15000)})).json();
assert(snap.ok===true&&snap.cacheOnly===true&&snap.externalRequestsAdded===0&&!snap.stale&&snap.ageMs<30000&&Array.isArray(snap.fixtures),'CACHE_NOT_SAFE');
const now=Math.floor(Date.now()/1000);
const candidates=new Map();
for(const f of snap.fixtures){const id=Number(f.league?.id),h=Number(f.home?.id),a=Number(f.away?.id);if(!Number.isSafeInteger(id)||id<=0)continue;if(!candidates.has(id))candidates.set(id,{id,name:f.league?.name??String(id),upcoming:[],finished:0});const row=candidates.get(id);if(f.boardState==='scheduled'&&f.status==='scheduled'&&f.kickoffAt>now*1000&&Number.isSafeInteger(h)&&Number.isSafeInteger(a)&&h>0&&a>0&&h!==a)row.upcoming.push({h,a,fixture:f.fixtureId,kickoff:Math.floor(f.kickoffAt/1000)});if(f.boardState==='finished'&&f.status==='finished')row.finished++}
const selected=[...candidates.values()].filter(c=>c.upcoming.length).sort((a,b)=>b.upcoming.length-a.upcoming.length||b.finished-a.finished||a.id-b.id)[0];assert(selected,'NO_ACTUAL_LEAGUE');
const health=await(await fetch(host+'/health',{signal:AbortSignal.timeout(10000)})).json();
const guard={ok:health.ok,ageMs:health.ageMs,estimatedBulkRequestsPerMinute:health.estimatedBulkRequestsPerMinute,live:health.counts?.live,quotaObserved:health.bulkSpeedV3?.quotaObserved,accelerationAvailable:health.bulkSpeedV3?.accelerationAvailable,lastError:health.lastError,retryAfterSec:health.retryAfterSec};
const safe=health.ok===true&&Number.isFinite(health.ageMs)&&health.ageMs<30000&&health.bulkSpeedV3?.quotaObserved===true&&health.bulkSpeedV3?.accelerationAvailable===true&&!health.lastError&&!health.lastRateLimitAt&&!health.retryAfterSec&&Number.isFinite(health.estimatedBulkRequestsPerMinute)&&health.estimatedBulkRequestsPerMinute<=8&&Number.isFinite(health.counts?.live)&&health.counts.live<=3;
const report={scope:'ONE_SHOT_REAL_PROVIDER_HISTORY_DIAGNOSTIC',guard,league:{id:selected.id,name:selected.name,upcoming:selected.upcoming.length},attemptedRequests:0,realProviderCalls:0,sharedGatewayUsed:false,backgroundEnabled:false,productionWrites:0};
const persist=()=>{fs.mkdirSync('evidence',{recursive:true});fs.writeFileSync('evidence/real-provider-history.json',JSON.stringify(report,null,2));console.log('REAL_HISTORY_PROBE '+JSON.stringify(report))};
if(!safe){report.state='SKIPPED_LIVE_GUARD';persist();process.exit(0)}
const u=new URL('https://api.5dollarfootballapi.com/v1/leagues/'+selected.id+'/fixtures');
u.search=new URLSearchParams({status:'finished',start_time:String(now-120*DAY),end_time:String(now),per_page:'100',page:'1'});
report.attemptedRequests=1;report.state='REQUEST_SENT';
let res;try{res=await fetch(u,{method:'GET',redirect:'manual',headers:{Authorization:'Bearer '+process.env.FIVEDOLLAR_API_KEY,Accept:'application/json'},signal:AbortSignal.timeout(15000)})}catch(e){report.state='TRANSPORT_UNCERTAIN_NO_RETRY';persist();process.exit(0)}
report.realProviderCalls=1;report.http=res.status;report.quota={limit:res.headers.get('x-ratelimit-limit'),remaining:res.headers.get('x-ratelimit-remaining'),reset:res.headers.get('x-ratelimit-reset'),retryAfter:res.headers.get('retry-after')};
if(!res.ok){report.state='PROVIDER_HTTP_NO_RETRY';persist();process.exit(0)}
let j;try{j=await res.json()}catch{report.state='INVALID_JSON_NO_RETRY';persist();process.exit(0)}
const raw=Array.isArray(j.data)?j.data:[];report.response={success:j.success,count:raw.length,pagination:j.pagination??null,fields:Object.keys(raw[0]??{}),statusCodes:Object.fromEntries([...new Set(raw.map(x=>String(x.status_code??'missing')))].map(k=>[k,raw.filter(x=>String(x.status_code??'missing')===k).length]))};
const valid=raw.filter(f=>{const n=normalize(f);return n?.status==='finished'&&n.league===selected.id&&n.k>=now-120*DAY&&n.k<now});
report.schema={accepted:valid.length,rejected:raw.length-valid.length};
if(j.success!==1||!Array.isArray(j.data)||raw.length>100||j.pagination?.page!==1||typeof j.pagination?.has_more!=='boolean'||!raw.length||valid.length!==raw.length){report.state='SCHEMA_REVIEW_NO_RETRY';persist();process.exit(0)}
const sql=new DatabaseSync(':memory:');const db={exec:(s,...a)=>{const q=sql.prepare(s);return /^\s*SELECT/i.test(s)?q.all(...a):(q.run(...a),[])},transaction:fn=>{sql.exec('BEGIN');try{const x=fn();sql.exec('COMMIT');return x}catch(e){sql.exec('ROLLBACK');throw e}}};init(db);
const result=ingest(db,valid,now+1,{start:now-120*DAY,end:now});
const replay=ingest(db,valid,now+2,{start:now-120*DAY,end:now});
const summaries=selected.upcoming.map(f=>{const asOf=now+2;const h=coverage(db,f.h,f.kickoff,asOf),a=coverage(db,f.a,f.kickoff,asOf);return {fixtureId:f.fixture,homeTeamId:f.h,awayTeamId:f.a,homeMatches:h.count,awayMatches:a.count,eligible:h.complete&&a.complete}});
const byId=new Map(valid.map(f=>[Number(f.id),normalize(f)]));const stored=db.exec('SELECT * FROM result_version');
const exact=stored.filter(r=>{const n=byId.get(r.fixture_id);return n&&n.league===r.league_id&&n.home===r.home_id&&n.away===r.away_id&&n.hg===r.hg&&n.ag===r.ag&&n.k===r.kickoff}).length;
report.sqlite={...totals(db),exact,replayDuplicates:replay.duplicate,added:result.added,matchedUpcoming:summaries,eligible:summaries.filter(x=>x.eligible).length};
report.state='REAL_HISTORY_SCHEMA_PASS';report.completeSeason=false;report.additionalPagesAvailable=j.pagination.has_more;
sql.close();
const after=Object.fromEntries(await Promise.all(names.map(async n=>[n,await version(n)])));report.protectedUnchanged=JSON.stringify(before)===JSON.stringify(after);
persist();
