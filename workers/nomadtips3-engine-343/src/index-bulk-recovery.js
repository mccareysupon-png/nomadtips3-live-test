import baseWorker, { Nomad343Engine as BaseNomad343Engine } from './index-bulk.js';
import { MARKET_RULES, settleMarketSignal } from './market-core.js';

const FINAL_API_BASE='https://api.5dollarfootballapi.com/v1';
const RECOVERY_VERSION='missing-final-v1';
const MAX_FINAL_LOOKUPS_PER_SCAN=6;
const MAX_SIGNALS=1600;

const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
const now=()=>Date.now();

function isFinished(f){
  const s=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();
  return f?.boardState==='finished'||/finished|full_time|full time|\bft\b|ended|\bfull\b/.test(s);
}
function isHalfComplete(f){
  if(isFinished(f))return true;
  const raw=`${f?.status??''} ${f?.statusCode??''}`.toLowerCase(),minute=num(f?.minute);
  return /half[_\s-]?time|halftime|\bbreak\b|\bsecond(?:\s+half)?\b|\b2h\b|\bht\b/.test(raw)||(minute!==null&&minute>=46);
}
function periodComplete(signal,fixture){
  const def=MARKET_RULES[signal?.market];
  if(!def)return false;
  return def.period==='HT'?isHalfComplete(fixture):isFinished(fixture);
}
function normalizeFinalFixture(raw){
  const d=raw?.data??raw;
  if(!d||typeof d!=='object'||d.id===undefined||d.id===null)return null;
  const status=String(d.status??d.status_code??'');
  const statusCode=d.status_code??d.statusCode??null;
  const finished=/finished|full_time|full time|\bft\b|ended|\bfull\b/i.test(`${status} ${statusCode}`);
  const minute=num(d.minute??d.elapsed??d.status?.minute??d.status?.elapsed);
  return {
    fixtureId:String(d.id??d.fixture_id),
    boardState:finished?'finished':(/live|in_play|in play|playing|half|\b1h\b|\b2h\b/i.test(`${status} ${statusCode}`)?'live':'unknown'),
    status,
    statusCode,
    minute,
    league:clone(d.league),
    home:clone(d.teams?.home??d.home),
    away:clone(d.teams?.away??d.away),
    goals:{
      home:num(d.goals?.home??d.score?.home),
      away:num(d.goals?.away??d.score?.away),
      halfHome:num(d.goals?.halfHome??d.goals?.half_home??d.score?.halfHome??d.score?.half_home),
      halfAway:num(d.goals?.halfAway??d.goals?.half_away??d.score?.halfAway??d.score?.half_away)
    },
    corners:{
      home:num(d.corners?.home),
      away:num(d.corners?.away),
      halfHome:num(d.corners?.halfHome??d.corners?.half_home),
      halfAway:num(d.corners?.halfAway??d.corners?.half_away)
    },
    cards:clone(d.cards)
  };
}
async function fetchExactFixture(env,fixtureId){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const url=`${FINAL_API_BASE}/fixtures/${encodeURIComponent(fixtureId)}?include=events,stats`;
  const res=await fetch(url,{headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`},cf:{cacheTtl:0,cacheEverything:false}});
  const text=await res.text();let payload=null;try{payload=JSON.parse(text)}catch{}
  if(!res.ok)throw new Error(`FINAL_FIXTURE_HTTP_${res.status}`);
  if(!payload||Number(payload.success??1)!==1)throw new Error('FINAL_FIXTURE_BAD_PAYLOAD');
  const fixture=normalizeFinalFixture(payload);
  if(!fixture)throw new Error('FINAL_FIXTURE_SHAPE');
  return fixture;
}
function selectMissingFixtureGroups(signals,currentIds){
  const groups=new Map();
  for(const s of signals){
    if(s?.status!=='PENDING')continue;
    const id=String(s?.fixtureId??'');if(!id||currentIds.has(id))continue;
    const g=groups.get(id)||{fixtureId:id,signals:[],latest:0,oldest:Number.MAX_SAFE_INTEGER};
    const t=Number(s?.createdAt||0);g.signals.push(s);g.latest=Math.max(g.latest,t);g.oldest=Math.min(g.oldest,t||Number.MAX_SAFE_INTEGER);groups.set(id,g);
  }
  const rows=[...groups.values()];
  const newest=[...rows].sort((a,b)=>b.latest-a.latest).slice(0,3);
  const chosen=new Map(newest.map(x=>[x.fixtureId,x]));
  for(const g of [...rows].sort((a,b)=>a.oldest-b.oldest)){
    if(chosen.size>=MAX_FINAL_LOOKUPS_PER_SCAN)break;
    chosen.set(g.fixtureId,g);
  }
  return [...chosen.values()];
}

export class Nomad343Engine extends BaseNomad343Engine{
  async scan(){
    const base=await super.scan();
    if(!base?.ok)return base;
    const recovery=await this.recoverMissingFinals();
    const merged={...base,missingFinalRecovery:recovery};
    await this.ctx.storage.put('lastScan',merged);
    return merged;
  }

  async recoverMissingFinals(){
    const signals=await this.ctx.storage.get('signals')||[];
    let hub=null;
    try{
      const hr=await this.env.HUB.fetch('https://hub.internal/snapshot');
      hub=await hr.json();
      if(!hr.ok||hub?.ok!==true)throw new Error(hub?.error||`HUB_HTTP_${hr.status}`);
    }catch(error){
      return {version:RECOVERY_VERSION,ok:false,lookups:0,settled:0,unresolved:0,error:String(error?.message||error)};
    }
    const currentIds=new Set((hub.fixtures||[]).map(f=>String(f?.fixtureId??'')).filter(Boolean));
    const groups=selectMissingFixtureGroups(signals,currentIds);
    let lookups=0,settled=0,unresolved=0,finishedFixtures=0;const errors=[];
    for(const g of groups){
      try{
        const fixture=await fetchExactFixture(this.env,g.fixtureId);lookups++;
        if(!isFinished(fixture)&&!isHalfComplete(fixture))continue;
        if(isFinished(fixture))finishedFixtures++;
        for(const s of g.signals){
          if(s.status!=='PENDING'||!periodComplete(s,fixture))continue;
          const result=settleMarketSignal(s,fixture);
          if(!result){
            if(isFinished(fixture)){
              s.status='UNRESOLVED';s.settlementError='FINAL_DATA_UNAVAILABLE';s.settledAt=s.settledAt||now();unresolved++;
            }
            continue;
          }
          s.status='SETTLED';s.result=result;s.finalScore=clone(fixture.goals);s.finalCorners=clone(fixture.corners);s.finalCards=clone(fixture.cards);s.settledAt=now();s.settlementError=null;s.settlementSource='DIRECT_FINAL_FIXTURE';settled++;
        }
      }catch(error){lookups++;errors.push({fixtureId:g.fixtureId,error:String(error?.message||error)})}
    }
    if(settled||unresolved)await this.ctx.storage.put('signals',signals.slice(-MAX_SIGNALS));
    return {version:RECOVERY_VERSION,ok:true,candidates:groups.length,lookups,finishedFixtures,settled,unresolved,errors};
  }
}

export default baseWorker;
