import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safe,num,redact,normTeam,parseText} from './rich-utils.mjs';
import {extract,preferredMarket} from './rich-normalizer.mjs';
import {scanDom} from './rich-dom.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const WEB=path.join(__dirname,'web'),DATA=path.join(__dirname,'data');
const PORT=Number(process.env.M88_MONITOR_PORT||8789);
const SPORTS_URL='https://www.m88.com/sports/M%20Sports%20Seamless';
const MARKET_TTL_MS=120000;
const ROW_TTL_MS=15*60*1000;
fs.mkdirSync(DATA,{recursive:true});

const state={
  startedAt:new Date().toISOString(),browser:'starting',pageUrl:SPORTS_URL,
  lastNetworkAt:null,lastUsefulAt:null,lastDomAt:null,
  rows:new Map(),sources:new Map(),frames:[],domSamples:[],rawSamples:new Map(),
  footballFocused:false,footballFocusedAt:null
};

const trustedKind=kind=>kind==='websocket'||/^context-(xhr|fetch|document)$/.test(safe(kind));
const explicitEventId=id=>{const s=safe(id);return Boolean(s)&&!/^net-\d+$/i.test(s)&&!/^dom-/i.test(s);};
const sourceClass=kind=>kind==='websocket'?'WEBSOCKET':/^context-(xhr|fetch|document)$/.test(safe(kind))?'NETWORK':'OTHER';

function uniqLatest(arr,keyFn,limit){
  const m=new Map();
  for(const x of arr||[])m.set(keyFn(x),x);
  return [...m.values()].slice(-limit);
}
function stampMarkets(r){return (r.markets||[]).map(x=>({...x,capturedAt:r.capturedAt,sourceUrl:r.sourceUrl,sourceKind:r.sourceKind}));}
function marketIdentity(x){return [safe(x.market).toLowerCase(),safe(x.selection).toLowerCase(),x.line??x.handicapLine??x.goalLine??''].join('|');}
function finalizeRow(out){
  out.marketCount=(out.markets||[]).length;
  out.eventCount=(out.events||[]).length;
  const f=['homeAttacks','awayAttacks','homeDangerousAttacks','awayDangerousAttacks','homeShots','awayShots','homeShotsOnTarget','awayShotsOnTarget','homeCorners','awayCorners','homePossession','awayPossession'];
  out.statsCoverage=f.filter(k=>out[k]!==null&&out[k]!==undefined).length;
  out.statsCoverageMax=f.length;
  const pref=preferredMarket(out.markets||[],out.home,out.away);
  if(pref){
    out.market=pref.market;out.selection=pref.selection;out.odds=pref.odds;
    out.line=pref.line;out.handicapLine=pref.handicapLine;out.goalLine=pref.goalLine;
    out.marketCapturedAt=pref.capturedAt||out.capturedAt;
  }
  return out;
}
function mergeRow(old,r){
  const incomingMarkets=stampMarkets(r);
  if(!old)return finalizeRow({...r,markets:incomingMarkets});
  const out={...old};
  for(const [k,v] of Object.entries(r)){
    if(['markets','events','extraStats'].includes(k))continue;
    if(v!==null&&v!==undefined&&v!=='')out[k]=v;
  }
  const cutoff=Date.now()-MARKET_TTL_MS;
  out.markets=uniqLatest([...(old.markets||[]),...incomingMarkets],marketIdentity,1200)
    .filter(x=>{const t=new Date(x.capturedAt||0).getTime();return Number.isFinite(t)&&t>=cutoff;});
  out.events=uniqLatest([...(old.events||[]),...(r.events||[])],x=>[x.type,x.minute??'',x.team,x.side,x.player,x.score].join('|'),300);
  out.extraStats=uniqLatest([...(old.extraStats||[]),...(r.extraStats||[])],x=>safe(x.label).toLowerCase(),150);
  return finalizeRow(out);
}
function rowKey(r,url){
  const h=normTeam(r.home),a=normTeam(r.away);
  if(explicitEventId(r.sourceId))return `id:${r.sourceId}`;
  return `net:${h}|${a}|${new URL(url,'https://m88.invalid').pathname}`;
}
function putRows(rows,url,kind){
  if(!trustedKind(kind))return;
  const now=new Date().toISOString();
  if(rows.length)state.lastUsefulAt=now;
  for(const r0 of rows){
    const r={
      ...r0,sourceUrl:url,capturedAt:now,sourceKind:kind,
      sourceTransport:sourceClass(kind),
      sourceVerified:true,
      explicitSourceEventId:explicitEventId(r0.sourceId),
      sourceIdentityType:explicitEventId(r0.sourceId)?'EXPLICIT_EVENT_ID':'NETWORK_TEAM_PAIR'
    };
    const key=rowKey(r,url);
    state.rows.set(key,mergeRow(state.rows.get(key),r));
  }
}
function ingest(payload,url,kind){
  let rows=[];
  try{rows=extract(payload);}catch{}
  const now=new Date().toISOString();
  state.lastNetworkAt=now;
  const s=state.sources.get(url)||{url,kind,hits:0,rows:0,lastSeen:null};
  s.hits++;s.rows=Math.max(s.rows,rows.length);s.lastSeen=now;state.sources.set(url,s);
  if(rows.length)putRows(rows,url,kind);
  else if(payload&&typeof payload==='object'&&!state.rawSamples.has(url))state.rawSamples.set(url,{url,kind,sample:redact(payload,3),capturedAt:now});
  persistSoon();
}
async function captureResponse(res){
  const req=res.request(),url=res.url(),type=req.resourceType();
  if(!['xhr','fetch','document'].includes(type)&&!/(api|sport|event|match|live|odd|market|stat|score|data)/i.test(url))return;
  try{
    const body=await res.body();
    if(!body.length||body.length>18_000_000)return;
    const data=parseText(body.toString('utf8'));
    if(data)ingest(data,url,`context-${type}`);
  }catch{}
}

