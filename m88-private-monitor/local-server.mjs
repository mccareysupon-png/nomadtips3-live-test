import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const WEB=path.join(__dirname,'web');
const DATA=path.join(__dirname,'data');
const PORT=Number(process.env.M88_MONITOR_PORT||8789);
const M88_URL=process.env.M88_PUBLIC_APP_URL||'https://msports.m88.com/app/v2/';
fs.mkdirSync(DATA,{recursive:true});

const state={startedAt:new Date().toISOString(),lastNetworkAt:null,lastUsefulAt:null,matches:new Map(),sources:new Map(),unmatched:new Map(),browser:'starting',pageUrl:M88_URL};
const safe=v=>String(v??'').trim();
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%',''));return Number.isFinite(n)?n:null};
const normKey=k=>String(k||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function ciPick(o,names){if(!o||typeof o!=='object'||Array.isArray(o))return null;const wanted=new Set(names.map(normKey));for(const [k,v] of Object.entries(o)){if(wanted.has(normKey(k))&&v!==undefined&&v!==null&&v!=='')return v;}return null;}
function objName(v){if(typeof v==='string'||typeof v==='number')return safe(v);return safe(ciPick(v,['name','displayName','shortName','teamName','competitorName','label','title','description','value']));}
function firstObject(o,names){const v=ciPick(o,names);return v&&typeof v==='object'?v:null;}

function participants(o){
  const home=objName(ciPick(o,['home','homeName','homeTeam','home_team','homeTeamName','team1','competitor1','homeCompetitor','participant1']));
  const away=objName(ciPick(o,['away','awayName','awayTeam','away_team','awayTeamName','team2','competitor2','awayCompetitor','participant2']));
  if(home&&away)return [home,away];
  for(const key of ['participants','competitors','teams','contestants','opponents','players']){
    const a=ciPick(o,[key]);if(!Array.isArray(a)||a.length<2)continue;
    let h='',w='';
    for(const item of a){const name=objName(item);const side=safe(ciPick(item,['side','homeAway','designation','position','type'])).toLowerCase();if(!name)continue;if(/home|host|team1|^1$/.test(side))h=name;else if(/away|guest|team2|^2$/.test(side))w=name;}
    if(h&&w)return [h,w];
    const names=a.map(objName).filter(Boolean);if(names.length>=2)return names.slice(0,2);
  }
  return ['',''];
}

function score(o){
  const h=num(ciPick(o,['homeScore','scoreHome','home_score','hScore','homeGoals','score1','homeTeamScore']));
  const a=num(ciPick(o,['awayScore','scoreAway','away_score','aScore','awayGoals','score2','awayTeamScore']));
  if(h!==null&&a!==null)return [h,a];
  const s=ciPick(o,['score','currentScore','result','liveScore','scores']);
  if(typeof s==='string'){const m=s.match(/(\d+)\s*[-:]\s*(\d+)/);if(m)return [Number(m[1]),Number(m[2])];}
  if(s&&typeof s==='object'&&!Array.isArray(s)){const hh=num(ciPick(s,['home','homeScore','h','score1','homeTeam'])),aa=num(ciPick(s,['away','awayScore','a','score2','awayTeam']));if(hh!==null&&aa!==null)return [hh,aa];}
  return [null,null];
}

function sideStat(o,side,names){
  const prefix=side==='home'?'home':'away';
  const direct=[];for(const n of names){direct.push(prefix+n[0].toUpperCase()+n.slice(1),`${prefix}_${n}`,`${n}${prefix[0].toUpperCase()+prefix.slice(1)}`);}
  let v=num(ciPick(o,direct));if(v!==null)return v;
  for(const boxName of [`${prefix}Stats`,`${prefix}Statistics`,'stats','statistics','liveStats','matchStats']){
    const box=firstObject(o,[boxName]);if(!box)continue;
    const sided=firstObject(box,[prefix,`${prefix}Team`,`${prefix}Side`]);
    if(sided){v=num(ciPick(sided,names));if(v!==null)return v;}
    if(normKey(boxName).startsWith(prefix)){v=num(ciPick(box,names));if(v!==null)return v;}
  }
  const arr=ciPick(o,['statistics','stats','matchStats']);
  if(Array.isArray(arr))for(const item of arr){const label=normKey(ciPick(item,['name','type','statName','key','code']));if(!names.some(n=>label.includes(normKey(n))))continue;v=num(ciPick(item,side==='home'?['home','homeValue','value1','team1']:['away','awayValue','value2','team2']));if(v!==null)return v;}
  return null;
}

function baseEvent(o,idx=0){
  const [home,away]=participants(o),[homeScore,awayScore]=score(o);if(!home||!away)return null;
  return {
    sourceId:safe(ciPick(o,['id','eventId','event_id','matchId','fixtureId','gameId','sid','sportEventId']))||`event-${idx}`,
    league:objName(ciPick(o,['league','leagueName','competition','competitionName','tournament','category','leagueInfo'])),
    home,away,
    minute:num(ciPick(o,['minute','liveMinute','matchMinute','clock','time','elapsed','elapsedMinute','matchTime','timer'])),
    homeScore,awayScore,
    status:objName(ciPick(o,['status','state','matchStatus','period','phase','eventStatus'])),
    homeRedCards:sideStat(o,'home',['redCards','redCard']),awayRedCards:sideStat(o,'away',['redCards','redCard']),
    homeAttacks:sideStat(o,'home',['attacks','attack']),awayAttacks:sideStat(o,'away',['attacks','attack']),
    homeDangerousAttacks:sideStat(o,'home',['dangerousAttacks','dangerousAttack']),awayDangerousAttacks:sideStat(o,'away',['dangerousAttacks','dangerousAttack']),
    homeShots:sideStat(o,'home',['shots','shot']),awayShots:sideStat(o,'away',['shots','shot']),
    homeShotsOnTarget:sideStat(o,'home',['shotsOnTarget','shotOnTarget','onTarget']),awayShotsOnTarget:sideStat(o,'away',['shotsOnTarget','shotOnTarget','onTarget']),
    homeCorners:sideStat(o,'home',['corners','corner']),awayCorners:sideStat(o,'away',['corners','corner']),
    homePossession:sideStat(o,'home',['possession','ballPossession']),awayPossession:sideStat(o,'away',['possession','ballPossession'])
  };
}

function priceOf(o){return num(ciPick(o,['odds','odd','price','decimalOdds','decimal_odds','decimalPrice','value','rate','payoff']));}
function marketName(o){return objName(ciPick(o,['market','marketName','market_name','betType','typeName','groupName','marketType','betTypeName']));}
function selectionName(o){return objName(ciPick(o,['selection','selectionName','outcome','outcomeName','pick','side','name','label','runnerName','betName']));}
function lineOf(o){return num(ciPick(o,['handicap','line','hdp','asianLine','goalLine','points','special','specifier']));}

function flattenEvent(o,raw,idx){
  const base=baseEvent(o,idx);if(!base)return [];
  const rows=[],seen=new Set();
  function walk(v,depth=0,marketHint=''){
    if(depth>10||!v)return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1,marketHint);return;}if(typeof v!=='object')return;
    const mh=marketName(v)||marketHint,odds=priceOf(v),sel=selectionName(v),line=lineOf(v);
    if(odds!==null&&sel){const key=`${mh}|${sel}|${line??''}|${odds}`;if(!seen.has(key)){seen.add(key);rows.push({...base,market:mh,selection:sel,odds,line,handicapLine:line,goalLine:line,raw});}}
    for(const [k,x] of Object.entries(v))if(x&&typeof x==='object')walk(x,depth+1,/market|group|bet|offer/i.test(k)?(marketName(v)||mh):mh);
  }
  walk(o);
  if(!rows.length)rows.push({...base,market:'',selection:'',odds:null,line:null,handicapLine:null,goalLine:null,raw});
  return rows;
}

