import {DurableObject} from 'cloudflare:workers';
import {DEFAULT_CONFIG,normalizeConfig,evaluateBase,evaluateFinal} from './detector.js';
import {priceMatches} from './real-market.js';
import {settleSignal,summarizeHistory} from './settlement.js';

const HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type'};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
function bangkokDate(iso){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}catch{return String(iso).slice(0,10);}}
async function serviceJson(binding,path){const response=await binding.fetch(new Request(`https://source.internal${path}`,{method:'GET'}));const payload=await response.json().catch(()=>null);if(!response.ok||!payload?.ok)throw new Error(`SOURCE_${path.replace(/\W+/g,'_').toUpperCase()}:${response.status}:${payload?.error||'INVALID_RESPONSE'}`);return payload;}
function matchKey(match){return String(match?.match?.id||'');}
function priceKey(item){return matchKey(item?.match);}

export class Car341State extends DurableObject{
  async config(){const saved=await this.ctx.storage.get('config');return{config:normalizeConfig(saved?.config||DEFAULT_CONFIG),updatedAt:saved?.updatedAt||null};}
  async health(){
    const h=await this.ctx.storage.get('health')||{},latest=await this.ctx.storage.get('latest')||{matches:[]},history=await this.ctx.storage.get('history')||[];
    return{ok:true,service:'nomadtips3-car341-engine',version:'3.4.1',phase:'FULL_ENGINE',engineEnabled:(await this.config()).config.engineEnabled,source:'GOALOO_SERVICE_BINDING',pricing:'1XBET_ODDS_API_IO',pricingConfigured:Boolean(this.env.ODDS_API_KEY),market:'AH',bookmaker:String(this.env.REAL_MARKET_BOOKMAKER||'1xbet'),settlementContract:'BET365_V4',cron:'EVERY_2_MINUTES',lastCycle:h.lastCycle||null,lastSuccess:h.lastSuccess||null,lastError:h.lastError||null,cycleMs:h.cycleMs||null,sourceLive:h.sourceLive||0,normalized:h.normalized||0,priceCandidates:h.priceCandidates||0,priced:h.priced||0,signalsCreated:h.signalsCreated||0,liveMatches:latest.matches?.length||0,historyTotal:history.length,summary:summarizeHistory(history),now:new Date().toISOString()};
  }
  async sourceStatus(){
    const [process,probe]=await Promise.all([serviceJson(this.env.SOURCE,'/health').catch(e=>({ok:false,error:String(e.message||e)})),serviceJson(this.env.SOURCE,'/source-health').catch(e=>({ok:false,error:String(e.message||e)}))]);
    return{ok:Boolean(process.ok&&probe.ok),sourceBinding:'SOURCE',process,probe,checkedAt:new Date().toISOString()};
  }
  async live(){const latest=await this.ctx.storage.get('latest')||{generatedAt:null,matches:[],signalsToday:[]};return{ok:true,service:'nomadtips3-car341-engine',version:'3.4.1',phase:'FULL_ENGINE',...latest};}
  async historyPage(url){const records=await this.ctx.storage.get('history')||[],page=Math.max(1,Math.round(num(url.searchParams.get('page'))||1)),limit=Math.max(1,Math.min(100,Math.round(num(url.searchParams.get('limit'))||25))),sorted=[...records].sort((a,b)=>Date.parse(b.selectedAt||0)-Date.parse(a.selectedAt||0)),offset=(page-1)*limit,pages=Math.max(1,Math.ceil(sorted.length/limit));return{ok:true,generatedAt:new Date().toISOString(),settlementContract:'BET365_V4',page,limit,pages,total:sorted.length,offset,summary:summarizeHistory(records),records:sorted.slice(offset,offset+limit)};}
  async scan(trigger='cron'){
    const started=Date.now(),at=new Date().toISOString();
    try{
      const [{config},sourceLive,sourceFixtures,snapshotsRaw,historyRaw]=await Promise.all([this.config(),serviceJson(this.env.SOURCE,'/live'),serviceJson(this.env.SOURCE,'/fixtures'),this.ctx.storage.get('snapshots'),this.ctx.storage.get('history')]);
      const snapshots=Array.isArray(snapshotsRaw)?snapshotsRaw:[],history=Array.isArray(historyRaw)?historyRaw:[],matches=Array.isArray(sourceLive.matches)?sourceLive.matches:[];
      const baseEvaluations=matches.map(match=>({match,evaluation:evaluateBase(match,config,snapshots)}));
      const candidates=baseEvaluations.filter(x=>x.evaluation.pass).sort((a,b)=>b.evaluation.momentum-a.evaluation.momentum).slice(0,10).map(x=>x.match);
      let pricing=[],pricingError=null;
      if(candidates.length&&this.env.ODDS_API_KEY){try{pricing=await priceMatches(this.env.ODDS_API_KEY,candidates,String(this.env.REAL_MARKET_BOOKMAKER||'1xbet'));}catch(error){pricingError=String(error?.message||error);}}
      else if(candidates.length&&!this.env.ODDS_API_KEY)pricingError='ODDS_API_KEY_MISSING';
      const byPrice=new Map(pricing.map(item=>[priceKey(item),item]));
      const enriched=matches.map(match=>{const market=byPrice.get(matchKey(match))||{match,status:candidates.some(x=>matchKey(x)===matchKey(match))?'PRICE_UNAVAILABLE':'NOT_REQUESTED',matchConfidence:0,ah:null,marketAgeSeconds:null,eventId:null};const engine=evaluateFinal(match,config,snapshots,market);return{...match,realMarket:{status:market.status,eventId:market.eventId||null,matchConfidence:market.matchConfidence||0,matchBreakdown:market.matchBreakdown||null,ah:market.ah||null,marketAgeSeconds:market.marketAgeSeconds??null,source:'1XBET_ODDS_API_IO'},engine};});
      const today=bangkokDate(at),todayExisting=history.filter(r=>r.selectionDate===today).length;let created=0;
      for(const match of enriched){
        if(match.engine.decision!=='SIGNAL')continue;
        if(config.signalLimitEnabled&&todayExisting+created>=config.maxSignalsPerDay)continue;
        const key=`${match.match.id}:${match.engine.side}:AH`;
        if(history.some(r=>r.key===key))continue;
        const selectedTeam=match.engine.side==='AWAY'?match.match.away:match.match.home;
        history.push({key,id:crypto.randomUUID(),sourceMatchId:String(match.source.matchId),selectionDate:today,selectedAt:at,league:match.match.league,home:match.match.home,away:match.match.away,kickoff:match.match.kickoff,selectedSide:match.engine.side,selectedTeam,entryMinute:match.state.minute,entryScore:{...match.score},market:'AH',rawLine:match.engine.rawLine,selectedLine:match.engine.selectedLine,line:match.engine.selectedLine,linePerspective:'SELECTED',odds:match.engine.odds,bookmaker:match.engine.bookmaker,pricingSource:'1XBET_ODDS_API_IO',oddsEventId:match.realMarket.eventId,oddsUpdatedAt:match.engine.oddsUpdatedAt,marketAgeSeconds:match.engine.marketAgeSeconds,matchConfidence:match.engine.matchConfidence,momentum:match.engine.momentum,evidence:match.engine.evidence,status:'PENDING',result:'PENDING',resultGroup:'PENDING',settlementResult:'PENDING',settlementContract:'BET365_V4',settledAt:null,finalScore:null});created++;
      }
      const fixtureById=new Map((sourceFixtures.fixtures||[]).map(f=>[String(f.id),f]));
      for(let i=0;i<history.length;i++){
        const record=history[i];if(record.settledAt)continue;const fixture=fixtureById.get(String(record.sourceMatchId));if(fixture?.status==='FT')history[i]=settleSignal(record,fixture.score,at);
      }
      while(history.length>5000)history.shift();
      snapshots.push({at,matches:matches.map(m=>({match:m.match,state:m.state,score:m.score,stats:m.stats,quality:m.quality,source:m.source}))});while(snapshots.length>120)snapshots.shift();
      const signalsToday=history.filter(r=>r.selectionDate===today).sort((a,b)=>Date.parse(b.selectedAt)-Date.parse(a.selectedAt)).slice(0,20);
      const latest={generatedAt:at,trigger,sourceGeneratedAt:sourceLive.generatedAt||null,source:'GOALOO',pricingSource:'1XBET_ODDS_API_IO',bookmaker:String(this.env.REAL_MARKET_BOOKMAKER||'1xbet'),settlementContract:'BET365_V4',pricingError,index:sourceLive.index||null,quality:sourceLive.quality||null,matches:enriched,signalsToday,summary:summarizeHistory(history)};
      await Promise.all([this.ctx.storage.put('history',history),this.ctx.storage.put('snapshots',snapshots),this.ctx.storage.put('latest',latest),this.ctx.storage.put('health',{lastCycle:at,lastSuccess:at,lastError:pricingError,cycleMs:Date.now()-started,sourceLive:sourceLive.index?.live||matches.length,normalized:matches.length,priceCandidates:candidates.length,priced:pricing.filter(x=>x.status==='MATCH').length,signalsCreated:created})]);
      console.log(JSON.stringify({event:'car341_scan',trigger,at,live:matches.length,candidates:candidates.length,priced:pricing.length,created,pricingError,cycleMs:Date.now()-started}));
      return{ok:true,...latest,cycleMs:Date.now()-started,signalsCreated:created};
    }catch(error){
      const message=String(error?.message||error);const old=await this.ctx.storage.get('health')||{};await this.ctx.storage.put('health',{...old,lastCycle:at,lastError:message,cycleMs:Date.now()-started});console.error(JSON.stringify({event:'car341_scan_error',trigger,at,error:message}));return{ok:false,error:message,generatedAt:at,cycleMs:Date.now()-started};
    }
  }
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET')return json(await this.health());
    if(url.pathname==='/source-health'&&request.method==='GET'){const status=await this.sourceStatus();return json(status,status.ok?200:502);}
    if(url.pathname==='/live'&&request.method==='GET')return json(await this.live());
    if(url.pathname==='/history'&&request.method==='GET')return json(await this.historyPage(url));
    if(url.pathname==='/config'){
      if(request.method==='GET'){const c=await this.config();return json({ok:true,...c,marketLocked:'AH',bookmaker:'1xbet',confirmationRoundsLocked:1});}
      if(request.method==='POST'){try{const body=await request.json(),config=normalizeConfig(body),updatedAt=new Date().toISOString();await this.ctx.storage.put('config',{config,updatedAt});return json({ok:true,config,updatedAt,marketLocked:'AH',confirmationRoundsLocked:1});}catch(error){return json({ok:false,error:String(error?.message||error)},400);}}
    }
    if(url.pathname==='/scan'&&request.method==='POST'){const result=await this.scan('manual');return json(result,result.ok?200:502);}
    return json({ok:true,service:'nomadtips3-car341-engine',version:'3.4.1',routes:['GET /health','GET /source-health','GET /live','GET /history','GET|POST /config','POST /scan']});
  }
}

function stub(env){const id=env.CAR341_STATE.idFromName('car341-global');return env.CAR341_STATE.get(id);}
export default{
  async fetch(request,env){if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});return stub(env).fetch(request);},
  async scheduled(_event,env,ctx){ctx.waitUntil(stub(env).fetch(new Request('https://car341.internal/scan',{method:'POST'})));}
};
