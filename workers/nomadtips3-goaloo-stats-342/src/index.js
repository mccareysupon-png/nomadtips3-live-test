const VERSION='3.42-goaloo-stats-v1';
const SOURCE='Goaloo';
const INDEX_URLS=[
  'https://live10.goaloo28.com/gf/data/bf_us.js',
  'https://live10.goaloo28.com/gf/data/bf_us1.js',
];
const STATS_URL='https://live10.goaloo28.com/gf/data/detailIn.js';
const CACHE_SECONDS=5;
const REQUEST_TIMEOUT_MS=7000;

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:HEADERS});
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null};

function scalar(raw){
  const value=String(raw??'').trim();
  if(!value||value==='null'||value==='undefined')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(/^(true|false)$/i.test(value))return value.toLowerCase()==='true';
  return value;
}
function splitJsArray(body){
  const out=[];let token='',quote=null,escape=false;
  for(const ch of String(body||'')){
    if(quote){
      if(escape){token+=ch;escape=false;continue}
      if(ch==='\\'){escape=true;continue}
      if(ch===quote){quote=null;continue}
      token+=ch;continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue}
    if(ch===','){out.push(scalar(token));token='';continue}
    token+=ch;
  }
  out.push(scalar(token));return out;
}
function arrays(source,name){
  const out=new Map(),re=new RegExp(`${name}\\[(\\d+)\\]\\s*=\\s*\\[([^\\n;]*)\\]\\s*;`,'g');
  for(const m of String(source||'').matchAll(re))out.set(Number(m[1]),splitJsArray(m[2]));
  return out;
}
function parseSourceTime(value){
  const text=String(value??'').trim();if(!text)return null;
  const ms=Date.parse(text.replace(' ','T')+'Z');return Number.isFinite(ms)?ms:null;
}
export function parseLiveIndex(source){
  const A=arrays(source,'A'),B=arrays(source,'B'),all=[];
  for(const [,row] of A){
    const id=String(row[0]??'').trim(),stateCode=num(row[8]);
    if(!id||stateCode===null)continue;
    const leagueRow=B.get(num(row[1]))||[],sourceStart=String(row[6]??''),sourceClock=String(row[7]??'');
    const startMs=parseSourceTime(sourceStart),clockMs=parseSourceTime(sourceClock);
    let elapsedSeconds=null;
    if(stateCode===2)elapsedSeconds=45*60;
    else if(stateCode>0&&startMs!==null&&clockMs!==null&&clockMs>=startMs)elapsedSeconds=Math.max(0,Math.min(120*60,Math.round((clockMs-startMs)/1000)));
    all.push({
      sourceMatchId:id,
      league:String(leagueRow[2]??''),
      leagueId:leagueRow[0]??null,
      home:String(row[4]??''),
      away:String(row[5]??''),
      stateCode,
      status:stateCode===2?'HT':stateCode>0?'LIVE':stateCode===-1?'FT':'SCHEDULED',
      minute:elapsedSeconds===null?null:Math.floor(elapsedSeconds/60),
      score:{home:num(row[9]),away:num(row[10])},
    });
  }
  return all;
}

function validPair(pair,{percent=false}={}){
  const home=num(pair?.home),away=num(pair?.away);
  if(home===null||away===null||home<0||away<0)return null;
  if(percent){const total=home+away;if(total<98||total>102)return null}
  return {home,away};
}
function samePair(a,b){return Boolean(a&&b&&a.home===b.home&&a.away===b.away)}
export function parseStats(source){
  const out=new Map(),assignment=/tT_f\[(\d+)\]\s*=\s*(\[[\s\S]*?\])\s*;/g;
  for(const m of String(source||'').matchAll(assignment)){
    const rows={},rowRe=/\[\s*(\d+)\s*,\s*['"]([^'"]*)['"]\s*,\s*['"]([^'"]*)['"]\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
    for(const row of m[2].matchAll(rowRe))rows[Number(row[1])]={home:num(row[2]),away:num(row[3])};
    const shots=validPair(rows[4]);
    const sot=validPair(rows[5]);
    const code8=validPair(rows[8]);
    const possession=validPair(rows[11],{percent:true});
    let off=null,offProvenance=null;
    if(shots&&sot&&code8){
      const derived={home:shots.home-sot.home,away:shots.away-sot.away};
      if(derived.home>=0&&derived.away>=0&&samePair(code8,derived)){
        off=code8;
        offProvenance='GOALOO_CODE8_VALIDATED_BY_TOTAL_MINUS_SOT';
      }
    }
    out.set(String(m[1]),{
      shots,
      shots_on_target:sot,
      shots_off_target:off,
      possession,
      provenance:{
        shots_on_target:sot?'GOALOO_DETAILIN_CODE5':null,
        shots_off_target:offProvenance,
        possession:possession?'GOALOO_DETAILIN_CODE11':null,
      },
    });
  }
  return out;
}

async function sourceText(url,token){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort('timeout'),REQUEST_TIMEOUT_MS);
  try{
    const separator=url.includes('?')?'&':'?';
    const response=await fetch(`${url}${separator}nomad342stats=${token}`,{
      signal:ac.signal,
      headers:{'user-agent':'NOMADTIPS3-Goaloo-Stats/3.42','accept':'*/*','accept-language':'en-US,en;q=.8'},
      cf:{cacheTtl:CACHE_SECONDS,cacheEverything:true},
    });
    if(!response.ok)throw new Error(`source_http_${response.status}`);
    const text=await response.text();
    if(text.length<100)throw new Error('source_body_too_small');
    return text;
  }catch(error){
    if(error?.name==='AbortError')throw new Error('source_timeout');
    throw error;
  }finally{clearTimeout(timer)}
}
async function collect(){
  const token=Math.floor(Date.now()/(CACHE_SECONDS*1000));
  let indexText=null,indexUrl=null,lastError=null;
  for(const url of INDEX_URLS){
    try{indexText=await sourceText(url,token);indexUrl=url;break}catch(error){lastError=String(error?.message||error)}
  }
  if(!indexText)throw new Error(lastError||'goaloo_index_unavailable');
  const statsText=await sourceText(STATS_URL,token);
  const stats=parseStats(statsText),observedAt=Date.now();
  const matches=parseLiveIndex(indexText).filter(m=>m.stateCode>0).map(seed=>({
    ...seed,
    stats:stats.get(seed.sourceMatchId)||{shots:null,shots_on_target:null,shots_off_target:null,possession:null,provenance:{}},
  }));
  return {ok:true,version:VERSION,source:SOURCE,observedAt,indexUrl,statsUrl:STATS_URL,matches};
}

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
    if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health')return json({ok:true,version:VERSION,source:SOURCE,mode:'STATS_ONLY',feeds:{index:INDEX_URLS,stats:STATS_URL},markets:false,events:false,settlement:false});
    if(url.pathname==='/contract')return json({ok:true,version:VERSION,source:SOURCE,mode:'STATS_ONLY',fields:['shots_on_target','shots_off_target','possession'],identity:['sourceMatchId','home','away','league','minute','score'],shotOffRule:'code 8 accepted only when it equals total shots minus shots on target for both teams'});
    if(url.pathname==='/feed'){
      try{return json(await collect())}catch(error){return json({ok:false,version:VERSION,source:SOURCE,error:String(error?.message||error),matches:[]},502)}
    }
    return json({ok:false,error:'not_found'},404);
  }
};
