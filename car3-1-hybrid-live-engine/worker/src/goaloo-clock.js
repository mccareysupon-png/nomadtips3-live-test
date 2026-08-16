const SOURCE_INDEX='https://live10.goaloo28.com/gf/data/bf_us.js';
const SOURCE_INDEX_ALT='https://live10.goaloo28.com/gf/data/bf_us1.js';

function scalar(raw){
  const value=String(raw??'').trim();
  if(!value||value==='null'||value==='undefined')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);
  if(/^(true|false)$/i.test(value))return value.toLowerCase()==='true';
  return value;
}

function splitJsArray(body){
  const out=[];
  let token='',quote=null,escape=false;
  for(const ch of String(body||'')){
    if(quote){
      if(escape){token+=ch;escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      token+=ch;
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch===','){out.push(scalar(token));token='';continue;}
    token+=ch;
  }
  out.push(scalar(token));
  return out;
}

function parseGoalooTime(value){
  const text=String(value??'').trim();
  if(!text)return null;
  const ms=Date.parse(text.replace(' ','T')+'Z');
  return Number.isFinite(ms)?ms:null;
}

export function parseGoalooClockSource(source){
  const clocks=new Map();
  const re=/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g;
  for(const match of String(source||'').matchAll(re)){
    const row=splitJsArray(match[2]);
    const id=String(row[0]??'').trim();
    const stateCode=Number(row[8]);
    if(!id||!Number.isFinite(stateCode))continue;

    const sourceStart=String(row[6]??'').trim();
    const sourceClock=String(row[7]??'').trim();
    let elapsedSeconds=null;
    const status=stateCode===2?'HT':stateCode>0?'LIVE':stateCode===-1?'FT':'SCHEDULED';

    if(stateCode===2){
      elapsedSeconds=45*60;
    }else if(stateCode>0){
      const startMs=parseGoalooTime(sourceStart);
      const clockMs=parseGoalooTime(sourceClock);
      if(startMs!==null&&clockMs!==null&&clockMs>=startMs){
        elapsedSeconds=Math.max(0,Math.min(120*60,Math.round((clockMs-startMs)/1000)));
      }
    }

    clocks.set(id,{id,stateCode,status,elapsedSeconds,sourceStart,sourceClock});
  }
  return clocks;
}

export function attachGoalooClock(match,clock){
  if(!match||!clock)return match;
  const sourceMinute=Number(match.minute);
  const elapsed=Number(clock.elapsedSeconds);
  let accepted=false;

  if(clock.status==='HT'&&String(match.status||'').toUpperCase().includes('HT')){
    accepted=true;
  }else if(Number.isFinite(elapsed)&&Number.isFinite(sourceMinute)){
    // CAR 3.1 already derives its minute from these Goaloo fields. Expose seconds
    // only when the detailed source clock agrees with the engine's current minute.
    accepted=Math.abs(Math.round(elapsed/60)-Math.round(sourceMinute))<=1;
  }

  if(!accepted)return{
    ...match,
    goalooClock:{source:'BF_US_FIELDS_6_7_8',verified:false,stateCode:clock.stateCode,sourceStart:clock.sourceStart,sourceClock:clock.sourceClock}
  };

  return{
    ...match,
    goalooElapsedSeconds:elapsed,
    goalooClock:{source:'BF_US_FIELDS_6_7_8',verified:true,stateCode:clock.stateCode,status:clock.status,elapsedSeconds:elapsed,sourceStart:clock.sourceStart,sourceClock:clock.sourceClock}
  };
}

async function fetchSource(url){
  const bucket=Math.floor(Date.now()/5000);
  const response=await fetch(`${url}?clock=${bucket}`,{
    headers:{'user-agent':'NOMADTIPS3-CAR3.1-Live/3.0 (+Goaloo source clock)','accept':'*/*','accept-language':'en-US,en;q=0.8'},
    cf:{cacheTtl:5,cacheEverything:true}
  });
  if(!response.ok)throw new Error(`Goaloo clock HTTP ${response.status}`);
  return response.text();
}

export async function fetchGoalooClockMap(){
  const errors=[];
  for(const url of [SOURCE_INDEX,SOURCE_INDEX_ALT]){
    try{
      const source=await fetchSource(url);
      const clocks=parseGoalooClockSource(source);
      if(clocks.size)return{clocks,source:url,errors};
    }catch(error){errors.push(String(error?.message||error));}
  }
  throw new Error(errors.join(' | ')||'Goaloo clock source unavailable');
}

export async function enrichLiveResponseWithGoalooClock(response){
  const payload=await response.clone().json().catch(()=>null);
  if(!response.ok||!payload||!Array.isArray(payload.matches))return response;
  try{
    const {clocks,source}=await fetchGoalooClockMap();
    const matches=payload.matches.map(match=>attachGoalooClock(match,clocks.get(String(match.sourceMatchId))));
    const verified=matches.filter(match=>match.goalooClock?.verified).length;
    return new Response(JSON.stringify({...payload,matches,goalooClockPipe:{source,verified,total:matches.length,mode:'SOURCE_ONLY'}},null,2),{
      status:response.status,
      headers:{...Object.fromEntries(response.headers),'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  }catch(error){
    return new Response(JSON.stringify({...payload,goalooClockPipe:{source:null,verified:0,total:payload.matches.length,mode:'SOURCE_ONLY',error:String(error?.message||error)}},null,2),{
      status:response.status,
      headers:{...Object.fromEntries(response.headers),'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
    });
  }
}
