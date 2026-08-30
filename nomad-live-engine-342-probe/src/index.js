const SOURCE='https://www.totalcorner.com';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const json=(value,status=200)=>new Response(JSON.stringify(value,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});

async function fetchText(url,accept='*/*'){
  const response=await fetch(url,{cache:'no-store',headers:{'user-agent':UA,accept,'accept-language':'en-US,en;q=0.9','referer':`${SOURCE}/match/today/`,'x-requested-with':'XMLHttpRequest'}});
  return {url,status:response.status,contentType:response.headers.get('content-type'),text:await response.text()};
}
function parseJson(text){try{return JSON.parse(String(text).replace(/^\uFEFF/,'').trim())}catch{return null}}
function pickFields(row){
  const wanted=/^(id|sta|status|hg|ag|hc|ac|hyc|ayc|hrc|arc|att|attack|da|danger|shoot|shot|on|off|poss|possession|event|goal|corner|home|away)/i;
  const out={};for(const [k,v] of Object.entries(row||{}))if(wanted.test(k))out[k]=v;return out;
}
function shape(data){
  const rows=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:[];
  const keys=[...new Set(rows.slice(0,50).flatMap(x=>Object.keys(x||{})))].sort();
  const signalKeys=keys.filter(k=>/shoot|shot|poss|event|attack|danger|corner|goal|card|^h[gyrc]|^a[gyrc]|^on$|^off$/i.test(k));
  return {rowCount:rows.length,keys,signalKeys,samples:rows.slice(0,12).map(pickFields)};
}

export default {async fetch(request){
  const u=new URL(request.url);
  if(!['/','/probe'].includes(u.pathname))return json({ok:false,error:'not_found'},404);
  try{
    const now=Date.now();
    const paths=[
      `/match/api_ongoing_matches?v=${now}`,
      `/match/api_ongoing_matches?v=${now}&shoot_on=1&shoot_off=1&possession=1&events=1&simple_events=1`,
    ];
    const hits=[];
    for(const path of paths){
      const hit=await fetchText(`${SOURCE}${path}`,'application/json,text/plain,*/*');
      const parsed=parseJson(hit.text);
      hits.push({url:hit.url,status:hit.status,contentType:hit.contentType,length:hit.text.length,parsed:parsed!==null,shape:parsed!==null?shape(parsed):null,preview:parsed===null?hit.text.slice(0,1200):undefined});
    }
    return json({ok:true,observedAt:new Date().toISOString(),hits});
  }catch(error){return json({ok:false,error:String(error?.stack||error)},500);}
}};