function virtualLike(r){
  const t=[r.sport,r.league,r.home,r.away,r.status,r.sourceUrl].map(safe).join(' ').toLowerCase();
  return /(เสมือนจริง|virtual|simulat|\bsrl\b|e\s*-?sports?|efootball|e-soccer|fifa|cyber)/i.test(t);
}
function otherSportLike(r){
  const t=[r.sport,r.league].map(safe).join(' ').toLowerCase();
  return /(basketball|tennis|volleyball|baseball|ice hockey|hockey|table tennis|badminton|cricket|snooker|darts|handball|rugby|boxing|mma|formula|motorsport)/i.test(t);
}
function footballEvidence(r){
  if(virtualLike(r)||otherSportLike(r))return 0;
  let score=0;
  const sportText=[r.sport,r.league,r.sourceUrl].map(safe).join(' ').toLowerCase();
  if(/football|soccer|ฟุตบอล/.test(sportText))score+=100;
  if((r.events||[]).some(e=>/(corner|เตะมุม|offside|ล้ำหน้า|goal|penalty)/i.test(safe(e.type))))score+=60;
  if((r.homeCorners!=null||r.awayCorners!=null)&&(r.homeOffsides!=null||r.awayOffsides!=null))score+=55;
  const mk=(r.markets||[]).map(x=>safe(x.market)).join(' ').toLowerCase();
  if(/asian handicap|\b1x2\b|match result|total goals/.test(mk))score+=45;
  else if(/over.?under|handicap/.test(mk))score+=25;
  if(num(r.minute)!==null&&num(r.homeScore)!==null&&num(r.awayScore)!==null)score+=20;
  if(/live|in.?play|1st|2nd|half|สด|กำลังแข่ง/i.test(safe(r.status)))score+=10;
  return Math.min(100,score);
}
function liveLike(r){
  const st=safe(r.status).toLowerCase();
  if(/finished|final|\bft\b|ended|cancel|postpon|upcoming|prematch|pre-match|not started|scheduled/.test(st))return false;
  if(/live|in.?play|1st|2nd|half|สด|กำลังแข่ง/.test(st))return true;
  return num(r.minute)!==null&&num(r.homeScore)!==null&&num(r.awayScore)!==null;
}
function aggregate(){
  const now=Date.now(),groups=new Map();
  for(const r of state.rows.values()){
    if(now-new Date(r.capturedAt||0).getTime()>ROW_TTL_MS)continue;
    const h=normTeam(r.home),a=normTeam(r.away);
    if(!h||!a||h===a||!trustedKind(r.sourceKind))continue;
    const key=explicitEventId(r.sourceId)?`id:${r.sourceId}`:`teams:${h}|${a}`;
    const g=groups.get(key)||[];g.push(r);groups.set(key,g);
  }
  const out=[];
  for(const [eventKey,rows] of groups){
    let merged=null;for(const r of rows)merged=mergeRow(merged,r);
    merged.eventKey=eventKey;
    merged.isVirtual=virtualLike(merged);
    merged.isLive=liveLike(merged);
    merged.footballConfidence=footballEvidence(merged);
    merged.sourceVerified=rows.some(r=>trustedKind(r.sourceKind));
    merged.explicitSourceEventId=rows.some(r=>explicitEventId(r.sourceId));
    merged.sourceIdentityType=merged.explicitSourceEventId?'EXPLICIT_EVENT_ID':'NETWORK_TEAM_PAIR';
    merged.isFootball=merged.footballConfidence>=50&&!merged.isVirtual&&!otherSportLike(merged);
    merged.realSourceContract=merged.sourceVerified?'NETWORK_OR_WEBSOCKET_PAYLOAD':'UNVERIFIED';
    merged.rawRowCount=rows.length;
    out.push(merged);
  }
  return out.sort((a,b)=>(Number(b.isLive)-Number(a.isLive))||((b.footballConfidence||0)-(a.footballConfidence||0))||((b.marketCount||0)-(a.marketCount||0)));
}

