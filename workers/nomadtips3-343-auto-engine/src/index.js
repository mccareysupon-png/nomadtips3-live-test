import { DurableObject } from 'cloudflare:workers';
import { overLineGap, overGapPass } from './over-gap.js';
import { runCentralHubLiveShadow, runCentralHubOddsShadow, centralHubShadowEnabled } from './central-hub-shadow.js';

const VERSION = 'nomad343-auto-v2';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const LIVE_PAGE_SIZE = 500;
const REQUEST_BUDGET_PER_SCAN = 10;
const MIN_SCAN_GAP_MS = 59000;
const MAX_HISTORY = 35;
const MAX_SIGNALS = 600;

const DEFAULT_SETTINGS = {
  over:{lineMin:0.5,lineGapMax:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
  under:{sideMode:'BOTH',lineMin:0.5,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:45,attackPct:45,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
  oneXtwo:{sideMode:'BOTH',scoreTrailingMax:1,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10},
  ah:{sideMode:'BOTH',lineMin:-10,oddsMin:1.50,shotOnTarget:1,shotOff:1,corner:1,dangerousAttackPct:55,attackPct:55,possessionPct:50,evidenceRequired:3,minuteFrom:55,minuteTo:88,rollingWindowMinutes:10}
};
const DEFAULT_RUN = {over:true,under:true,oneXtwo:true,ah:true};
const cors = {
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store'
};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'content-type':'application/json; charset=utf-8'}});
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):null;
const clone=v=>JSON.parse(JSON.stringify(v));
const now=()=>Date.now();
const authHeaders=env=>({accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`});

function pair(v){return {home:num(v?.home),away:num(v?.away)}}
function deltaPair(a,b){const d=(x,y)=>x===null||y===null?null:Math.max(0,x-y);return {home:d(a.home,b.home),away:d(a.away,b.away)}}
function share(p,side){const h=num(p?.home),a=num(p?.away);if(h===null||a===null||h+a<=0)return null;return side==='HOME'?h/(h+a)*100:a/(h+a)*100}
function sideValue(p,side){return num(side==='HOME'?p?.home:p?.away)}
function extractRows(payload){if(Array.isArray(payload?.data))return payload.data;if(Array.isArray(payload?.data?.data))return payload.data.data;if(Array.isArray(payload?.fixtures))return payload.fixtures;return []}
function fixtureId(f){return f?.id??f?.fixture_id??f?.fixture?.id??null}
function minuteOf(f){for(const v of [f?.minute,f?.elapsed,f?.status?.minute,f?.status?.elapsed,f?.timer?.minute,f?.timer?.elapsed])if(finite(v))return Number(v);const m=String(f?.status_code??f?.statusCode??'').match(/\d+/);return m?Number(m[0]):null}
function teamNames(f){return {home:f?.teams?.home?.name??f?.home_team?.name??f?.home?.name??f?.home_name??'',away:f?.teams?.away?.name??f?.away_team?.name??f?.away?.name??f?.away_name??''}}
function leagueName(f){return f?.league?.name??f?.competition?.name??f?.league_name??''}
function statsRoot(f){return f?.statistics??f?.stats??f?.live_statistics??{}}
function normalizeFixture(f){
  const id=fixtureId(f),teams=teamNames(f),st=statsRoot(f);
  return {fixtureId:id===null?null:String(id),home:{name:teams.home},away:{name:teams.away},league:{name:leagueName(f)},minute:minuteOf(f),status:f?.status??f?.status_code??'live',statusCode:f?.status_code??null,goals:{home:num(f?.goals?.home??f?.score?.home),away:num(f?.goals?.away??f?.score?.away)},corners:pair(f?.corners??st?.corners),statistics:{shotsOnTarget:pair(st?.shots_on_target??st?.shotsOnTarget??st?.sot),shotsOffTarget:pair(st?.shots_off_target??st?.shotsOffTarget??st?.off),attacks:pair(st?.attacks),dangerousAttacks:pair(st?.dangerous_attacks??st?.dangerousAttacks),possession:pair(st?.possession)},events:Array.isArray(f?.events)?f.events:[],providerOdds:f?.odds??null,kickoffAt:f?.kickoff_utc??f?.kickoff_ts??null};
}
function cumulativeSnapshot(f){return {at:now(),minute:f.minute,corners:f.corners,shotsOnTarget:f.statistics.shotsOnTarget,shotsOffTarget:f.statistics.shotsOffTarget,attacks:f.statistics.attacks,dangerousAttacks:f.statistics.dangerousAttacks,possession:f.statistics.possession}}
function rolling(history,current,minutes){
  if(!Array.isArray(history)||history.length<2)return null;
  const target=(num(current.minute)??0)-Number(minutes||10);let base=null;
  for(const row of history){if(row===current)continue;if(num(row.minute)!==null&&row.minute<=target)base=row}
  if(!base){for(const row of history){if(row!==current&&num(row.minute)!==null&&num(current.minute)!==null&&row.minute<current.minute){base=row;break}}}
  if(!base||num(base.minute)===null||num(current.minute)===null||current.minute<=base.minute)return null;
  return {fromMinute:base.minute,toMinute:current.minute,shotsOnTarget:deltaPair(current.shotsOnTarget,base.shotsOnTarget),shotsOffTarget:deltaPair(current.shotsOffTarget,base.shotsOffTarget),corners:deltaPair(current.corners,base.corners),attacks:deltaPair(current.attacks,base.attacks),dangerousAttacks:deltaPair(current.dangerousAttacks,base.dangerousAttacks),possession:current.possession};
}
function evidence(cfg,roll,side,under=false){
  if(!roll)return {pass:false,count:0,required:Number(cfg.evidenceRequired||1),items:[],reason:'ROLLING_NOT_READY',strength:0};
  const values=[['shotsOnTarget',sideValue(roll.shotsOnTarget,side),Number(cfg.shotOnTarget)],['shotsOffTarget',sideValue(roll.shotsOffTarget,side),Number(cfg.shotOff)],['corner',sideValue(roll.corners,side),Number(cfg.corner)],['dangerousAttackPct',share(roll.dangerousAttacks,side),Number(cfg.dangerousAttackPct)],['attackPct',share(roll.attacks,side),Number(cfg.attackPct)],['possessionPct',sideValue(roll.possession,side),Number(cfg.possessionPct)]];
  const items=values.map(([name,value,threshold])=>({name,value,threshold,pass:value!==null&&(under?value<=threshold:value>=threshold)}));
  const count=items.filter(x=>x.pass).length,required=Number(cfg.evidenceRequired||1);
  const margin=items.filter(x=>x.pass).reduce((sum,x)=>sum+(under?(x.threshold-x.value):(x.value-x.threshold))/Math.max(1,Math.abs(x.threshold)),0);
  return {pass:count>=required,count,required,items,reason:null,strength:Number((count*100+margin).toFixed(4))};
}
function selectedSides(cfg,market){if(market==='over')return ['HOME','AWAY'];const mode=String(cfg.sideMode||'BOTH').toUpperCase();return mode==='HOME'?['HOME']:mode==='AWAY'?['AWAY']:['HOME','AWAY']}
function inlineLine(f,market,side){const root=f.providerOdds||{};if(market==='over'||market==='under')return num(root?.goal_line?.inplay??root?.goalline?.inplay);if(market==='ah'){const h=num(root?.asian_handicap?.inplay??root?.asian?.inplay);return h===null?null:(side==='HOME'?h:-h)}return null}
function inline1x2Price(f,side){const p=f.providerOdds?.['1x2']?.inplay;return {line:null,odds:num(side==='HOME'?p?.home:p?.away),drawOdds:num(p?.draw),bookmaker:'Bet365',source:'bulk-live'}}
function preEvaluate(market,cfg,f,roll,side){
  const minute=num(f.minute);if(minute===null||minute<Number(cfg.minuteFrom)||minute>Number(cfg.minuteTo))return {pass:false,stage:'MINUTE',side};
  const ev=evidence(cfg,roll,side,market==='under');if(!ev.pass)return {pass:false,stage:'EVIDENCE',side,evidence:ev};
  if(market==='oneXtwo'){const h=num(f.goals?.home)??0,a=num(f.goals?.away)??0,trailing=side==='HOME'?Math.max(0,a-h):Math.max(0,h-a);if(trailing>Number(cfg.scoreTrailingMax??99))return {pass:false,stage:'SCORE',side,evidence:ev,trailing};const price=inline1x2Price(f,side);if(price.odds===null||price.odds<Number(cfg.oddsMin))return {pass:false,stage:'PRICE',side,evidence:ev,price};return {pass:true,stage:'PREPASS',side,evidence:ev,price};}
  const line=inlineLine(f,market,side);if(line===null)return {pass:false,stage:'LINE_UNAVAILABLE',side,evidence:ev};
  if(market==='over'){if(line<Number(cfg.lineMin))return {pass:false,stage:'LINE_MIN',side,evidence:ev,line};const lineGap=overLineGap(line,f.goals);if(!overGapPass(line,f.goals,cfg.lineGapMax))return {pass:false,stage:lineGap===null?'LINE_GAP_UNAVAILABLE':'LINE_GAP',side,evidence:ev,line,lineGap};return {pass:true,stage:'PREPASS',side,evidence:ev,line,lineGap};}
  if(market==='under'&&line<Number(cfg.lineMin))return {pass:false,stage:'LINE',side,evidence:ev,line};
  if(market==='ah'&&line<Number(cfg.lineMin))return {pass:false,stage:'LINE',side,evidence:ev,line};
  return {pass:true,stage:'PREPASS',side,evidence:ev,line};
}
function chooseBest(results){return results.filter(x=>x.pass).sort((a,b)=>(b.evidence?.strength??0)-(a.evidence?.strength??0))[0]??null}
function oddsRoot(payload){
  const books=payload?.data?.bookmakers;if(Array.isArray(books)){const bet=books.find(b=>String(b?.slug??b?.name??'').toLowerCase().replace(/\s+/g,'').includes('bet365'));if(bet?.odds)return bet.odds}
  return payload?.data?.odds??payload?.odds??null;
}
async function fetchFullOdds(id,env){
  const res=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(id)}/odds?bookmakers=bet365`,{headers:authHeaders(env),cf:{cacheTtl:0,cacheEverything:false}});const text=await res.text();let payload=null;try{payload=JSON.parse(text)}catch{}
  if(!res.ok)throw new Error(`5USD_ODDS_HTTP_${res.status}`);const root=oddsRoot(payload);if(!root)throw new Error('5USD_ODDS_SHAPE');return root;
}
function refereePrice(root,market,side){
  if(market==='over'||market==='under'){const p=root?.goal_line?.inplay??root?.goalline?.inplay;return {line:num(p?.line),odds:num(market==='over'?p?.over:p?.under),bookmaker:'Bet365',source:'fixture-odds'}}
  if(market==='ah'){const p=root?.asian_handicap?.inplay??root?.asian?.inplay;const h=num(p?.line);return {line:h===null?null:(side==='HOME'?h:-h),odds:num(side==='HOME'?p?.home:p?.away),bookmaker:'Bet365',source:'fixture-odds'}}
  const p=root?.['1x2']?.inplay;return {line:null,odds:num(side==='HOME'?p?.home:p?.away),drawOdds:num(p?.draw),bookmaker:'Bet365',source:'fixture-odds'};
}
function pricePass(market,cfg,price,score){if(price?.odds===null||price?.odds===undefined||price.odds<Number(cfg.oddsMin))return false;if(market==='over')return price.line!==null&&price.line>=Number(cfg.lineMin)&&overGapPass(price.line,score,cfg.lineGapMax);if(market==='under'||market==='ah')return price.line!==null&&price.line>=Number(cfg.lineMin);return true}
function sanitizeSettings(input,current=DEFAULT_SETTINGS){const out=clone(current);for(const market of Object.keys(DEFAULT_SETTINGS))if(input?.[market]&&typeof input[market]==='object')out[market]={...out[market],...input[market]};delete out.over.lineMax;return out}
async function providerLive(env){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const url=`${API_BASE}/fixtures?status=live&include=odds,events,stats&per_page=${LIVE_PAGE_SIZE}&page=1`;
  const res=await fetch(url,{headers:authHeaders(env),cf:{cacheTtl:0,cacheEverything:false}});const text=await res.text();let payload=null;try{payload=JSON.parse(text)}catch{}
  if(!res.ok)throw new Error(`5USD_HTTP_${res.status}`);return {fixtures:extractRows(payload),requests:1};
}

