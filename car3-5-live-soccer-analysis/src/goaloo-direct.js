const INDEX=['https://live10.goaloo28.com/gf/data/bf_us.js','https://live10.goaloo28.com/gf/data/bf_us1.js'];
const DETAIL_IN='https://live10.goaloo28.com/gf/data/detailIn.js';
const ODDS_BASE='https://live10.goaloo28.com/gf/data/odds/en';
const FLASH='https://m.goaloo.com/flashdata/get';
const CORE={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};
const EVENT={20:'DANGEROUS ATTACK',21:'ATTACK',22:'POSSESSION',23:'GOAL',24:'YELLOW CARD',25:'RED CARD',26:'DANGEROUS FREE KICK',27:'PENALTY',28:'SHOT ON TARGET',29:'SHOT OFF TARGET',30:'SUBSTITUTION',31:'OFFSIDE',32:'FREE KICK',33:'THROW IN',34:'CORNER',35:'PENALTY GOAL',36:'PENALTY MISSED',37:'FOUL',38:'GOAL DISALLOWED',39:'DANGEROUS FREE KICK',40:'STOPPAGE',41:'SHOT BLOCKED',42:'INJURY TIME',43:'VAR CHECKING',44:'VAR RED CARD',45:'VAR GOAL DISALLOWED',46:'VAR PENALTY'};

