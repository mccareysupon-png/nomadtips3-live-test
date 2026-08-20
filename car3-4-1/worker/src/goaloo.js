const DEFAULT_PRIMARY='https://live10.goaloo28.com/gf/data/bf_us.js';
const DEFAULT_ALT='https://live10.goaloo28.com/gf/data/bf_us1.js';
const DEFAULT_DETAIL_BASE='https://live10.goaloo28.com/match/live-';

export function number(value){
  if(value===null||value===undefined||value==='')return null;
  const n=Number(String(value).replace('%','').trim());
  return Number.isFinite(n)?n:null;
}

function jsScalar(raw){
  const v=String(raw??'').trim();
  if(!v||v==='null'||v==='undefined')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(v))return Number(v);
  if(/^(true|false)$/i.test(v))return v.toLowerCase()==='true';
  return v;
}

function splitJsArray(body){
  const out=[];let token='',quote=null,escape=false;
  for(const ch of body){
    if(quote){
      if(escape){token+=ch;escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      token+=ch;continue;
    }
    if(ch==='\''||ch==='"'){quote=ch;continue;}
    if(ch===','){out.push(jsScalar(token));token='';continue;}
    token+=ch;
  }
  out.push(jsScalar(token));
  return out;
}

function parseIndexedArrays(source,variable){
  const out=new Map();
  const re=new RegExp(`${variable}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');
  for(const m of String(source||'').matchAll(re))out.set(Number(m[1]),splitJsArray(m[2]));
  return out;
}

export function parseIndex(source){
  const A=parseIndexedArrays(source,'A');
  const B=parseIndexedArrays(source,'B');
  const all=[];
  for(const [index,row] of A.entries()){
    const stateCode=number(row[8]);
    if(stateCode===null)continue;
    const leagueRow=B.get(number(row[1]))||[];
    const start=String(row[6]??'');
    const clock=String(row[7]??'');
    let minute=null;
    if(stateCode===2)minute=45;
    else if(stateCode>0){
      const a=Date.parse(start.replace(' ','T')+'Z');
      const b=Date.parse(clock.replace(' ','T')+'Z');
      if(Number.isFinite(a)&&Number.isFinite(b)&&b>=a)minute=Math.max(1,Math.min(120,Math.round((b-a)/60000)));
    }
    all.push({
      index,
      id:String(row[0]),
      leagueId:leagueRow[0]??null,
      league:String(leagueRow[2]??'Goaloo Live'),
      home:String(row[4]??''),
      away:String(row[5]??''),
      kickoff:start||null,
      stateCode,
      status:stateCode===2?'HT':stateCode>0?'LIVE':stateCode===-1?'FT':'SCHEDULED',
      minute,
      score:{home:number(row[9])??0,away:number(row[10])??0},
      redCards:{home:number(row[13])??0,away:number(row[14])??0},
      yellowCards:{home:number(row[15])??0,away:number(row[16])??0},
      ahLine:number(row[21]),
      overUnderLine:number(row[25]),
      corners:{home:number(row[27]),away:number(row[28])}
    });
  }
  return {all,live:all.filter(m=>m.stateCode>0),matchCount:A.size,leagueCount:B.size};
}

function cleanText(v=''){
  return String(v).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/\s+/g,' ').trim();
}

function pairFromText(text,label){
  const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`(?:^|\\s)(\\d+(?:\\.\\d+)?%?)\\s+${esc}\\s+(\\d+(?:\\.\\d+)?%?)(?:\\s|$)`,'i'),
    new RegExp(`${esc}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?%?)\\s*[-–:]\\s*(\\d+(?:\\.\\d+)?%?)`,'i')
  ];
  for(const re of patterns){const m=text.match(re);if(m)return{home:number(m[1]),away:number(m[2])};}
  return {home:null,away:null};
}

function titleTeams(html){
  const title=(String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'';
  const text=cleanText(title);
  const m=text.match(/^(.+?)\s+vs\s+(.+?)\s+(?:Live|Livescore|Live Score|Live Scores|Football|Soccer)/i);
  return m?{home:m[1].trim(),away:m[2].trim()}:{home:'',away:''};
}

function coreStatsComplete(stats){
  return ['possession','attacks','dangerous_attacks','shots','shots_on_target','corners'].every(k=>stats[k]?.home!==null&&stats[k]?.away!==null);
}

export function parseDetail(seed,html,collectedAt=new Date().toISOString()){
  const text=cleanText(html);
  const title=titleTeams(html);
  const stats={
    possession:pairFromText(text,'Possession'),
    attacks:pairFromText(text,'Attack'),
    dangerous_attacks:pairFromText(text,'Dangerous Attack'),
    shots:pairFromText(text,'Shots'),
    shots_on_target:pairFromText(text,'Shots On Goal'),
    corners:pairFromText(text,'Corner Kicks'),
    yellow_cards:pairFromText(text,'Yellow Cards'),
    red_cards:pairFromText(text,'Red Cards')
  };
  if(stats.dangerous_attacks.home===null)stats.dangerous_attacks=pairFromText(text,'Dangerous attack');
  if(stats.corners.home===null&&seed.corners?.home!==null)stats.corners=seed.corners;
  if(stats.red_cards.home===null)stats.red_cards=seed.redCards;
  if(stats.yellow_cards.home===null)stats.yellow_cards=seed.yellowCards;
  const complete=coreStatsComplete(stats);
  return {
    source:'GOALOO',sourceMatchId:seed.id,league:seed.league,leagueId:seed.leagueId,
    home:title.home||seed.home,away:title.away||seed.away,kickoff:seed.kickoff,
    minute:seed.minute,status:seed.status,score:seed.score,stats,
    marketHints:{asianHandicapLine:seed.ahLine,overUnderLine:seed.overUnderLine},
    coreStatsComplete:complete,collectedAt,
    warnings:[...(complete?[]:['CORE_STATS_INCOMPLETE']),...(!title.home||!title.away?['DETAIL_TITLE_FALLBACK_TO_INDEX']:[]),...(seed.minute===null?['MINUTE_CLOCK_INCOMPLETE']:[])]
  };
}

async function readTextLimited(response,maxBytes){
  const declared=Number(response.headers.get('content-length'));
  if(Number.isFinite(declared)&&declared>maxBytes)throw new Error(`SOURCE_TOO_LARGE:${declared}`);
  if(!response.body)return response.text();
  const reader=response.body.getReader();
  const decoder=new TextDecoder();
  let bytes=0,out='';
  while(true){
    const {done,value}=await reader.read();
    if(done)break;
    bytes+=value.byteLength;
    if(bytes>maxBytes){await reader.cancel();throw new Error(`SOURCE_TOO_LARGE:>${maxBytes}`);}
    out+=decoder.decode(value,{stream:true});
  }
  out+=decoder.decode();
  return out;
}

async function fetchText(url,maxBytes,cacheSeconds){
  const response=await fetch(url,{headers:{'user-agent':'NOMADTIPS3-CAR3.4.1/1.0 (+source-monitor)','accept':'*/*','accept-language':'en-US,en;q=0.8'},cf:{cacheTtl:cacheSeconds,cacheEverything:true}});
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  return readTextLimited(response,maxBytes);
}

function intEnv(env,key,fallback,min,max){
  const n=Number(env?.[key]);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):fallback;
}

export async function discoverLive(env={}){
  const primary=env.GOALOO_INDEX_PRIMARY||DEFAULT_PRIMARY;
  const alt=env.GOALOO_INDEX_ALT||DEFAULT_ALT;
  const maxBytes=intEnv(env,'MAX_INDEX_BYTES',1500000,100000,5000000);
  const cacheSeconds=intEnv(env,'SOURCE_CACHE_SECONDS',10,0,60);
  const errors=[];
  for(const base of [primary,alt]){
    try{
      const url=`${base}${base.includes('?')?'&':'?'}t=${Math.floor(Date.now()/30000)}`;
      const parsed=parseIndex(await fetchText(url,maxBytes,cacheSeconds));
      if(parsed.all.length)return {...parsed,sourceUrl:base,errors};
      errors.push(`${base}:EMPTY_INDEX`);
    }catch(error){errors.push(`${base}:${String(error?.message||error)}`);}
  }
  return {all:[],live:[],matchCount:0,leagueCount:0,sourceUrl:null,errors};
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function run(){while(true){const i=next++;if(i>=items.length)return;try{out[i]=await fn(items[i],i);}catch(error){out[i]={error:String(error?.message||error),seed:items[i]};}}}
  await Promise.all(Array.from({length:Math.max(1,limit)},()=>run()));
  return out;
}

export async function hydrateLive(env,seeds,collectedAt=new Date().toISOString()){
  const detailBase=env.GOALOO_DETAIL_BASE||DEFAULT_DETAIL_BASE;
  const maxBytes=intEnv(env,'MAX_DETAIL_BYTES',750000,100000,3000000);
  const cacheSeconds=intEnv(env,'SOURCE_CACHE_SECONDS',10,0,60);
  const concurrency=intEnv(env,'FETCH_CONCURRENCY',3,1,6);
  const maxMatches=intEnv(env,'MAX_MATCHES_PER_REQUEST',24,1,50);
  const selected=seeds.slice(0,maxMatches);
  const results=await mapLimit(selected,concurrency,async seed=>parseDetail(seed,await fetchText(`${detailBase}${encodeURIComponent(seed.id)}`,maxBytes,cacheSeconds),collectedAt));
  return results.map((item,i)=>{
    if(!item?.error)return item;
    const seed=selected[i];
    return {
      source:'GOALOO',sourceMatchId:seed.id,league:seed.league,leagueId:seed.leagueId,home:seed.home,away:seed.away,
      kickoff:seed.kickoff,minute:seed.minute,status:seed.status,score:seed.score,
      stats:{possession:{home:null,away:null},attacks:{home:null,away:null},dangerous_attacks:{home:null,away:null},shots:{home:null,away:null},shots_on_target:{home:null,away:null},corners:seed.corners,red_cards:seed.redCards,yellow_cards:seed.yellowCards},
      marketHints:{asianHandicapLine:seed.ahLine,overUnderLine:seed.overUnderLine},coreStatsComplete:false,collectedAt,
      warnings:[`DETAIL_FETCH_FAILED:${item.error}`]
    };
  });
}
