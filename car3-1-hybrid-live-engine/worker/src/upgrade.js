import baseWorker from './index.js';
export { Car31State } from './index.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const SOURCE_ODDS='https://live10.goaloo28.com/gf/data/odds/en/runOddsData_8.txt';
const SOURCE_DETAIL='https://live10.goaloo28.com/gf/data/detail.js';
const ENRICH_SECONDS=15;

const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...JSON_HEADERS,'cache-control':cache}});

function marketOdd(raw,market){
  const v=number(raw); if(v===null)return null;
  if(market==='1X2')return v;
  // AH/O-U public live feed uses HK-style prices in the common 0.xx-1.xx range.
  // Keep raw alongside decimal so runtime checks can detect a format change.
  return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;
}

export function parseRunOdds(source){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;
    const parts=raw.split('!'),id=String(parts.shift()||'').trim();
    if(!/^\d+$/.test(id))continue;
    const rows=parts.map(p=>String(p).split(',').map(x=>number(x)));
    const ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    const record={
      oneXtwo:one.length>=3?{home:marketOdd(one[0],'1X2'),draw:marketOdd(one[1],'1X2'),away:marketOdd(one[2],'1X2'),raw:{home:one[0],draw:one[1],away:one[2]}}:null,
      asianHandicap:ah.length>=3?{home:marketOdd(ah[0],'AH'),line:number(ah[1]),away:marketOdd(ah[2],'AH'),raw:{home:ah[0],away:ah[2]}}:null,
      overUnder:ou.length>=3?{over:marketOdd(ou[0],'OU'),line:number(ou[1]),under:marketOdd(ou[2],'OU'),raw:{over:ou[0],under:ou[2]}}:null,
      providerCompanyId:8
    };
    if(record.oneXtwo||record.asianHandicap||record.overUnder)out.set(id,record);
  }
  return out;
}

// Only codes confirmed from the public client are named. Other codes remain generic.
const DETAIL_TYPE={1:'GOAL',11:'SUBSTITUTION'};
export function parseDetailEvents(source,allowedIds=null){
  const out=new Map(),re=/rq\[\d+\]\s*=\s*["']([^"']*)["']\s*;?/g;
  for(const m of String(source||'').matchAll(re)){
    const p=m[1].split('^'),id=String(p[0]||'').trim();
    if(!id||(allowedIds&&!allowedIds.has(id)))continue;
    const side=String(p[1]||'0')==='1'?'AWAY':'HOME',code=number(p[2]),minute=number(String(p[3]||'').replace(/[^\d]/g,'')),detail=String(p[4]||'').trim();
    const event={minute,type:DETAIL_TYPE[code]||`EVENT ${code??'?'}`,code,team:side,detail};
    if(!out.has(id))out.set(id,[]); out.get(id).push(event);
  }
  for(const events of out.values())events.sort((a,b)=>(a.minute??999)-(b.minute??999));
  return out;
}

const pair=(obj,key)=>({home:number(obj?.[key]?.home)||0,away:number(obj?.[key]?.away)||0});
const delta=(cur,prev,key)=>{const c=pair(cur.stats,key),p=pair(prev?.stats,key);return{home:c.home-p.home,away:c.away-p.away};};
const sideOf=d=>d.home>d.away?'HOME':d.away>d.home?'AWAY':null;
export function deriveActivity(current,previous){
  if(!previous)return{type:'POSSESSION',team:(number(current.stats?.possession?.home)||0)>=(number(current.stats?.possession?.away)||0)?'HOME':'AWAY',strength:0};
  const goal={home:(number(current.score?.home)||0)-(number(previous.score?.home)||0),away:(number(current.score?.away)||0)-(number(previous.score?.away)||0)};
  const checks=[['GOAL',goal],['RED CARD',delta(current,previous,'red_cards')],['YELLOW CARD',delta(current,previous,'yellow_cards')],['CORNER',delta(current,previous,'corners')],['SHOT ON TARGET',delta(current,previous,'shots_on_target')],['SHOT',delta(current,previous,'shots')],['DANGEROUS ATTACK',delta(current,previous,'dangerous_attacks')],['ATTACK',delta(current,previous,'attacks')]];
  for(const [type,d] of checks){const team=sideOf(d);if(team)return{type,team,strength:Math.max(d.home,d.away)};}
  const hp=number(current.stats?.possession?.home)||0,ap=number(current.stats?.possession?.away)||0;
  return{type:'POSSESSION',team:hp>=ap?'HOME':'AWAY',strength:Math.abs(hp-ap)};
}