function eventish(o){if(!o||typeof o!=='object'||Array.isArray(o))return false;const [h,a]=participants(o);if(h&&a)return true;let t='';try{t=JSON.stringify(o).slice(0,1800)}catch{}return /(home|hometeam|team1)/i.test(t)&&/(away|awayteam|team2)/i.test(t)&&/(event|match|market|odd|score|sport|fixture)/i.test(t);}
function extract(payload){const events=[],visited=new Set();function walk(v,depth=0){if(depth>12||events.length>2000||!v)return;if(Array.isArray(v)){for(const x of v)walk(x,depth+1);return;}if(typeof v!=='object'||visited.has(v))return;visited.add(v);if(eventish(v))events.push(v);for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1);}walk(payload);const out=[];events.forEach((e,i)=>out.push(...flattenEvent(e,e,i)));return out.slice(0,8000);}

function sanitize(v,depth=0){if(depth>4)return '[depth]';if(Array.isArray(v))return v.slice(0,5).map(x=>sanitize(x,depth+1));if(!v||typeof v!=='object'){if(typeof v==='string')return v.length>160?v.slice(0,160)+'…':v;return v;}const out={};let n=0;for(const [k,x] of Object.entries(v)){if(n++>30)break;if(/pass|token|cookie|session|account|balance|wallet|email|phone|auth|user/i.test(k)){out[k]='[redacted]';continue;}out[k]=sanitize(x,depth+1);}return out;}
function recordUnmatched(url,kind,payload){const prev=state.unmatched.get(url)||{url,kind,hits:0,lastSeen:null,sample:null};prev.hits++;prev.lastSeen=new Date().toISOString();if(!prev.sample)prev.sample=sanitize(payload);state.unmatched.set(url,prev);}
function persist(){const cutoff=Date.now()-30*60*1000;for(const [k,v] of state.matches)if(new Date(v.capturedAt).getTime()<cutoff)state.matches.delete(k);fs.writeFileSync(path.join(DATA,'latest.json'),JSON.stringify({updatedAt:new Date().toISOString(),matches:[...state.matches.values()]},null,2));fs.writeFileSync(path.join(DATA,'sources.json'),JSON.stringify({updatedAt:new Date().toISOString(),sources:[...state.sources.values()]},null,2));fs.writeFileSync(path.join(DATA,'unmatched.json'),JSON.stringify({updatedAt:new Date().toISOString(),unmatched:[...state.unmatched.values()].slice(-50)},null,2));}
let persistTimer=null;function persistSoon(){clearTimeout(persistTimer);persistTimer=setTimeout(persist,400);}

