const BASE='https://live10.nowgoal26.com';
const DETAIL_FEED=BASE+'/gf/data/detailIn.js';
const MAX_MATCHES=20;
const REFRESH_SECONDS=30;
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const COMMON={'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'};

const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const json=(data,status=200,cache='no-store')=>new Response(JSON.stringify(data,null,2),{status,headers:{...COMMON,'content-type':'application/json; charset=utf-8','cache-control':cache}});
const escRe=s=>String(s||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

async function fetchText(url,ttl=30){
  const bucket=Math.floor(Date.now()/(ttl*1000));
  const u=new URL(url);u.searchParams.set('_nomad',String(bucket));
  const r=await fetch(u.toString(),{headers:{'user-agent':UA,'accept':'text/html,application/javascript,*/*;q=0.8','accept-language':'en-US,en;q=0.8','referer':BASE+'/'},redirect:'follow',cf:{cacheTtl:ttl,cacheEverything:true}});
  if(!r.ok)throw new Error(`HTTP_${r.status}_${u.pathname}`);
  return r.text();
}

function decode(text=''){
  return String(text).replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
}
function cleanBody(html=''){
  return decode(String(html).replace(/<head[\s\S]*?<\/head>/gi,' ').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function titleFrom(html=''){
  return decode(((String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function idsFromDetail(source=''){
  const ids=[];const seen=new Set();
  for(const m of String(source).matchAll(/d_f\[(\d+)\]\s*=/g)){if(!seen.has(m[1])){seen.add(m[1]);ids.push(m[1]);if(ids.length>=MAX_MATCHES)break;}}
  return ids;
}
function pair(text,label){
  const e=escRe(label);
  for(const re of [new RegExp(`(\\d+(?:\\.\\d+)?%?)\\s+${e}\\s+(\\d+(?:\\.\\d+)?%?)`,'i'),new RegExp(`${e}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?%?)\\s*[-–:]\\s*(\\d+(?:\\.\\d+)?%?)`,'i')]){
    const m=text.match(re);if(m)return{home:number(m[1]),away:number(m[2])};
  }
  return{home:null,away:null};
}
function validIntegerPair(p,max){
  const h=number(p?.home),a=number(p?.away);
  if(h===null||a===null||!Number.isInteger(h)||!Number.isInteger(a)||h<0||a<0||h>max||a>max)return{home:null,away:null};
  return{home:h,away:a};
}
function validPossession(p){
  const h=number(p?.home),a=number(p?.away);
  if(h===null||a===null||h<0||a<0||h>100||a>100)return{home:null,away:null};
  const total=h+a;
  if(total<99||total>101)return{home:null,away:null};
  return{home:h,away:a};
}
function statsRegion(text,home,away){
  const anchor=Math.max(text.indexOf(home||''),text.indexOf(away||''),0);
  let start=text.indexOf('Statistics',anchor);
  if(start<0)return'';
  let end=text.indexOf('Team Statistics',start+10);
  if(end<0)end=text.indexOf('Latest Matches',start+10);
  if(end<0)end=Math.min(text.length,start+3200);
  return text.slice(start,end);
}
function parseTeams(title){
  const m=String(title).match(/^(.+?)\s+(?:VS|vs)\s+(.+?)\s+-\s+Live Score/i);
  if(m)return{home:m[1].trim(),away:m[2].trim()};
  const m2=String(title).match(/^(.+?)\s+(?:VS|vs)\s+(.+?)(?:\s+-|$)/i);
  return m2?{home:m2[1].trim(),away:m2[2].trim()}:{home:'',away:''};
}
function parseHeader(text,home,away){
  if(!home||!away)return{score:{home:null,away:null},status:'LIVE',statusText:'Live'};
  const re=new RegExp(`${escRe(home)}\\s+(\\d{1,2})\\s+(.{0,120}?)\\s+(\\d{1,2})\\s+${escRe(away)}`,'i');
  const m=text.match(re);
  if(!m)return{score:{home:null,away:null},status:'LIVE',statusText:'Live'};
  const middle=String(m[2]||'').trim();
  let status='LIVE';
  if(/finished|\bFT\b/i.test(middle))status='FT';
  else if(/half.?time|\bHT\b/i.test(middle))status='HT';
  else if(/postpon|cancel|abandon/i.test(middle))status='OTHER';
  return{score:{home:number(m[1]),away:number(m[3])},status,statusText:middle||status};
}
function parseMinute(statusText){const m=String(statusText||'').match(/(\d{1,3})(?:\+\d+)?\s*['’]/);return m?number(m[1]):null;}
function parseMatch(html,id){
  const title=titleFrom(html);const teams=parseTeams(title);const text=cleanBody(html);const head=parseHeader(text,teams.home,teams.away);const liveStats=statsRegion(text,teams.home,teams.away);
  const stats={
    possession:validPossession(pair(liveStats,'Possession')),
    attacks:validIntegerPair(pair(liveStats,'Attacks'),300),
    dangerous_attacks:validIntegerPair(pair(liveStats,'Dangerous Attacks'),250),
    shots:validIntegerPair(pair(liveStats,'Shots'),80),
    shots_on_target:validIntegerPair(pair(liveStats,'Shots on Goal'),50),
    corners:validIntegerPair(pair(liveStats,'Corner Kicks'),30),
    yellow_cards:validIntegerPair(pair(liveStats,'Yellow Cards'),15),
    red_cards:validIntegerPair(pair(liveStats,'Red Cards'),8)
  };
  return{id:String(id),league:'Live football',home:teams.home||`Match ${id}`,away:teams.away||'',status:head.status,statusText:head.statusText,minute:parseMinute(head.statusText),score:head.score,stats,sourceUrl:`${BASE}/match/live-${id}`};
}
async function mapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function run(){while(true){const i=next++;if(i>=items.length)return;try{out[i]=await fn(items[i],i);}catch(e){out[i]={error:String(e?.message||e),id:String(items[i])};}}}
  await Promise.all(Array.from({length:Math.max(1,limit)},run));return out;
}
function quality(m){return !m.error&&m.home&&m.away;}
function rank(s){return s==='LIVE'?0:s==='HT'?1:s==='FT'?2:3;}
async function build(){
  const detail=await fetchText(DETAIL_FEED,REFRESH_SECONDS);const ids=idsFromDetail(detail);
  const raw=await mapLimit(ids,5,async id=>parseMatch(await fetchText(`${BASE}/match/live-${id}`,REFRESH_SECONDS),id));
  const matches=raw.filter(quality).sort((a,b)=>rank(a.status)-rank(b.status)||String(a.home).localeCompare(String(b.home)));
  const statReady=matches.filter(m=>Object.values(m.stats||{}).some(p=>number(p?.home)!==null&&number(p?.away)!==null)).length;
  return{ok:true,service:'CAR LIVESCORE NOWGOAL BETA',source:'Nowgoal26 public live feed',generatedAt:new Date().toISOString(),refreshSeconds:REFRESH_SECONDS,summary:{capturedIds:ids.length,matches:matches.length,live:matches.filter(x=>x.status==='LIVE'||x.status==='HT').length,finished:matches.filter(x=>x.status==='FT').length,leagues:matches.length?1:0,statReady},matches,diagnostics:{detailFeed:true,failed:raw.filter(x=>x.error).length,method:'detailIn IDs + public match pages',qualityGuard:'live statistics region + sane integer/range checks'}};
}
async function scores(request){
  const cache=caches.default;const key=new Request(new URL('/__car_livescore_scores_v2',request.url).toString(),{method:'GET'});const cached=await cache.match(key);if(cached)return cached;
  const data=await build();const response=json(data,200,`public, max-age=5, s-maxage=${REFRESH_SECONDS}`);await cache.put(key,response.clone());return response;
}
export default{async fetch(request){
  const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:COMMON});
  if(url.pathname==='/health')return json({ok:true,service:'CAR LIVESCORE NOWGOAL BETA',source:BASE,refreshSeconds:REFRESH_SECONDS,isolated:true});
  if(url.pathname==='/scores'){try{return await scores(request);}catch(e){return json({ok:false,error:String(e?.message||e),service:'CAR LIVESCORE NOWGOAL BETA'},502);}}
  return json({ok:true,service:'CAR LIVESCORE NOWGOAL BETA',routes:['/health','/scores']});
}};
