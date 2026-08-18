import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const WEB=path.join(__dirname,'web');
const DATA=path.join(__dirname,'data');
const CAPTURE=path.join(DATA,'captures');
const PORT=Number(process.env.M88_MONITOR_PORT||8789);
const M88_URL=process.env.M88_PUBLIC_APP_URL||'https://msports.m88.com/app/v2/';
fs.mkdirSync(CAPTURE,{recursive:true});

const state={startedAt:new Date().toISOString(),lastNetworkAt:null,lastUsefulAt:null,matches:new Map(),sources:new Map(),captures:0,browser:'starting',pageUrl:M88_URL};
const safe=s=>String(s??'').trim();
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
const lc=s=>safe(s).toLowerCase();
const pick=(o,keys)=>{for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&v!=='')return v}return null};
const objName=v=>typeof v==='string'?safe(v):safe(pick(v,['name','displayName','shortName','teamName','competitorName','label','title']));

function participants(o){
  const direct=[pick(o,['home','homeName','homeTeam','home_team','team1','competitor1']),pick(o,['away','awayName','awayTeam','away_team','team2','competitor2'])].map(objName);
  if(direct[0]&&direct[1])return direct;
  for(const key of ['participants','competitors','teams','contestants']){
    const a=o?.[key];if(Array.isArray(a)&&a.length>=2){const names=a.map(objName).filter(Boolean);if(names.length>=2)return names.slice(0,2)}
  }
  return ['',''];
}

function score(o){
  const h=num(pick(o,['homeScore','scoreHome','home_score','hScore','homeGoals','score1']));
  const a=num(pick(o,['awayScore','scoreAway','away_score','aScore','awayGoals','score2']));
  if(h!==null&&a!==null)return [h,a];
  const s=pick(o,['score','currentScore','result']);
  if(typeof s==='string') {const m=s.match(/(\d+)\s*[-:]\s*(\d+)/);if(m)return [Number(m[1]),Number(m[2])];}
  if(s&&typeof s==='object'){
    const hh=num(pick(s,['home','homeScore','h','score1'])),aa=num(pick(s,['away','awayScore','a','score2']));
    if(hh!==null&&aa!==null)return [hh,aa];
  }
  return [null,null];
}

function stat(o,names){
  for(const name of names){const v=num(o?.[name]);if(v!==null)return v}
  for(const box of ['stats','statistics','liveStats','matchStats']){
    const b=o?.[box];if(b&&typeof b==='object'&&!Array.isArray(b))for(const name of names){const v=num(b?.[name]);if(v!==null)return v}
  }
  return null;
}

function baseEvent(o,idx=0){
  const [home,away]=participants(o),[homeScore,awayScore]=score(o);
  if(!home||!away)return null;
  return {
    sourceId:safe(pick(o,['id','eventId','event_id','matchId','fixtureId','gameId','sid']))||`event-${idx}`,
    league:objName(pick(o,['league','leagueName','competition','competitionName','tournament','category'])),
    home,away,
    minute:num(pick(o,['minute','liveMinute','matchMinute','clock','time','elapsed','elapsedMinute'])),
    homeScore,awayScore,
    status:objName(pick(o,['status','state','matchStatus','period','phase']))||safe(pick(o,['status','state','matchStatus','period','phase'])),
    redHome:stat(o,['homeRedCards','redCardsHome','home_red_cards']),
    redAway:stat(o,['awayRedCards','redCardsAway','away_red_cards']),
    attacks:stat(o,['attacks']),dangerousAttacks:stat(o,['dangerousAttacks','dangerous_attacks']),shots:stat(o,['shots']),shotsOnTarget:stat(o,['shotsOnTarget','shots_on_target']),corners:stat(o,['corners']),possession:stat(o,['possession'])
  };
}

function priceOf(o){return num(pick(o,['odds','odd','price','decimalOdds','decimal_odds','value','rate']));}
function marketName(o){return objName(pick(o,['market','marketName','market_name','betType','typeName','groupName']))||safe(pick(o,['market','marketName','market_name','betType','typeName','groupName']));}
function selectionName(o){return objName(pick(o,['selection','selectionName','outcome','outcomeName','pick','side','name','label']))||safe(pick(o,['selection','selectionName','outcome','outcomeName','pick','side','name','label']));}
function handicapLine(o){return num(pick(o,['handicap','line','hdp','asianLine','goalLine','points']));}

function flattenEvent(o,raw,idx){
  const base=baseEvent(o,idx);if(!base)return [];
  const rows=[];const seen=new Set();
  function walk(v,depth=0,marketHint=''){
    if(depth>7||!v)return;
    if(Array.isArray(v)){for(const x of v)walk(x,depth+1,marketHint);return;}
    if(typeof v!=='object')return;
    const mh=marketName(v)||marketHint;
    const odds=priceOf(v),sel=selectionName(v),line=handicapLine(v);
    if(odds!==null&&sel){const key=`${mh}|${sel}|${line??''}|${odds}`;if(!seen.has(key)){seen.add(key);rows.push({...base,market:mh,selection:sel,odds,line,raw});}}
    for(const [k,x] of Object.entries(v)){if(x&&typeof x==='object')walk(x,depth+1,/market|group|bet/i.test(k)?(marketName(v)||mh):mh)}
  }
  walk(o,0,'');
  if(!rows.length)rows.push({...base,market:'',selection:'',odds:null,line:null,raw});
  return rows;
}

