const BASE='https://live10.nowgoal26.com';
const CANDIDATES=['/gf/data/bf_us.js','/gf/data/bf_us1.js','/gf/data/detailIn.js','/gf/data/goaldata.js','/gf/data/gf_us.js'];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'*/*','accept-language':'en-US,en;q=0.8'},redirect:'follow'});
  const text=await r.text();
  return {url:r.url,status:r.status,type:r.headers.get('content-type')||'',length:text.length,text};
}
function scripts(html){
  const out=[]; const re=/<script[^>]+src=["']([^"']+)["'][^>]*>/gi; let m;
  while((m=re.exec(html))){try{out.push(new URL(m[1],BASE).href)}catch{}}
  return [...new Set(out)];
}
async function probe(){
  const home=await get(BASE+'/');
  const scriptUrls=scripts(home.text);
  const likely=scriptUrls.filter(u=>/(live|score|data|football|bf_|detail|socket|signalr)/i.test(u)).slice(0,40);
  const candidates=[];
  for(const path of CANDIDATES){
    try{const r=await get(BASE+path);candidates.push({path,status:r.status,type:r.type,length:r.length,preview:r.text.slice(0,220)});}catch(e){candidates.push({path,error:String(e?.message||e)});}
  }
  return {ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',source:BASE,generatedAt:new Date().toISOString(),home:{status:home.status,type:home.type,length:home.length},scripts:scriptUrls.slice(0,80),likelyScripts:likely,candidates};
}
export default {async fetch(request){
  const url=new URL(request.url);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(url.pathname==='/health')return json({ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',source:BASE,scraping:'PROBE_ONLY'});
  if(url.pathname==='/probe'){
    try{return json(await probe());}catch(e){return json({ok:false,error:String(e?.message||e)},502);}
  }
  return json({ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',routes:['/health','/probe']});
}};