async function sourceText(url,seconds){
  const bucket=Math.floor(Date.now()/(seconds*1000));
  const response=await fetch(`${url}?t=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-CAR3.1-Live/2.1 (+public live monitor)','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:seconds,cacheEverything:true}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function baseJson(path,request,env){
  const u=new URL(request.url);u.pathname=path;u.search='';
  const r=await baseWorker.fetch(new Request(u.toString(),{method:'GET',headers:request.headers}),env);
  const data=await r.json().catch(()=>null);if(!r.ok||!data)throw new Error(`base ${path} HTTP ${r.status}`);return data;
}

async function enrichedLive(request,env){
  const bucket=Math.floor(Date.now()/(ENRICH_SECONDS*1000));
  const cache=typeof caches!=='undefined'?caches.default:null;
  const cacheKey=new Request(`https://car31-cache.invalid/live-enriched?b=${bucket}`);
  const hit=cache?await cache.match(cacheKey):null;if(hit)return hit;
  const [base,snapshotPayload,oddsResult,detailResult]=await Promise.all([
    baseJson('/live',request,env),
    baseJson('/snapshots',request,env).catch(()=>({snapshots:[]})),
    sourceText(SOURCE_ODDS,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)})),
    sourceText(SOURCE_DETAIL,ENRICH_SECONDS).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)}))
  ]);
  const ids=new Set((base.matches||[]).map(m=>String(m.sourceMatchId)));
  const oddsMap=oddsResult.ok?parseRunOdds(oddsResult.value):new Map();
  const eventMap=detailResult.ok?parseDetailEvents(detailResult.value,ids):new Map();
  const snaps=snapshotPayload.snapshots||[],prev=snaps.at(-2)||snaps.at(-1)||{matches:[]};
  let oddsMatched=0,eventMatches=0;
  const matches=(base.matches||[]).map(match=>{
    const id=String(match.sourceMatchId),odds=oddsMap.get(id)||match.odds,events=eventMap.get(id)||match.events||[];
    if(oddsMap.has(id))oddsMatched++;if(events.length)eventMatches++;
    const old=(prev.matches||[]).find(x=>String(x.id)===id);
    return{...match,odds,events,activity:deriveActivity(match,old?{...old,stats:old.stats||{}}:null),enrichment:{odds:oddsMap.has(id)?'LIVE':'BASE',events:events.length?'LIVE':'SNAPSHOT'}};
  });
  const payload={...base,matches,enrichedAt:new Date().toISOString(),enrichment:{oddsFeed:oddsResult.ok?'OK':'ERROR',eventFeed:detailResult.ok?'OK':'ERROR',oddsMatched,eventMatches,matchCount:matches.length,oddsError:oddsResult.ok?null:oddsResult.error,eventError:detailResult.ok?null:detailResult.error}};
  const response=json(payload,200,'public, max-age=8');if(cache)await cache.put(cacheKey,response.clone());return response;
}

async function sourceStatus(request,env){
  const r=await enrichedLive(request,env),p=await r.clone().json();
  const samples=(p.matches||[]).filter(m=>m.enrichment?.odds==='LIVE').slice(0,5).map(m=>({id:m.sourceMatchId,home:m.home,away:m.away,oneXtwo:m.odds?.oneXtwo,asianHandicap:m.odds?.asianHandicap,overUnder:m.odds?.overUnder,eventCount:m.events?.length||0,activity:m.activity}));
  return json({ok:true,brand:'NOMADTIPS3',generatedAt:p.enrichedAt,enrichment:p.enrichment,samples});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/live')return enrichedLive(request,env);
    if(request.method==='GET'&&url.pathname==='/debug/source-status')return sourceStatus(request,env);
    if(request.method==='GET'&&url.pathname==='/health'){
      const r=await baseWorker.fetch(request,env,ctx),p=await r.json().catch(()=>({ok:false}));
      return json({...p,enrichmentLayer:'V2',enrichmentRefreshSeconds:ENRICH_SECONDS});
    }
    return baseWorker.fetch(request,env,ctx);
  },
  async scheduled(event,env,ctx){return baseWorker.scheduled(event,env,ctx);}
};
