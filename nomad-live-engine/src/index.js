import {DEFAULT_CONFIG} from './config.js';
import {parseToday,parseLiveDetail,parseBet365Asian,parseEnded} from './parser.js';
import {evaluate} from './detector.js';
import {settleAsian} from './settlement.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const j=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const now=()=>Date.now();
const iso=t=>new Date(t).toISOString();
const safePair=p=>({home:Number.isFinite(p?.home)?p.home:null,away:Number.isFinite(p?.away)?p.away:null});
const timeoutFetch=async(url,ms)=>{
  const ac=new AbortController(); const timer=setTimeout(()=>ac.abort(),ms);
  try{
    return await fetch(url,{signal:ac.signal,headers:{'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache'}});
  } finally {clearTimeout(timer)}
};
async function getHtml(url,config){
  const r=await timeoutFetch(url,config.requestTimeoutMs);
  if(!r.ok) throw new Error(`source_http_${r.status}`);
  const text=await r.text();
  if(text.length<500) throw new Error('source_body_too_small');
  return text;
}
function mergePair(primary,fallback){
  return {home:Number.isFinite(primary?.home)?primary.home:(Number.isFinite(fallback?.home)?fallback.home:null),away:Number.isFinite(primary?.away)?primary.away:(Number.isFinite(fallback?.away)?fallback.away:null)};
}
function priority(s){return {'SIGNAL':0,'NEAR SIGNAL':1,'WATCHING':2,'LIVE':3}[s]??9}

