const BASE='https://live10.nowgoal26.com';
const CANDIDATES=['/gf/data/bf_us.js','/gf/data/bf_us1.js','/gf/data/detailIn.js','/gf/data/goaldata.js','/gf/data/gf_us.js'];
const INSPECT=['/scripts/ng/config.js','/scripts/Main/wsUtil.js','/scripts/Main/soccer/soccer_common.js','/scripts/Main/soccer/soccer.js'];
const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'};
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'*/*','accept-language':'en-US,en;q=0.8','referer':BASE+'/'},redirect:'follow'});
  const text=await r.text();
  return {url:r.url,status:r.status,type:r.headers.get('content-type')||'',length:text.length,text};
}
function scripts(html){const out=[];const re=/<script[^>]+src=["']([^"']+)["'][^>]*>/gi;let m;while((m=re.exec(html))){try{out.push(new URL(m[1],BASE).href)}catch{}}return[...new Set(out)];}
function refs(text){const out=[];const patterns=[/(?:wss?|https?):\/\/[^"'\s)]+/gi,/['"](\/[^'"\s]{3,160})['"]/g];for(const re of patterns){let m;while((m=re.exec(text))&&out.length<160){const v=(m[1]||m[0]).replace(/\\u0026/g,'&');if(/(ws|socket|score|soccer|football|data|api|live|signal|push|match|bf_|detail)/i.test(v))out.push(v);}}return[...new Set(out)].slice(0,100);}
function snippets(text){const out=[];const re=/.{0,100}(WebSocket|wss?:|signalr|socket|push|score|liveData|matchData|apiUrl|serverUrl).{0,180}/gi;let m;while((m=re.exec(text))&&out.length<35)out.push(m[0].replace(/\s+/g,' ').slice(0,320));return[...new Set(out)];}
function around(text,needle,limit=8){const out=[];let pos=0;while(out.length<limit){const i=text.indexOf(needle,pos);if(i<0)break;out.push(text.slice(Math.max(0,i-140),Math.min(text.length,i+360)).replace(/\s+/g,' '));pos=i+needle.length;}return out;}
async function probe(){
  const home=await get(BASE+'/');const scriptUrls=scripts(home.text);
  const candidates=[];for(const path of CANDIDATES){try{const r=await get(BASE+path);candidates.push({path,status:r.status,type:r.type,length:r.length,preview:r.text.slice(0,220)});}catch(e){candidates.push({path,error:String(e?.message||e)});}}
  const inspected=[];for(const path of INSPECT){try{const r=await get(BASE+path);inspected.push({path,status:r.status,type:r.type,length:r.length,refs:refs(r.text),snippets:snippets(r.text)});}catch(e){inspected.push({path,error:String(e?.message||e)});}}
  const homeData={hasA:/\bA\s*\[/.test(home.text),hasB:/\bB\s*\[/.test(home.text),hasMatchcount:/matchcount/i.test(home.text),samples:{A:around(home.text,'A['),B:around(home.text,'B['),matchcount:around(home.text,'matchcount'),websocket:around(home.text,'_websocket')}};
  return {ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',source:BASE,generatedAt:new Date().toISOString(),home:{status:home.status,type:home.type,length:home.length},homeData,scripts:scriptUrls.slice(0,80),candidates,inspected};
}
export default {async fetch(request){const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});if(url.pathname==='/health')return json({ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',source:BASE,scraping:'PROBE_ONLY'});if(url.pathname==='/probe'){try{return json(await probe());}catch(e){return json({ok:false,error:String(e?.message||e)},502);}}return json({ok:true,service:'CAR LIVESCORE NOWGOAL PROBE',routes:['/health','/probe']});}};