export class Nomad343State extends DurableObject {
  constructor(ctx,env){super(ctx,env)}
  async state(){const stored=await this.ctx.storage.get(['settings','settingsInitialized','run','history','board','signals','lastScanAt','lastSuccessAt','lastError','lastRequestCount']);return {settings:sanitizeSettings(stored.get('settings')||DEFAULT_SETTINGS),settingsInitialized:Boolean(stored.get('settingsInitialized')),run:{...DEFAULT_RUN,...(stored.get('run')||{})},history:stored.get('history')||{},board:stored.get('board')||{fixtures:[],candidates:[],signals:[]},signals:stored.get('signals')||[],lastScanAt:stored.get('lastScanAt')||null,lastSuccessAt:stored.get('lastSuccessAt')||null,lastError:stored.get('lastError')||null,lastRequestCount:stored.get('lastRequestCount')||0}}
  async scan(){
    const s=await this.state(),t=now();if(s.lastScanAt&&t-s.lastScanAt<MIN_SCAN_GAP_MS)return {...s.board,ok:true,skipped:'SCAN_GAP',lastScanAt:s.lastScanAt};await this.ctx.storage.put('lastScanAt',t);
    if(!Object.values(s.run).some(Boolean)){const board={ok:true,version:VERSION,engineState:'STOPPED',observedAt:t,fixtures:[],candidates:[],signals:s.signals.slice(-100),run:s.run,provider:{name:'5DollarFootballAPI',requests:0}};await this.ctx.storage.put({board,lastSuccessAt:t,lastError:null,lastRequestCount:0});return board}
    try{
      const upstream=await providerLive(this.env),shadowLive=await runCentralHubLiveShadow(this.env,upstream.fixtures),normalized=upstream.fixtures.map(normalizeFixture).filter(x=>x.fixtureId),history=s.history,preCandidates=[];
      for(const f of normalized){const current=cumulativeSnapshot(f),rows=Array.isArray(history[f.fixtureId])?history[f.fixtureId]:[];rows.push(current);history[f.fixtureId]=rows.slice(-MAX_HISTORY);
        for(const market of Object.keys(DEFAULT_SETTINGS)){if(!s.run[market])continue;const cfg=s.settings[market],roll=rolling(history[f.fixtureId],current,cfg.rollingWindowMinutes),best=chooseBest(selectedSides(cfg,market).map(side=>preEvaluate(market,cfg,f,roll,side)));if(best)preCandidates.push({fixtureId:f.fixtureId,market,side:best.side,minute:f.minute,home:f.home.name,away:f.away.name,league:f.league.name,score:f.goals,evidence:best.evidence,price:best.price??null,line:best.line??null,lineGap:best.lineGap??null,observedAt:t});}
      }
      const active=new Set(normalized.map(x=>x.fixtureId));for(const id of Object.keys(history))if(!active.has(id))delete history[id];
      preCandidates.sort((a,b)=>(b.evidence?.strength??0)-(a.evidence?.strength??0));
      let requests=upstream.requests;const fullOdds=new Map(),refereeErrors=[],shadowOdds=[];
      for(const c of preCandidates){if(c.market==='oneXtwo'||fullOdds.has(c.fixtureId))continue;if(requests>=REQUEST_BUDGET_PER_SCAN)break;try{const directOdds=await fetchFullOdds(c.fixtureId,this.env);fullOdds.set(c.fixtureId,directOdds);if(centralHubShadowEnabled(this.env)&&shadowOdds.length<2)shadowOdds.push(await runCentralHubOddsShadow(c.fixtureId,directOdds,this.env))}catch(error){fullOdds.set(c.fixtureId,null);refereeErrors.push({fixtureId:c.fixtureId,error:String(error?.message||error)})}requests++}
      const candidates=[],newSignals=[];
      for(const c of preCandidates){const cfg=s.settings[c.market];let price=c.price;if(c.market!=='oneXtwo'){const root=fullOdds.get(c.fixtureId);if(root)price=refereePrice(root,c.market,c.side);else{candidates.push({...c,stage:fullOdds.has(c.fixtureId)?'PRICE_UNAVAILABLE':'PRICE_BUDGET',price:null});continue}}
        const lineGap=c.market==='over'?overLineGap(price?.line,c.score):c.lineGap??null;
        if(!pricePass(c.market,cfg,price,c.score)){candidates.push({...c,stage:'PRICE_REJECT',price,lineGap});continue}
        const candidate={...c,stage:'PASS',price,lineGap};candidates.push(candidate);
        const duplicate=s.signals.some(x=>String(x.fixtureId)===String(c.fixtureId)&&x.market===c.market);if(!duplicate){const key=`${c.fixtureId}|${c.market}`,signal={...candidate,key,lockedAt:t,status:'LOCKED'};s.signals.push(signal);newSignals.push(signal)}
      }
      const signals=s.signals.slice(-MAX_SIGNALS),board={ok:true,version:VERSION,engineState:'RUNNING',observedAt:t,fixtures:normalized,candidates,newSignals,signals:signals.slice(-100),run:s.run,provider:{name:'5DollarFootballAPI',bookmaker:'Bet365',requests,requestBudget:REQUEST_BUDGET_PER_SCAN,liveCount:normalized.length},centralHubShadow:{mode:shadowLive.enabled?'SHADOW':'OFF',live:shadowLive,odds:shadowOdds},refereeErrors};
      await this.ctx.storage.put({history,signals,board,lastSuccessAt:t,lastError:null,lastRequestCount:requests});return board;
    }catch(error){const message=String(error?.message||error);await this.ctx.storage.put({lastError:message,lastRequestCount:0});const board={...(s.board||{}),ok:false,version:VERSION,engineState:'ERROR',observedAt:t,error:message,run:s.run};await this.ctx.storage.put('board',board);return board}
  }
  async fetch(request){const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/state'){const s=await this.state(),age=s.lastSuccessAt?Math.round((now()-s.lastSuccessAt)/1000):null,anyRun=Object.values(s.run).some(Boolean);return json({ok:true,version:VERSION,settings:s.settings,settingsInitialized:s.settingsInitialized,run:s.run,status:anyRun?(age!==null&&age<=130?'ONLINE':'STARTING_OR_STALE'):'STOPPED',lastScanAt:s.lastScanAt,lastSuccessAt:s.lastSuccessAt,lastSuccessAgeSeconds:age,lastError:s.lastError,lastRequestCount:s.lastRequestCount,provider:'5DollarFootballAPI',bookmaker:'Bet365'})}
    if(request.method==='GET'&&url.pathname==='/board'){const s=await this.state();return json(s.board)}
    if(request.method==='GET'&&url.pathname==='/signals'){const s=await this.state();return json({ok:true,version:VERSION,signals:s.signals.slice(-300)})}
    if(request.method==='GET'&&url.pathname==='/referee'){const id=url.searchParams.get('id');if(!id)return json({ok:false,error:'ID_REQUIRED'},400);try{return json({ok:true,fixtureId:id,bookmaker:'Bet365',odds:await fetchFullOdds(id,this.env)})}catch(error){return json({ok:false,fixtureId:id,error:String(error?.message||error)},200)}}
    if(request.method==='POST'&&url.pathname==='/settings'){const body=await request.json().catch(()=>null);if(!body)return json({ok:false,error:'INVALID_JSON'},400);const s=await this.state(),settings=sanitizeSettings(body.settings??body,s.settings);await this.ctx.storage.put({settings,settingsInitialized:true});return json({ok:true,settings})}
    if(request.method==='POST'&&url.pathname==='/run'){const body=await request.json().catch(()=>null);if(!body)return json({ok:false,error:'INVALID_JSON'},400);const s=await this.state(),run={...s.run};if(body.market==='ALL')for(const k of Object.keys(run))run[k]=Boolean(body.running);else if(Object.hasOwn(run,body.market))run[body.market]=Boolean(body.running);else return json({ok:false,error:'UNKNOWN_MARKET'},400);await this.ctx.storage.put('run',run);return json({ok:true,run})}
    if(request.method==='POST'&&url.pathname==='/scan')return json(await this.scan());return json({ok:false,error:'NOT_FOUND'},404)}
}
function stub(env){return env.STATE.getByName('nomad343-primary')}
async function proxy(env,path,init){return stub(env).fetch(`https://state.internal${path}`,init)}
export default {async fetch(request,env){if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});const url=new URL(request.url);if(url.pathname==='/'||url.pathname==='/health'||url.pathname==='/api/state')return proxy(env,'/state');if(url.pathname==='/api/settings')return proxy(env,'/settings',request.method==='POST'?{method:'POST',headers:{'content-type':'application/json'},body:await request.text()}:undefined);if(url.pathname==='/api/run'&&request.method==='POST')return proxy(env,'/run',{method:'POST',headers:{'content-type':'application/json'},body:await request.text()});if((url.pathname==='/api/engine/board'||url.pathname==='/board')&&request.method==='GET')return proxy(env,'/board');if((url.pathname==='/api/signals'||url.pathname==='/signals')&&request.method==='GET')return proxy(env,'/signals');if(url.pathname==='/api/referee'&&request.method==='GET')return proxy(env,`/referee${url.search}`,{method:'GET'});if(url.pathname==='/scan'&&request.method==='POST')return proxy(env,'/scan',{method:'POST'});return json({ok:false,error:'NOT_FOUND',version:VERSION},404)},async scheduled(_event,env,ctx){ctx.waitUntil(proxy(env,'/scan',{method:'POST'}).then(r=>r.text()))}};
