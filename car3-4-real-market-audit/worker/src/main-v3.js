import settlementWorker,{Car31State as SettlementCar31State} from './settlement-v2.js';
import {handleAnimationRequest} from './animation-v3-source.js';
import {enrichLiveResponseWithGoalooClock} from './goaloo-clock.js';
import {fetchLiveEvents,fetchMultiOdds,mapGoalooToOddsEvents,parseAsianHandicap,marketAgeSeconds} from './real-market.js';

const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*'
};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});
const textHex=buffer=>[...new Uint8Array(buffer)].map(v=>v.toString(16).padStart(2,'0')).join('');
async function sha256Hex(value){return textHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}

const CARD_AH_MAX_MATCHES=16;
const number=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;};
function cardState(match){
  const decision=String(match?.engine?.decision||'WATCH').toUpperCase();
  if(decision.includes('SIGNAL'))return'SIGNAL';
  if(decision==='NEAR'||Number(match?.engine?.streak||0)>0)return'CLOSE';
  return'WATCHING';
}
function cardStateRank(match){const state=cardState(match);return state==='SIGNAL'?3:state==='CLOSE'?2:1;}
function isVisibleCard(match){
  return match?.realMarket?.status==='MATCH'||match?.engine?.decision==='NEAR'||String(match?.engine?.decision||'').toUpperCase().includes('SIGNAL')||Number(match?.engine?.streak||0)>0;
}
function setCurrentAhFromExisting(match,bookmaker){
  const ah=match?.odds?.asianHandicap;
  if(!ah)return false;
  const line=number(ah.line),home=number(ah.home),away=number(ah.away);
  if(line===null||home===null||away===null)return false;
  match.currentAh={status:'MATCH',line,homeOdds:home,awayOdds:away,updatedAt:ah.updatedAt||match.realMarket?.oddsUpdatedAt||null,provider:String(ah.provider||bookmaker),marketAgeSeconds:number(match.realMarket?.marketAgeSeconds)};
  return true;
}
async function enrichVisibleCardsWithCurrentAh(payload,apiKey,bookmaker='1xbet'){
  const matches=Array.isArray(payload?.matches)?payload.matches:[];
  const visible=matches.filter(isVisibleCard).sort((a,b)=>cardStateRank(b)-cardStateRank(a)||(number(b?.engine?.momentum)||0)-(number(a?.engine?.momentum)||0)).slice(0,CARD_AH_MAX_MATCHES);
  const missing=[];
  for(const match of visible){
    if(!setCurrentAhFromExisting(match,bookmaker))missing.push(match);
  }
  if(!missing.length)return payload;
  if(!apiKey){
    for(const match of missing)match.currentAh={status:'KEY_MISSING',provider:bookmaker,updatedAt:null,marketAgeSeconds:null};
    return payload;
  }
  try{
    const events=await fetchLiveEvents(apiKey,bookmaker);
    const mapped=mapGoalooToOddsEvents(missing,events).filter(item=>item.event).sort((a,b)=>b.matchConfidence-a.matchConfidence).slice(0,CARD_AH_MAX_MATCHES);
    const eventIds=mapped.map(item=>item.event.id);
    const oddsPayloads=eventIds.length?await fetchMultiOdds(apiKey,eventIds,bookmaker):[];
    const oddsById=new Map(oddsPayloads.map(item=>[String(item?.id),item]));
    const mappedByMatch=new Map(mapped.map(item=>[String(item.match.sourceMatchId),item]));
    for(const match of missing){
      const mappedItem=mappedByMatch.get(String(match.sourceMatchId));
      if(!mappedItem){
        match.currentAh={status:'NOT_FOUND',provider:bookmaker,updatedAt:null,marketAgeSeconds:null};
        continue;
      }
      const oddsPayload=oddsById.get(String(mappedItem.event.id));
      const ah=parseAsianHandicap(oddsPayload,bookmaker);
      match.currentAh=ah?{
        status:'MATCH',
        line:ah.line,
        homeOdds:ah.home,
        awayOdds:ah.away,
        updatedAt:ah.updatedAt||null,
        provider:String(ah.bookmaker||bookmaker),
        marketAgeSeconds:marketAgeSeconds(ah),
        eventId:mappedItem.event.id,
        mappingConfidence:mappedItem.matchConfidence
      }:{
        status:'NO_AH',
        provider:bookmaker,
        updatedAt:null,
        marketAgeSeconds:null,
        eventId:mappedItem.event.id,
        mappingConfidence:mappedItem.matchConfidence
      };
    }
  }catch(error){
    const message=String(error?.message||error);
    for(const match of missing)match.currentAh={status:'ERROR',provider:bookmaker,error:message,updatedAt:null,marketAgeSeconds:null};
  }
  return payload;
}