export class EngineState {
  constructor(state,env){this.state=state;this.env=env;this.running=false;}
  async read(){return (await this.state.storage.get('state'))||{lastCycle:null,lastSuccess:null,lastError:null,matches:[],signals:[],cycle:0,source:{today:false,ended:false}};}
  async write(v){await this.state.storage.put('state',v);}
  async armAlarm(delay=DEFAULT_CONFIG.cycleEveryMs){
    const current=await this.state.storage.getAlarm();
    if(current==null) await this.state.storage.setAlarm(now()+delay);
  }
  async alarm(){
    if(this.running){await this.state.storage.setAlarm(now()+DEFAULT_CONFIG.cycleEveryMs);return;}
    this.running=true;
    try{await this.runCycle();}
    finally{this.running=false;await this.state.storage.setAlarm(now()+DEFAULT_CONFIG.cycleEveryMs);}
  }
  async fetch(request){
    const u=new URL(request.url);
    await this.armAlarm(1500);
    if(u.pathname==='/cycle'){
      if(this.running) return j({ok:true,running:true});
      this.running=true; try{return j(await this.runCycle());} finally{this.running=false;}
    }
    const s=await this.read();
    if((!s.lastCycle||now()-s.lastCycle>DEFAULT_CONFIG.cycleEveryMs*1.2)&&!this.running){
      this.running=true;
      this.state.waitUntil(this.runCycle().finally(()=>{this.running=false;}));
    }
    if(u.pathname==='/feed') return j(this.feed(s));
    if(u.pathname==='/statistics') return j(this.statistics(s));
    if(u.pathname==='/health') return j(this.health(s));
    if(u.pathname==='/config') return j({config:DEFAULT_CONFIG,updatedAt:s.lastCycle?iso(s.lastCycle):null});
    return j({error:'not_found'},404);
  }
  feed(s){
    const counts={live:0,watching:0,near:0,signal:0};
    for(const m of s.matches){counts.live++; if(m.state==='WATCHING')counts.watching++; if(m.state==='NEAR SIGNAL')counts.near++; if(m.state==='SIGNAL')counts.signal++;}
    return {ok:!s.lastError,updatedAt:s.lastSuccess?iso(s.lastSuccess):null,cycle:s.cycle||0,counts,matches:s.matches.sort((a,b)=>priority(a.state)-priority(b.state)||((b.momentum||0)-(a.momentum||0))).slice(0,80),lastError:s.lastError};
  }
  statistics(s){
    const settled=s.signals.filter(x=>x.settlement);
    const wins=settled.filter(x=>/WIN/.test(x.settlement.result)).length;
    const losses=settled.filter(x=>/LOSS/.test(x.settlement.result)).length;
    const pushes=settled.filter(x=>x.settlement.result==='PUSH').length;
    const profit=settled.reduce((a,x)=>a+(x.settlement.profit||0),0);
    const avgOdds=s.signals.length?s.signals.reduce((a,x)=>a+x.odds,0)/s.signals.length:0;
    return {updatedAt:s.lastSuccess?iso(s.lastSuccess):null,totalSignals:s.signals.length,settled:settled.length,wins,losses,pushes,winRate:settled.length?wins/settled.length*100:0,avgOdds,profit,roi:settled.length?profit/settled.length*100:0,records:[...s.signals].sort((a,b)=>b.lockedAt-a.lockedAt).slice(0,200)};
  }
  health(s){
    const matches=s.matches||[];
    const counts={
      matches:matches.length,
      watching:matches.filter(x=>x.state==='WATCHING').length,
      near:matches.filter(x=>x.state==='NEAR SIGNAL').length,
      liveStats:matches.filter(x=>x.freshness?.liveAt).length,
      market:matches.filter(x=>x.freshness?.oddsAt).length,
      signals:s.signals?.length||0,
      pendingSignals:(s.signals||[]).filter(x=>!x.settlement).length,
      settledSignals:(s.signals||[]).filter(x=>x.settlement).length,
    };
    return {ok:!s.lastError,lastCycle:s.lastCycle?iso(s.lastCycle):null,lastSuccess:s.lastSuccess?iso(s.lastSuccess):null,lastError:s.lastError,cycle:s.cycle||0,source:s.source||{},counts,config:{minute:`${DEFAULT_CONFIG.minuteFrom}-${DEFAULT_CONFIG.minuteTo}`,freshnessSec:Math.round(DEFAULT_CONFIG.staleAfterMs/1000),pollSec:Math.round(DEFAULT_CONFIG.cycleEveryMs/1000)}};
  }
  async runCycle(){
    const started=now(); const prev=await this.read();
    const next={...prev,lastCycle:started,cycle:(prev.cycle||0)+1,lastError:null,source:{today:false,ended:false}};
    try{
      const todayHtml=await getHtml(DEFAULT_CONFIG.scanUrl,DEFAULT_CONFIG); next.source.today=true;
      let rows=parseToday(todayHtml,DEFAULT_CONFIG.sourceHost);
      rows=rows.filter(m=>Number.isFinite(m.minute)&&m.minute>=DEFAULT_CONFIG.watchMinuteFrom&&m.minute<=DEFAULT_CONFIG.watchMinuteTo&&m.score.home!=null&&m.score.away!=null).slice(0,DEFAULT_CONFIG.maxWatchMatches);
      const enriched=await Promise.all(rows.map(async m=>{
        let live={}; let liveOk=false;
        try{live=parseLiveDetail(await getHtml(m.urls.stats,DEFAULT_CONFIG));liveOk=true;}catch{
          try{live=parseLiveDetail(await getHtml(m.urls.live,DEFAULT_CONFIG));liveOk=true;}catch{}
        }
        const stats={
          attacks:mergePair(live.attacks,m.attack),
          dangerousAttack:mergePair(live.dangerousAttack,m.dangerousAttack),
          shotsOn:safePair(live.shotsOn),
          shotsOff:safePair(live.shotsOff),
          corners:mergePair(live.corners,m.corner),
          possession:safePair(live.possession),
        };
        const score=(live.score?.home!=null&&live.score?.away!=null)?live.score:m.score;
        const minute=Number.isFinite(live.minute)?live.minute:m.minute;
        const base={id:m.id,league:m.league,home:m.home,away:m.away,minute,score,stats,urls:m.urls,freshness:{todayAt:started,liveAt:liveOk?started:null,oddsAt:null},market:null};
        let d=evaluate(base,DEFAULT_CONFIG,null);
        if(d.state==='NEAR SIGNAL'){
          try{
            const market=parseBet365Asian(await getHtml(m.urls.odds,DEFAULT_CONFIG));
            if(market){base.market=market;base.freshness.oddsAt=started;d=evaluate(base,DEFAULT_CONFIG,market);}
          }catch{}
        }
        return {...base,...d};
      }));
      const signalMap=new Map((prev.signals||[]).map(x=>[x.matchId,x]));
      for(const m of enriched){
        if(m.state!=='SIGNAL'||signalMap.has(m.id)) continue;
        signalMap.set(m.id,{matchId:m.id,league:m.league,home:m.home,away:m.away,selection:m.side,line:m.selectionLine,odds:m.selectionOdds,bookmaker:'Bet365',minute:m.minute,entryScore:m.score,stats:m.stats,momentum:m.momentum,lockedAt:started,sourceUpdatedAt:started,settlement:null});
      }
      try{
        const endedHtml=await getHtml(DEFAULT_CONFIG.endedUrl,DEFAULT_CONFIG); next.source.ended=true;
        const ended=new Map(parseEnded(endedHtml,DEFAULT_CONFIG.sourceHost).map(x=>[x.id,x]));
        for(const [id,sig] of signalMap){
          if(sig.settlement) continue; const fin=ended.get(id); if(!fin||fin.score.home==null) continue;
          sig.settlement={...settleAsian(sig,fin.score),finalScore:fin.score,settledAt:started};
        }
      }catch(e){next.source.ended=false;next.source.endedError=String(e.message||e);}
      next.matches=enriched; next.signals=[...signalMap.values()]; next.lastSuccess=now();
      await this.write(next); return this.health(next);
    }catch(e){
      next.lastError=String(e?.message||e); await this.write(next); return this.health(next);
    }
  }
}

export default {
  async fetch(request,env){
    const u=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}});
    if(u.pathname==='/') return j({service:'nomadtips3-live-engine',status:'running',endpoints:['/feed','/statistics','/health','/config']});
    const id=env.ENGINE.idFromName('primary');
    const stub=env.ENGINE.get(id);
    return stub.fetch(new Request(`https://engine.local${u.pathname}${u.search}`,request));
  },
  async scheduled(event,env,ctx){
    const id=env.ENGINE.idFromName('primary');
    const stub=env.ENGINE.get(id);
    ctx.waitUntil(stub.fetch('https://engine.local/cycle'));
  }
};