let timer=null;
function persistSoon(){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    const cutoff=Date.now()-30*60*1000;
    for(const [k,v] of state.rows)if(new Date(v.capturedAt||0).getTime()<cutoff)state.rows.delete(k);
    const matches=aggregate();
    fs.writeFileSync(path.join(DATA,'latest-real-v8.json'),JSON.stringify({updatedAt:new Date().toISOString(),contract:'M88-REAL-SOURCE-v3',matchCount:matches.length,matches},null,2));
    fs.writeFileSync(path.join(DATA,'diagnostics-real-v8.json'),JSON.stringify({updatedAt:new Date().toISOString(),note:'Only Network/WebSocket payloads can enter Detection. DOM is diagnostic-only.',marketTtlSeconds:MARKET_TTL_MS/1000,rowCount:state.rows.size,frames:state.frames,sources:[...state.sources.values()].sort((a,b)=>b.rows-a.rows||b.hits-a.hits),domSamples:state.domSamples,rawSamples:[...state.rawSamples.values()].slice(-30)},null,2));
  },350);
}
function send(res,data){res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'});res.end(JSON.stringify(data,null,2));}
function staticFile(req,res){
  let p=new URL(req.url,'http://localhost').pathname;if(p==='/')p='/index.html';
  const file=path.normalize(path.join(WEB,p));
  if(!file.startsWith(WEB)||!fs.existsSync(file)){res.writeHead(404);res.end('Not found');return;}
  const ext=path.extname(file),types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
  res.writeHead(200,{'content-type':types[ext]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(file).pipe(res);
}
function proofRow(x){
  return {
    sourceTransport:x.sourceTransport,sourceKind:x.sourceKind,sourceUrl:x.sourceUrl,
    sourceEventId:x.explicitSourceEventId?safe(x.sourceId):null,
    sourceIdentityType:x.sourceIdentityType,
    home:x.home,away:x.away,sport:x.sport,league:x.league,status:x.status,
    minute:x.minute,score:[x.homeScore,x.awayScore],isLive:x.isLive,isVirtual:x.isVirtual,
    isFootball:x.isFootball,footballConfidence:x.footballConfidence,
    marketCount:x.marketCount,eventCount:x.eventCount,statsCoverage:x.statsCoverage,
    currentMarket:{market:x.market,selection:x.selection,line:x.line,handicapLine:x.handicapLine,goalLine:x.goalLine,odds:x.odds,capturedAt:x.marketCapturedAt},
    markets:(x.markets||[]).slice(0,80).map(m=>({market:m.market,selection:m.selection,line:m.line,handicapLine:m.handicapLine,goalLine:m.goalLine,odds:m.odds,status:m.status,capturedAt:m.capturedAt,sourceKind:m.sourceKind,sourceUrl:m.sourceUrl}))
  };
}

const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost'),matches=aggregate();
  const detection=matches.filter(x=>x.sourceVerified&&x.isFootball&&x.isLive&&!x.isVirtual);
  if(u.pathname==='/api/health')return send(res,{ok:true,service:'m88-pc-collector-v8-real-proof',contract:'M88-REAL-SOURCE-v3',browser:state.browser,pageUrl:state.pageUrl,lastNetworkAt:state.lastNetworkAt,lastUsefulAt:state.lastUsefulAt,lastDomAt:state.lastDomAt,domRole:'diagnostic-only',marketTtlSeconds:MARKET_TTL_MS/1000,sourceCount:state.sources.size,rowCount:state.rows.size,allNetworkMatchCount:matches.length,detectionMatchCount:detection.length,explicitEventIdMatches:detection.filter(x=>x.explicitSourceEventId).length,networkIdentityMatches:detection.filter(x=>!x.explicitSourceEventId).length,startedAt:state.startedAt});
  if(u.pathname==='/api/feed')return send(res,{ok:true,mode:'m88-real-network-ws-v8-proof',contract:'M88-REAL-SOURCE-v3',checkedAt:new Date().toISOString(),allNetworkMatchCount:matches.length,matchCount:detection.length,message:detection.length?'Real Network/WebSocket football payloads mapped. DOM never enters this feed.':'No live football payload has passed Network/WebSocket evidence yet.',matches:detection});
  if(u.pathname==='/api/event-feed')return send(res,{ok:true,mode:'m88-network-ws-v8-all',contract:'M88-REAL-SOURCE-v3',checkedAt:new Date().toISOString(),matchCount:matches.length,matches});
  if(u.pathname==='/api/proof')return send(res,{ok:true,mode:'m88-source-proof-v8',contract:'M88-REAL-SOURCE-v3',checkedAt:new Date().toISOString(),rules:{domUsedForDecision:false,networkOrWebsocketRequired:true,explicitEventIdRequired:false,missingSourceEventIdIsInvented:false,marketIdentityKeepsLatestPrice:true},matchCount:detection.length,matches:detection.map(proofRow)});
  if(u.pathname==='/api/source/probe')return send(res,{ok:true,mode:'m88-real-source-probe-v8',contract:'M88-REAL-SOURCE-v3',domRole:'diagnostic-only',pageUrl:state.pageUrl,sources:[...state.sources.values()].sort((a,b)=>b.rows-a.rows||b.hits-a.hits).slice(0,150),matchPreview:matches.slice(0,60).map(x=>({sourceEventId:x.explicitSourceEventId?safe(x.sourceId):null,sourceIdentityType:x.sourceIdentityType,sourceKind:x.sourceKind,sourceUrl:x.sourceUrl,home:x.home,away:x.away,sport:x.sport,league:x.league,status:x.status,minute:x.minute,isLive:x.isLive,isVirtual:x.isVirtual,isFootball:x.isFootball,footballConfidence:x.footballConfidence,statsCoverage:x.statsCoverage,marketCount:x.marketCount,eventCount:x.eventCount,market:x.market,selection:x.selection,line:x.line,odds:x.odds,marketCapturedAt:x.marketCapturedAt})),domSamples:state.domSamples,rawSamples:[...state.rawSamples.values()].slice(-10)});
  return staticFile(req,res);
});
server.listen(PORT,'127.0.0.1',()=>console.log(`M88 private monitor v8 REAL proof: http://127.0.0.1:${PORT}`));

async function focusLiveFootball(context){
  const exactFootball=/^(football|soccer|ฟุตบอล)$/i,exactLive=/^(live|in[ -]?play|สด|บอลสด)$/i;
  for(const p of context.pages())for(const f of p.frames()){
    try{
      const candidates=f.locator('a,button,[role="tab"],[role="button"]'),n=await candidates.count();
      for(let i=0;i<Math.min(n,500);i++){
        const el=candidates.nth(i);let txt='';try{txt=(await el.innerText()).trim();}catch{}
        if(!exactFootball.test(txt)||!(await el.isVisible().catch(()=>false)))continue;
        state.rows.clear();
        await el.click({timeout:3000}).catch(()=>{});await f.waitForTimeout(1200).catch(()=>{});
        const after=f.locator('a,button,[role="tab"],[role="button"]'),m=await after.count();
        for(let j=0;j<Math.min(m,500);j++){
          const live=after.nth(j);let lt='';try{lt=(await live.innerText()).trim();}catch{}
          if(exactLive.test(lt)&&await live.isVisible().catch(()=>false)){await live.click({timeout:3000}).catch(()=>{});break;}
        }
        state.footballFocused=true;state.footballFocusedAt=new Date().toISOString();return true;
      }
    }catch{}
  }
  return false;
}
async function launch(){
  const profile=path.join(DATA,'chrome-profile');let context;
  try{context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:null,args:['--start-maximized']});state.browser='Google Chrome';}
  catch{context=await chromium.launchPersistentContext(profile,{headless:false,viewport:null,args:['--start-maximized']});state.browser='Chromium';}
  context.on('response',captureResponse);
  function wire(p){
    p.on('websocket',ws=>{
      const url=ws.url();
      ws.on('framereceived',ev=>{
        try{const text=Buffer.isBuffer(ev.payload)?ev.payload.toString('utf8'):String(ev.payload);if(text.length>18_000_000)return;const data=parseText(text);if(data)ingest(data,url,'websocket');}catch{}
      });
    });
  }
  for(const p of context.pages())wire(p);context.on('page',wire);
  const page=context.pages()[0]||await context.newPage();
  await page.goto(SPORTS_URL,{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.log('M88 sports load:',e.message));state.pageUrl=page.url();
  await page.waitForTimeout(3500);await focusLiveFootball(context).catch(()=>false);await page.waitForTimeout(2500);
  const diagnosticDom=()=>scanDom(context,async(_rows,frames,samples)=>{state.frames=[...new Set(frames)].slice(0,150);state.domSamples=samples;state.lastDomAt=new Date().toISOString();persistSoon();}).catch(()=>{});
  await diagnosticDom();setInterval(diagnosticDom,4000);
  const monitor=await context.newPage();await monitor.goto(`http://127.0.0.1:${PORT}/`,{waitUntil:'domcontentloaded'});
  console.log('Collector v8 running: Network/WebSocket only for Detection; DOM diagnostic only; /api/proof shows source evidence.');
}
launch().catch(e=>{console.error(e);process.exitCode=1;});
