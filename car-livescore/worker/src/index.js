const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const SOURCE_INDEX='https://live10.goaloo28.com/gf/data/bf_us.js';
const SOURCE_INDEX_ALT='https://live10.goaloo28.com/gf/data/bf_us1.js';
const SOURCE_DETAIL_IN='https://live10.goaloo28.com/gf/data/detailIn.js';
const DEFAULT_REFRESH_SECONDS=20;
const DETAIL_IN_CORE_MAP={0:'corners',4:'shots',5:'shots_on_target',6:'attacks',7:'dangerous_attacks',11:'possession'};

const number=value=>{
  if(value===null||value===undefined||value==='')return null;
  const n=Number(String(value).replace('%','').trim());
  return Number.isFinite(n)?n:null;
};

const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{
  status,
  headers:{...JSON_HEADERS,'cache-control':cache}
});

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
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch===','){out.push(jsScalar(token));token='';continue;}
    token+=ch;
  }
  out.push(jsScalar(token));
  return out;
}

function parseIndexedArrays(source,variable){
  const out=new Map();
  const re=new RegExp(`${variable}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');
  for(const match of String(source||'').matchAll(re))out.set(Number(match[1]),splitJsArray(match[2]));
  return out;
}

function toIso(value){
  const text=String(value||'').trim();
  if(!text)return null;
  const ms=Date.parse(text.replace(' ','T')+'Z');
  return Number.isFinite(ms)?new Date(ms).toISOString():null;
}

function matchStatus(stateCode){
  if(stateCode===-1)return'FT';
  if(stateCode===0)return'UPCOMING';
  if(stateCode===2)return'HT';
  if(stateCode>0)return'LIVE';
  return'OTHER';
}

function parseIndex(source){
  const A=parseIndexedArrays(source,'A');
  const B=parseIndexedArrays(source,'B');
  const matches=[];

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

    matches.push({
      index,
      id:String(row[0]??index),
      leagueId:leagueRow[0]??row[1]??null,
      league:String(leagueRow[2]??leagueRow[1]??'Football'),
      leagueShort:String(leagueRow[3]??''),
      home:String(row[4]??''),
      away:String(row[5]??''),
      kickoffUtc:toIso(start),
      status:matchStatus(stateCode),
      stateCode,
      minute,
      score:{home:number(row[9])??0,away:number(row[10])??0},
      cards:{
        red:{home:number(row[13])??0,away:number(row[14])??0},
        yellow:{home:number(row[15])??0,away:number(row[16])??0}
      },
      stats:{
        corners:{home:number(row[27]),away:number(row[28])}
      }
    });
  }

  return matches;
}

function parseDetailInStats(source,allowedIds=null){
  const out=new Map();
  const assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const match of String(source||'').matchAll(assignment)){
    const id=String(match[1]);
    if(allowedIds&&!allowedIds.has(id))continue;
    const stats={};
    const rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of match[2].matchAll(rowRe)){
      const key=DETAIL_IN_CORE_MAP[Number(row[1])];
      if(!key)continue;
      const home=number(row[2]),away=number(row[3]);
      if(home!==null&&away!==null)stats[key]={home,away};
    }
    if(Object.keys(stats).length)out.set(id,stats);
  }
  return out;
}

async function fetchText(url,seconds){
  const bucket=Math.floor(Date.now()/(seconds*1000));
  const response=await fetch(`${url}?t=${bucket}`,{
    headers:{
      'user-agent':'nomadtips3-live-score/1.0',
      'accept':'*/*',
      'accept-language':'en-US,en;q=0.8'
    },
    cf:{cacheTtl:seconds,cacheEverything:true}
  });
  if(!response.ok)throw new Error(`SOURCE_HTTP_${response.status}`);
  return response.text();
}

async function fetchIndex(seconds){
  const errors=[];
  for(const url of [SOURCE_INDEX,SOURCE_INDEX_ALT]){
    try{
      const text=await fetchText(url,seconds);
      const matches=parseIndex(text);
      if(matches.length)return{matches,errors};
    }catch(error){errors.push(String(error?.message||error));}
  }
  return{matches:[],errors};
}

function mergeStats(matches,detailMap){
  let detailed=0;
  for(const match of matches){
    const extra=detailMap.get(String(match.id));
    if(!extra)continue;
    match.stats={...(match.stats||{}),...extra};
    detailed++;
  }
  return detailed;
}

function summary(matches){
  const live=matches.filter(m=>m.status==='LIVE'||m.status==='HT').length;
  const finished=matches.filter(m=>m.status==='FT').length;
  const upcoming=matches.filter(m=>m.status==='UPCOMING').length;
  return{
    total:matches.length,
    live,
    finished,
    upcoming,
    leagues:new Set(matches.map(m=>m.league).filter(Boolean)).size
  };
}

function sortMatches(matches){
  const rank=status=>status==='LIVE'?0:status==='HT'?1:status==='UPCOMING'?2:status==='FT'?3:4;
  return [...matches].sort((a,b)=>{
    const r=rank(a.status)-rank(b.status);
    if(r)return r;
    if((a.league||'')!==(b.league||''))return String(a.league||'').localeCompare(String(b.league||''));
    const ta=Date.parse(a.kickoffUtc||'')||0,tb=Date.parse(b.kickoffUtc||'')||0;
    return a.status==='FT'?tb-ta:ta-tb;
  });
}

async function buildPayload(env){
  const refreshSeconds=Math.max(10,Math.min(60,Number(env.SOURCE_REFRESH_SECONDS||DEFAULT_REFRESH_SECONDS)));
  const [{matches,errors},detailResult]=await Promise.all([
    fetchIndex(refreshSeconds),
    fetchText(SOURCE_DETAIL_IN,refreshSeconds).then(value=>({ok:true,value})).catch(error=>({ok:false,error:String(error?.message||error)}))
  ]);

  const ids=new Set(matches.map(m=>String(m.id)));
  const detailMap=detailResult.ok?parseDetailInStats(detailResult.value,ids):new Map();
  const detailed=mergeStats(matches,detailMap);
  const ordered=sortMatches(matches);

  return{
    ok:true,
    service:'CAR LIVESCORE',
    generatedAt:new Date().toISOString(),
    refreshSeconds,
    summary:summary(ordered),
    detailedMatches:detailed,
    matches:ordered,
    sourceHealth:{
      index:matches.length?'OK':'EMPTY',
      details:detailResult.ok?'OK':'DEGRADED',
      errors:[...errors,...(detailResult.ok?[]:[detailResult.error])].slice(0,8)
    }
  };
}

async function cachedScores(request,env){
  const cache=caches.default;
  const key=new Request(new URL('/scores',request.url).toString(),{method:'GET'});
  const hit=await cache.match(key);
  if(hit)return hit;

  const payload=await buildPayload(env);
  const ttl=Math.max(10,Math.min(60,Number(env.SOURCE_REFRESH_SECONDS||DEFAULT_REFRESH_SECONDS)));
  const response=json(payload,200,`public, max-age=${Math.min(10,ttl)}, s-maxage=${ttl}, stale-while-revalidate=20`);
  await cache.put(key,response.clone());
  return response;
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);

    const url=new URL(request.url);
    if(url.pathname==='/health'){
      return json({ok:true,service:'CAR LIVESCORE',mode:'ISOLATED',generatedAt:new Date().toISOString()});
    }
    if(url.pathname==='/scores'){
      try{return await cachedScores(request,env);}
      catch(error){return json({ok:false,service:'CAR LIVESCORE',error:String(error?.message||error),generatedAt:new Date().toISOString()},502);}
    }
    return json({ok:true,service:'CAR LIVESCORE',routes:['/health','/scores']});
  }
};