export class Car31State extends SettlementCar31State{
  async hydrateStoredOddsKey(){
    if(this.env.ODDS_API_KEY)return'ENV';
    const stored=await this.state.storage.get('oddsApiKey');
    if(!stored)return'NONE';
    this.env={...this.env,ODDS_API_KEY:String(stored)};
    return'DURABLE_OBJECT';
  }

  async lockSingleConfirmationRound(){
    const saved=await this.state.storage.get('config');
    const current=saved?.config&&typeof saved.config==='object'?saved.config:{};
    if(Number(current.confirmationRounds)===1)return;
    await this.state.storage.put('config',{
      config:{...current,confirmationRounds:1},
      updatedAt:saved?.updatedAt||new Date().toISOString()
    });
  }

  async scan(trigger='cron'){
    await this.hydrateStoredOddsKey();
    await this.lockSingleConfirmationRound();
    const response=await super.scan(trigger);
    if(!response.ok)return response;
    const payload=await response.clone().json().catch(()=>null);
    if(!payload||typeof payload!=='object')return response;
    const bookmaker=String(this.env.REAL_MARKET_BOOKMAKER||'1xbet').toLowerCase();
    const latest=await this.state.storage.get('latest');
    if(!latest||typeof latest!=='object')return response;
    await enrichVisibleCardsWithCurrentAh(latest,this.env.ODDS_API_KEY,bookmaker);
    latest.cardAhPipe={source:bookmaker,api:'Odds-API.io',visibleCards:(latest.matches||[]).filter(isVisibleCard).length,maxCards:CARD_AH_MAX_MATCHES,at:latest.generatedAt||new Date().toISOString()};
    await this.state.storage.put('latest',latest);
    return json({...payload,matches:latest.matches,cardAhPipe:latest.cardAhPipe},response.status);
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname.startsWith('/bootstrap/odds-api-key/')){
      const existing=await this.state.storage.get('oddsApiKey');
      if(existing)return json({ok:true,keyConfigured:true,alreadyConfigured:true,source:'DURABLE_OBJECT'});
      const key=String(url.searchParams.get('key')||'').trim();
      const proof=url.pathname.split('/').filter(Boolean).at(-1)||'';
      if(!/^[a-f0-9]{32,}$/i.test(key))return json({ok:false,error:'INVALID_KEY_FORMAT'},400);
      const expected=await sha256Hex(`car34-bootstrap:${key}`);
      if(proof!==expected)return json({ok:false,error:'INVALID_BOOTSTRAP_PROOF'},403);
      const storedAt=new Date().toISOString();
      await this.state.storage.put('oddsApiKey',key);
      await this.state.storage.put('oddsApiKeyStoredAt',storedAt);
      this.env={...this.env,ODDS_API_KEY:key};
      return json({ok:true,keyConfigured:true,alreadyConfigured:false,source:'DURABLE_OBJECT',storedAt});
    }
    if(request.method==='GET'&&url.pathname==='/debug/key-status'){
      const source=await this.hydrateStoredOddsKey();
      const storedAt=await this.state.storage.get('oddsApiKeyStoredAt')||null;
      return json({ok:true,keyConfigured:Boolean(this.env.ODDS_API_KEY),source,storedAt});
    }
    await this.hydrateStoredOddsKey();
    return super.fetch(request);
  }
}

function car34State(env){
  const id=env.CAR31_STATE.idFromName('car31-global-shadow');
  return env.CAR31_STATE.get(id);
}

async function forceSingleConfirmationConfigRequest(request){
  const body=await request.clone().json().catch(()=>({}));
  return new Request(request.url,{
    method:'POST',
    headers:request.headers,
    body:JSON.stringify({...body,confirmationRounds:1})
  });
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if((request.method==='GET'||request.method==='OPTIONS')&&url.pathname==='/animation'){
      return handleAnimationRequest(request,env,settlementWorker);
    }
    if(request.method==='GET'&&url.pathname.startsWith('/bootstrap/odds-api-key/')){
      return car34State(env).fetch(request);
    }
    if(request.method==='GET'&&url.pathname==='/debug/key-status'){
      return car34State(env).fetch(request);
    }
    if(url.pathname==='/config'&&request.method==='POST'){
      const forced=await forceSingleConfirmationConfigRequest(request);
      return settlementWorker.fetch(forced,env,ctx);
    }
    if(url.pathname==='/config'&&request.method==='GET'){
      const response=await settlementWorker.fetch(request,env,ctx);
      const payload=await response.json().catch(()=>({ok:false}));
      return json({...payload,config:{...(payload.config||{}),confirmationRounds:1},confirmationRoundsLocked:1});
    }
    if(request.method==='GET'&&url.pathname==='/live'){
      const response=await settlementWorker.fetch(request,env,ctx);
      return enrichLiveResponseWithGoalooClock(response);
    }
    return settlementWorker.fetch(request,env,ctx);
  },
  async scheduled(_event,env,ctx){
    const request=new Request('https://car34.internal/scan',{method:'POST'});
    ctx.waitUntil(car34State(env).fetch(request));
  }
};