function ingest(payload,url,kind='response'){
  let rows=[];try{rows=extract(payload)}catch{}
  const now=new Date().toISOString();state.lastNetworkAt=now;const src=state.sources.get(url)||{url,kind,hits:0,rows:0,lastSeen:null};src.hits++;src.rows=Math.max(src.rows,rows.length);src.lastSeen=now;state.sources.set(url,src);
  if(rows.length){state.lastUsefulAt=now;for(const r of rows){const key=[r.sourceId,r.home,r.away,r.market,r.selection,r.line].join('|');state.matches.set(key,{...r,sourceUrl:url,capturedAt:now});}}else recordUnmatched(url,kind,payload);
  persistSoon();
}

function parseTextPayload(text){const t=String(text||'').trim();if(!t)return null;for(const candidate of [t,t.replace(/^\d+/,''),t.slice(Math.max(0,Math.min(...[t.indexOf('{'),t.indexOf('[')].filter(x=>x>=0))))]){try{return JSON.parse(candidate)}catch{}}return null;}
async function captureResponse(res){const req=res.request(),type=req.resourceType(),url=res.url(),ct=safe(res.headers()['content-type']).toLowerCase();if(!['xhr','fetch'].includes(type)&&!(/json|text/.test(ct)||/(odds|market|event|match|live|sport|fixture|api|data)/i.test(url)))return;try{const body=await res.body();if(!body.length||body.length>12_000_000)return;const data=parseTextPayload(body.toString('utf8'));if(data)ingest(data,url,`http-${type}`);}catch{}}

function staticFile(req,res){let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';const file=path.normalize(path.join(WEB,p));if(!file.startsWith(WEB)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);}
function sendJson(res,data){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'});res.end(JSON.stringify(data,null,2));}
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');if(u.pathname==='/api/health'){sendJson(res,{ok:true,service:'m88-pc-collector-v2',browser:state.browser,pageUrl:state.pageUrl,lastNetworkAt:state.lastNetworkAt,lastUsefulAt:state.lastUsefulAt,sourceCount:state.sources.size,unmatchedCount:state.unmatched.size,matchCount:state.matches.size,startedAt:state.startedAt});return;}if(u.pathname==='/api/feed'){const matches=[...state.matches.values()];sendJson(res,{ok:true,mode:'pc-browser-network-v2',checkedAt:new Date().toISOString(),matchCount:matches.length,matches});return;}if(u.pathname==='/api/source/probe'){sendJson(res,{ok:true,mode:'pc-browser-network-v2',pageUrl:state.pageUrl,sources:[...state.sources.values()].sort((a,b)=>b.rows-a.rows||b.hits-a.hits).slice(0,200),unmatched:[...state.unmatched.values()].slice(-20)});return;}if(u.pathname==='/api/debug/unmatched'){sendJson(res,{ok:true,unmatched:[...state.unmatched.values()].slice(-50)});return;}staticFile(req,res);});
server.listen(PORT,'127.0.0.1',()=>console.log(`M88 private monitor: http://127.0.0.1:${PORT}`));

async function launch(){
  const profile=path.join(DATA,'chrome-profile');let context;try{context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});state.browser='Google Chrome';}catch{context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,args:['--start-maximized']});state.browser='Chromium';}
  function wire(p){p.on('response',captureResponse);p.on('websocket',ws=>{const url=ws.url();ws.on('framereceived',ev=>{try{const text=Buffer.isBuffer(ev.payload)?ev.payload.toString('utf8'):String(ev.payload);if(text.length>12_000_000)return;const data=parseTextPayload(text);if(data)ingest(data,url,'websocket');}catch{}});});}
  for(const p of context.pages())wire(p);context.on('page',wire);const page=context.pages()[0]||await context.newPage();await page.goto(M88_URL,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('M88 page load:',e.message));state.pageUrl=page.url();
  const monitor=await context.newPage();await monitor.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded'});console.log('M88 tab and private monitor tab opened. Keep this window open while monitoring.');
}
launch().catch(e=>{console.error(e);process.exitCode=1;});