const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null};
const clamp01=v=>{const n=num(v);return n===null?null:Math.max(0,Math.min(1,n))};
function scalar(v){v=String(v??'').trim();if(!v||v==='null'||v==='undefined')return null;if(/^-?\d+(?:\.\d+)?$/.test(v))return Number(v);return v}
function splitArray(body){const out=[];let token='',quote=null,esc=false;for(const ch of body){if(quote){if(esc){token+=ch;esc=false;continue}if(ch==='\\'){esc=true;continue}if(ch===quote){quote=null;continue}token+=ch;continue}if(ch==='"'||ch==="'"){quote=ch;continue}if(ch===','){out.push(scalar(token));token='';continue}token+=ch}out.push(scalar(token));return out}
function indexed(source,name){const out=new Map(),re=new RegExp(`${name}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');for(const m of String(source||'').matchAll(re))out.set(Number(m[1]),splitArray(m[2]));return out}

export function parseIndex(source){
  const A=indexed(source,'A'),B=indexed(source,'B'),all=[];
  for(const row of A.values()){
    const state=num(row[8]);if(state===null)continue;
    const league=B.get(num(row[1]))||[],start=String(row[6]??''),clock=String(row[7]??'');
    let minute=null;
    if(state===2)minute=45;
    else if(state>0){const a=Date.parse(start.replace(' ','T')+'Z'),b=Date.parse(clock.replace(' ','T')+'Z');if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)minute=Math.max(1,Math.min(120,Math.round((b-a)/60000)))}
    all.push({sourceMatchId:String(row[0]),leagueId:league[0]??null,league:String(league[2]??'Live'),home:String(row[4]??''),away:String(row[5]??''),kickoffUtc:start||null,stateCode:state,status:state===2?'HT':state>0?'LIVE':state===-1?'FT':'SCHEDULED',minute,score:{home:num(row[9])??0,away:num(row[10])??0},redCards:{home:num(row[13])??0,away:num(row[14])??0},yellowCards:{home:num(row[15])??0,away:num(row[16])??0},ahLine:num(row[21]),ouLine:num(row[25]),corners:{home:num(row[27])??0,away:num(row[28])??0}});
  }
  return{all,live:all.filter(m=>m.stateCode>0)};
}

export function parseStats(source,ids=null){
  const out=new Map(),re=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(re)){
    const id=String(m[1]);if(ids&&!ids.has(id))continue;
    const stats={},rr=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const r of m[2].matchAll(rr)){const key=CORE[Number(r[1])];if(!key)continue;const h=num(r[2]),a=num(r[3]);if(h!==null&&a!==null)stats[key]={home:h,away:a}}
    if(Object.keys(stats).length)out.set(id,stats);
  }
  return out;
}
const dec=(v,m)=>{const n=num(v);if(n===null)return null;if(m==='1X2')return n;return n>=0&&n<1.5?Number((1+n).toFixed(3)):n};
export function parseOdds(source,companyId=8){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw.includes('!'))continue;
    const p=raw.split('!'),id=String(p.shift()||'').trim();if(!/^\d+$/.test(id))continue;
    const rows=p.map(x=>x.split(',').map(num)),ah=rows[0]||[],one=rows[1]||[],ou=rows[2]||[];
    out.set(id,{oneXtwo:one.length>=3?{home:dec(one[0],'1X2'),draw:dec(one[1],'1X2'),away:dec(one[2],'1X2')}:null,asianHandicap:ah.length>=3?{home:dec(ah[0],'AH'),line:num(ah[1]),away:dec(ah[2],'AH')}:null,overUnder:ou.length>=3?{over:dec(ou[0],'OU'),line:num(ou[1]),under:dec(ou[2],'OU')}:null,providerCompanyId:Number(companyId)});
  }
  return out;
}
export const oddsUrl=companyId=>`${ODDS_BASE}/runOddsData_${[8,50].includes(Number(companyId))?Number(companyId):8}.txt`;

async function fetchText(url,ttl=5){
  const now=Date.now(),bucket=Math.floor(now/(ttl*1000)),u=`${url}${url.includes('?')?'&':'?'}t=${bucket}`;
  const r=await fetch(u,{headers:{'user-agent':'NOMADTIPS3-CAR3.5-Direct/1.0 (+public live monitor)','accept':'*/*','accept-language':'en-US,en;q=.8'},cf:{cacheTtl:ttl,cacheEverything:true}});
  if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);
  const headerAge=num(r.headers.get('age')),bucketAge=Math.max(0,(now-bucket*ttl*1000)/1000);
  return{body:await r.text(),freshnessSeconds:Number(Math.max(headerAge??0,bucketAge).toFixed(1)),fetchedAt:new Date(now).toISOString()};
}

export async function fetchDirectFrame({bookmakerCompanyId=8}={}){
  const company=[8,50].includes(Number(bookmakerCompanyId))?Number(bookmakerCompanyId):8;
  let parsed=null,indexMeta=null,lastError=null;
  for(const url of INDEX){
    try{indexMeta=await fetchText(url,5);parsed=parseIndex(indexMeta.body);if(parsed.all.length)break}catch(e){lastError=String(e?.message||e)}
  }
  if(!parsed||!parsed.all.length)throw new Error(lastError||'GOALOO_INDEX_EMPTY');
  const ids=new Set(parsed.live.map(m=>m.sourceMatchId));
  const [statsR,oddsR]=await Promise.allSettled([fetchText(DETAIL_IN,8),fetchText(oddsUrl(company),8)]);
  const stats=statsR.status==='fulfilled'?parseStats(statsR.value.body,ids):new Map();
  const odds=oddsR.status==='fulfilled'?parseOdds(oddsR.value.body,company):new Map();
  const collectedAt=new Date().toISOString();
  const freshness=Math.max(indexMeta?.freshnessSeconds??0,statsR.status==='fulfilled'?statsR.value.freshnessSeconds:999,oddsR.status==='fulfilled'?oddsR.value.freshnessSeconds:999);
  const live=parsed.live.map(seed=>{
    const core=stats.get(seed.sourceMatchId)||{},merged={...core,corners:core.corners||seed.corners,red_cards:seed.redCards,yellow_cards:seed.yellowCards};
    const coreKeys=['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'];
    const coreCount=coreKeys.filter(k=>num(merged[k]?.home)!==null&&num(merged[k]?.away)!==null).length,complete=coreCount===coreKeys.length;
    const matchOdds=odds.get(seed.sourceMatchId)||{oneXtwo:null,asianHandicap:seed.ahLine===null?null:{line:seed.ahLine,home:null,away:null},overUnder:seed.ouLine===null?null:{line:seed.ouLine,over:null,under:null},providerCompanyId:company};
    const oddsReady=Boolean(matchOdds.oneXtwo||matchOdds.asianHandicap||matchOdds.overUnder),matchConfidence=Math.max(50,Math.min(100,Math.round(50+(coreCount/coreKeys.length)*40+(oddsReady?10:0))));
    return{source:'GOALOO_DIRECT',sourceMatchId:seed.sourceMatchId,id:seed.sourceMatchId,league:seed.league,leagueId:seed.leagueId,home:seed.home,away:seed.away,kickoffUtc:seed.kickoffUtc,minute:seed.minute,status:seed.status,score:seed.score,stats:merged,odds:matchOdds,events:[],coreStatsComplete:complete,sourceFreshnessSeconds:freshness,collectedAt,matchConfidence,warnings:[...(complete?[]:['CORE_STATS_INCOMPLETE']),...(oddsR.status==='fulfilled'?[]:['ODDS_SOURCE_UNAVAILABLE'])]};
  });
  return{collectedAt,all:parsed.all,live,sourceHealth:{index:true,stats:statsR.status==='fulfilled',odds:oddsR.status==='fulfilled',bookmakerCompanyId:company,freshnessSeconds:freshness,statsError:statsR.status==='rejected'?String(statsR.reason):null,oddsError:oddsR.status==='rejected'?String(oddsR.reason):null}};
}

function rows(s){return String(s||'').split('^').map(x=>x.trim()).filter(Boolean)}
function pointRow(raw){const p=String(raw||'').split(','),pointId=num(p[0]),teamId=String(p[1]||''),x=clamp01(p[2]),y=clamp01(p[3]),eventId=String(p[4]||'');if(pointId===null||!teamId||x===null||y===null||!eventId)return null;return{pointId,teamId,x,y,eventId,playerNumber:String(p[5]||''),playerName:String(p[6]||'')}}
function graphRow(raw,meta,byEvent){const p=String(raw||'').split(','),id=num(p[0]),teamId=String(p[1]||''),code=num(p[2]);if(id===null||!teamId||code===null)return null;const eventId=String(p[9]||''),pts=eventId?(byEvent.get(eventId)||[]):[],team=teamId===String(meta.homeTeamId)?'HOME':teamId===String(meta.awayTeamId)?'AWAY':'UNKNOWN';return{id,teamId,team,code,type:EVENT[code]||`EVENT ${code}`,location:num(p[3]),state:num(p[4]),minute:num(p[5]),injuryMinute:num(p[6])||0,eventId,playerNumber:String(p[10]||''),playerName:String(p[11]||''),points:pts.map(x=>({id:x.pointId,x:x.x,y:x.y})),x:pts.length?pts.at(-1).x:null,y:pts.length?pts.at(-1).y:null,coordinateSource:pts.length?'SOURCE_XY':'EVENT_ONLY'}}
function chunk(source,id){return String(source||'').split('$$').map(x=>x.trim()).find(c=>c.split('!')[0]?.split('^')[0]===String(id))||''}
export function parseFlash(source,{matchId,homeTeamId=null,awayTeamId=null}={}){const c=chunk(source,matchId);if(!c)return{ok:false,matchId:String(matchId),events:[]};const parts=c.split('!'),h=String(parts[0]||'').split('^'),full=parts.length>=6,meta={matchId:String(h[0]||matchId),homeTeamId:full?String(h[4]||''):String(homeTeamId||''),awayTeamId:full?String(h[5]||''):String(awayTeamId||''),homeScore:num(full?h[6]:h[1]),awayScore:num(full?h[7]:h[2]),state:num(full?h[8]:h[3])};const pts=rows(parts[full?5:3]||'').map(pointRow).filter(Boolean),by=new Map();for(const p of pts){if(!by.has(p.eventId))by.set(p.eventId,[]);by.get(p.eventId).push(p)}for(const list of by.values())list.sort((a,b)=>a.pointId-b.pointId);return{ok:true,...meta,events:rows(parts[full?3:1]||'').map(r=>graphRow(r,meta,by)).filter(Boolean).sort((a,b)=>a.id-b.id)}}
export async function fetchAnimation(match){const id=String(match.sourceMatchId),full=await fetchText(`${FLASH}?id=${encodeURIComponent(id)}`,30),f=parseFlash(full.body,{matchId:id});if(!f.ok||!f.homeTeamId||!f.awayTeamId)throw new Error('FLASH_FULL_PARSE');let change=null;try{const c=await fetchText(`${FLASH}?chid=${encodeURIComponent(id)}`,2);change=parseFlash(c.body,{matchId:id,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId})}catch{}const map=new Map();for(const e of [...f.events,...(change?.ok?change.events:[])])map.set(String(e.id),e);const events=[...map.values()].sort((a,b)=>a.id-b.id).slice(-24);return{ok:true,matchId:id,generatedAt:new Date().toISOString(),pollMs:1500,source:'GOALOO_DIRECT',sourceCoordinateSystem:'NORMALIZED_0_1',match:{home:match.home,away:match.away,minute:match.minute,status:match.status,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,score:{home:change?.homeScore??f.homeScore,away:change?.awayScore??f.awayScore}},events,current:events.at(-1)||null}}
export {num};
