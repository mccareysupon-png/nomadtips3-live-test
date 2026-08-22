const BASE='https://www.nowgoal.net';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
let cookie='';
async function get(path,{referer=BASE+'/',accept='*/*'}={}){
  const url=new URL(path,BASE);
  const headers={'user-agent':UA,'accept':accept,'accept-language':'en-US,en;q=0.9','referer':referer,'cache-control':'no-cache'};
  if(cookie) headers.cookie=cookie;
  const r=await fetch(url,{headers,redirect:'follow'});
  const set=typeof r.headers.getSetCookie==='function'?r.headers.getSetCookie():[];
  if(set.length) cookie=set.map(v=>v.split(';')[0]).join('; ');
  return {status:r.status,type:r.headers.get('content-type')||'',text:await r.text()};
}
const compact=s=>String(s||'').replace(/\s+/g,' ').trim();
const homepage=await get('/',{referer:BASE+'/'});
console.log('HOME',homepage.status,'cookie',cookie?1:0);
for(const path of ['/gf/data/bf_en-idn.js','/gf/data/bf_en-idn1.js']){
  for(const suffix of ['',`?${Date.now()}`]){
    const r=await get(path+suffix,{accept:'application/javascript,text/javascript,*/*;q=0.8'});
    console.log('ROSTER',path+suffix,'status='+r.status,'type='+r.type,'bytes='+r.text.length,'body='+compact(r.text).slice(0,500));
  }
}
const feed=await get('/gf/data/odds/en/goal50.xml',{accept:'application/xml,text/xml,*/*;q=0.8'});
const rows=[...feed.text.matchAll(/<m>([^<]+)<\/m>/g)].map(m=>m[1].split(','));
console.log('GOAL50','status='+feed.status,'rows='+rows.length);
const ids=[...new Set(rows.slice(0,12).map(r=>r[0]).filter(Boolean))].slice(0,6);
for(const id of ids){
  const score=await get(`/Ajax/SoccerAjax/?type=11&id=${encodeURIComponent(id)}`,{referer:`${BASE}/oddscomp/${id}`,'accept':'application/json,text/plain,*/*'});
  console.log('TYPE11','id='+id,'status='+score.status,'bytes='+score.text.length,'body='+compact(score.text).slice(0,1200));
  const page=await get(`/oddscomp/${encodeURIComponent(id)}`,{accept:'text/html,*/*'});
  const title=(page.text.match(/<title>([\s\S]*?)<\/title>/i)||[])[1]||'';
  const desc=(page.text.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)||[])[1]||'';
  const info={};
  for(const key of ['_scheduleID','scheduleId','_matchInfo','hTeam','gTeam','homeTeam','guestTeam']){
    const re=new RegExp(`(?:var\\s+)?${key}\\s*=\\s*([^;]+);`,'i');
    const m=page.text.match(re); if(m) info[key]=compact(m[1]).slice(0,400);
  }
  console.log('PAGE','id='+id,'status='+page.status,'title='+compact(title),'desc='+compact(desc).slice(0,500),'vars='+JSON.stringify(info));
}

const ENGINE='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
async function engineJson(path){
  const r=await fetch(`${ENGINE}${path}`,{headers:{'user-agent':UA,'accept':'application/json','cache-control':'no-cache'}});
  const text=await r.text();
  let json=null; try{json=JSON.parse(text);}catch{}
  console.log('ENGINE',path,'status='+r.status,'body='+compact(text).slice(0,12000));
  return {status:r.status,json,text};
}
const before=await engineJson('/health');
const cycle=await engineJson('/cycle');
const after=await engineJson('/health');
const liveFeed=await engineJson('/feed');
const source=after.json?.source?.oddspedia||null;
const source5Rows=(liveFeed.json?.matches||[]).map(m=>(m.priceSources||[]).find(s=>s.id==='source5')).filter(Boolean);
console.log('VERIFY',JSON.stringify({beforeCycle:before.json?.cycle,cycle:after.json?.cycle,source,source5Count:source5Rows.length,source5Samples:source5Rows.slice(0,5)}));
if(after.status!==200||!after.json?.ok) process.exitCode=2;
if(!source||source.status==='REMOVED') process.exitCode=3;
