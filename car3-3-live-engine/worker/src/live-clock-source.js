const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type'
};
const SOURCES=['https://live10.goaloo28.com/gf/data/bf_us.js','https://live10.goaloo28.com/gf/data/bf_us1.js'];

const scalar=raw=>{const value=String(raw??'').trim();if(!value||value==='null'||value==='undefined')return null;if(/^-?\d+(?:\.\d+)?$/.test(value))return Number(value);return value;};
function splitRow(body){const out=[];let token='',quote=null,escape=false;for(const ch of String(body||'')){if(quote){if(escape){token+=ch;escape=false;continue;}if(ch==='\\'){escape=true;continue;}if(ch===quote){quote=null;continue;}token+=ch;continue;}if(ch==='"'||ch==="'"){quote=ch;continue;}if(ch===','){out.push(scalar(token));token='';continue;}token+=ch;}out.push(scalar(token));return out;}
function parseSourceTime(value){const text=String(value??'').trim();if(!text)return null;const ms=Date.parse(text.replace(' ','T')+'Z');return Number.isFinite(ms)?ms:null;}
export function parseGoalooLiveClocks(source){
  const clocks=[];const re=/A\[(\d+)\]\s*=\s*\[([^\n;]*)\]\s*;/g;
  for(const match of String(source||'').matchAll(re)){
    const row=splitRow(match[2]),id=String(row[0]??'').trim(),stateCode=Number(row[8]);if(!id||!Number.isFinite(stateCode))continue;
    const sourceStart=String(row[6]??'').trim(),sourceClock=String(row[7]??'').trim(),startMs=parseSourceTime(sourceStart),clockMs=parseSourceTime(sourceClock);
    const status=stateCode===2?'HT':stateCode>0?'LIVE':stateCode===-1?'FT':'SCHEDULED';let elapsedSeconds=null;
    if(stateCode===2)elapsedSeconds=45*60;else if(stateCode>0&&startMs!==null&&clockMs!==null&&clockMs>=startMs)elapsedSeconds=Math.max(0,Math.min(120*60,Math.round((clockMs-startMs)/1000)));
    clocks.push({id,stateCode,status,sourceStart,sourceClock,elapsedSeconds,minute:elapsedSeconds===null?null:Math.floor(elapsedSeconds/60)});
  }
  return clocks;
}
async function sourceText(){
  const errors=[],bucket=Math.floor(Date.now()/1000);
  for(const url of SOURCES){try{const r=await fetch(`${url}?car33clock=${bucket}`,{headers:{'user-agent':'NOMADTIPS3-CAR3.3-Clock/1.0','accept':'*/*','accept-language':'en-US,en;q=.8'},cf:{cacheTtl:1,cacheEverything:true}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text();if(text)return{text,url};}catch(e){errors.push(`${url}: ${String(e?.message||e)}`);}}
  throw new Error(errors.join(' | ')||'Goaloo live clock unavailable');
}
export async function handleLiveClockRequest(request){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  try{
    const {text,url}=await sourceText(),all=parseGoalooLiveClocks(text),live=all.filter(x=>x.stateCode>0);
    return new Response(JSON.stringify({ok:true,source:'GOALOO_BF_US_FIELDS_6_7_8',sourceUrl:url,mode:'SOURCE_SNAPSHOT_ONLY',generatedAt:new Date().toISOString(),pollMs:1500,clocks:live},null,2),{status:200,headers:HEADERS});
  }catch(error){return new Response(JSON.stringify({ok:false,source:'GOALOO_BF_US_FIELDS_6_7_8',mode:'SOURCE_SNAPSHOT_ONLY',generatedAt:new Date().toISOString(),clocks:[],error:String(error?.message||error)},null,2),{status:502,headers:HEADERS});}
}