function eventish(o){
  if(!o||typeof o!=='object'||Array.isArray(o))return false;
  const [h,a]=participants(o);if(h&&a)return true;
  const t=JSON.stringify(o).slice(0,1000);return /home/i.test(t)&&/away/i.test(t)&&/(event|match|market|odd|score|sport)/i.test(t);
}

function extract(payload){
  const events=[];const visited=new Set();
  function walk(v,depth=0){
    if(depth>9||events.length>1000||!v)return;
    if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return;}
    if(typeof v!=='object')return;
    if(visited.has(v))return;visited.add(v);
    if(eventish(v))events.push(v);
    for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1);
  }
  walk(payload);
  const out=[];events.forEach((e,i)=>out.push(...flattenEvent(e,e,i)));
  return out.slice(0,5000);
}

function ingest(payload,url,kind='response'){
  let rows=[];try{rows=extract(payload)}catch{}
  const now=new Date().toISOString();state.lastNetworkAt=now;
  const s=state.sources.get(url)||{url,kind,hits:0,rows:0,lastSeen:null};s.hits++;s.rows=Math.max(s.rows,rows.length);s.lastSeen=now;state.sources.set(url,s);
  if(rows.length){state.lastUsefulAt=now;for(const r of rows){const key=[r.sourceId,r.home,r.away,r.market,r.selection,r.line].join('|');state.matches.set(key,{...r,sourceUrl:url,capturedAt:now});}}
  if(rows.length||/(odds|market|event|match|live|sport|fixture)/i.test(url))persistSoon();
}

let persistTimer=null;function persistSoon(){clearTimeout(persistTimer);persistTimer=setTimeout(()=>{
  const cutoff=Date.now()-30*60*1000;for(const [k,v] of state.matches)if(new Date(v.capturedAt).getTime()<cutoff)state.matches.delete(k);
  fs.writeFileSync(path.join(DATA,'latest.json'),JSON.stringify({updatedAt:new Date().toISOString(),matches:[...state.matches.values()]},null,2));
  fs.writeFileSync(path.join(DATA,'sources.json'),JSON.stringify({updatedAt:new Date().toISOString(),sources:[...state.sources.values()].sort((a,b)=>b.rows-a.rows||b.hits-a.hits)},null,2));
},500);}

async function captureResponse(res){
  const url=res.url();const ct=lc(res.headers()['content-type']);
  if(!(/json|text|javascript/.test(ct)||/(odds|market|event|match|live|sport|fixture|api)/i.test(url)))return;
  try{
    const body=await res.body();if(body.length>8_000_000)return;
    const text=body.toString('utf8');let data;try{data=JSON.parse(text)}catch{return;}
    ingest(data,url,'http-json');
  }catch{}
}

function staticFile(req,res){
  let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';
  const file=path.normalize(path.join(WEB,p));if(!file.startsWith(WEB)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
  res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  if(u.pathname==='/api/health'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,service:'m88-pc-collector',browser:state.browser,pageUrl:state.pageUrl,lastNetworkAt:state.lastNetworkAt,lastUsefulAt:state.lastUsefulAt,sourceCount:state.sources.size,matchCount:state.matches.size,startedAt:state.startedAt},null,2));return;}
  if(u.pathname==='/api/feed'){const matches=[...state.matches.values()];res.writeHead(200,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'});res.end(JSON.stringify({ok:true,mode:'pc-browser-network',checkedAt:new Date().toISOString(),matchCount:matches.length,matches},null,2));return;}
  if(u.pathname==='/api/source/probe'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,mode:'pc-browser-network',pageUrl:state.pageUrl,sources:[...state.sources.values()].sort((a,b)=>b.rows-a.rows||b.hits-a.hits).slice(0,200)},null,2));return;}
  staticFile(req,res);
});

server.listen(PORT,'127.0.0.1',()=>console.log(`M88 private monitor: http://127.0.0.1:${PORT}`));

async function launch(){
  const profile=path.join(DATA,'chrome-profile');
  let context;
  try{context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});state.browser='Google Chrome';}
  catch(e){console.log('Chrome channel unavailable, using Playwright Chromium.');context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,args:['--start-maximized']});state.browser='Chromium';}
  const page=context.pages()[0]||await context.newPage();
  context.on('page',p=>wire(p));
  function wire(p){p.on('response',captureResponse);p.on('websocket',ws=>{const url=ws.url();ws.on('framereceived',ev=>{try{const text=Buffer.isBuffer(ev.payload)?ev.payload.toString('utf8'):String(ev.payload);if(text.length>8_000_000)return;ingest(JSON.parse(text),url,'websocket');}catch{}});});}
  wire(page);
  await page.goto(M88_URL,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('M88 page load:',e.message));state.pageUrl=page.url();
  const monitor=await context.newPage();await monitor.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded'});
  console.log('M88 tab and private monitor tab opened. Keep this window open while monitoring.');
}

launch().catch(e=>{console.error(e);process.exitCode=1;});
