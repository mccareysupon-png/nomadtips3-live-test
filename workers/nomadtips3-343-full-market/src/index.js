import { DurableObject } from 'cloudflare:workers';

const VERSION='nomad343-full-market-v2-one-request-19book';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const BOOKMAKERS=[
  ['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill'],['ladbrokes','Ladbrokes'],['vcbet','VCBet'],
  ['1xbet','1xBet'],['bwin','Bwin'],['easybets','Easybets'],['interwetten','Interwetten'],['betfair','Betfair'],
  ['snai','SNAI'],['macauslot','Macau Slot'],['betsson','Betsson'],['betathome','Bet-at-home'],['18bet','18Bet'],
  ['10bet','10BET'],['12bet','12Bet'],['coral','Coral'],['crown','Crown']
];
const BOOKMAKER_QUERY=BOOKMAKERS.map(([slug])=>slug).join(',');
const CACHE_MS=30_000;
const STALE_MS=180_000;
const WINDOW_MS=60_000;
const SOFT_LIMIT_PER_MIN=32;
const now=()=>Date.now();
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);

function response(body,status=200,extra={}){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
}
function bookmakerRows(payload){
  if(Array.isArray(payload?.data?.bookmakers))return payload.data.bookmakers;
  if(Array.isArray(payload?.bookmakers))return payload.bookmakers;
  return [];
}
function coverage(payload){
  return bookmakerRows(payload).map(row=>({slug:String(row?.slug??'').trim(),name:String(row?.name??row?.slug??'').trim(),markets:row?.odds&&typeof row.odds==='object'?Object.keys(row.odds):[]})).filter(x=>x.slug);
}

export class FullMarketHub extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.inflight=new Map()}
  async rateState(at=now()){
    const raw=await this.ctx.storage.get('providerRequestTimes')||[];
    const times=raw.filter(x=>Number.isFinite(Number(x))&&at-Number(x)<WINDOW_MS);
    if(times.length!==raw.length)await this.ctx.storage.put('providerRequestTimes',times);
    return times;
  }
  async consumeBudget(){
    const times=await this.rateState();
    if(times.length>=SOFT_LIMIT_PER_MIN)return{ok:false,used:times.length};
    times.push(now());await this.ctx.storage.put('providerRequestTimes',times);return{ok:true,used:times.length};
  }
  async providerFetch(fixtureId){
    if(!this.env.FIVEDOLLAR_API_KEY)throw Object.assign(new Error('FIVEDOLLAR_API_KEY_MISSING'),{status:500});
    const url=`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(BOOKMAKER_QUERY)}`;
    const r=await fetch(url,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${this.env.FIVEDOLLAR_API_KEY}`}});
    const raw=await r.text();let body=null;try{body=JSON.parse(raw)}catch{}
    if(!r.ok){const e=new Error(`5USD_FULL_MARKET_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));e.providerBody=body??raw.slice(0,300);throw e}
    if(!body||typeof body!=='object')throw Object.assign(new Error('5USD_FULL_MARKET_INVALID_JSON'),{status:502});
    return body;
  }
  async cached(fixtureId){return await this.ctx.storage.get(`fixture:${fixtureId}`)||null}
  async fresh(fixtureId,previous){
    const budget=await this.consumeBudget();
    if(!budget.ok){
      const age=previous?.fetchedAt?now()-Number(previous.fetchedAt):null;
      if(previous?.fullOdds&&age!==null&&age<=STALE_MS)return this.pack(fixtureId,previous,true,true,'CACHE_RATE_GUARD',budget.used);
      throw Object.assign(new Error('FULL_MARKET_SOFT_RATE_LIMIT'),{status:429,retryAfter:2});
    }
    try{
      const fullOdds=await this.providerFetch(fixtureId),record={fullOdds:clone(fullOdds),fetchedAt:now(),coverage:coverage(fullOdds)};
      await this.ctx.storage.put(`fixture:${fixtureId}`,record);
      return this.pack(fixtureId,record,false,false,'5USD_ONE_REQUEST_19BOOK',budget.used);
    }catch(error){
      const age=previous?.fetchedAt?now()-Number(previous.fetchedAt):null;
      if(previous?.fullOdds&&age!==null&&age<=STALE_MS)return{...this.pack(fixtureId,previous,true,true,'CACHE_PROVIDER_FALLBACK',budget.used),refreshError:String(error?.message||error)};
      throw error;
    }
  }
  pack(fixtureId,record,cached,stale,source,used){
    return{ok:true,fixtureId,version:VERSION,source,requestMode:'ONE_FIXTURE_ONE_REQUEST_ALL_BOOKMAKERS',providerRequestsAdded:cached?0:1,requestedBookmakers:BOOKMAKERS.map(([slug,name])=>({slug,name})),availableBookmakers:record.coverage||coverage(record.fullOdds),fullOdds:clone(record.fullOdds),fetchedAt:record.fetchedAt,cached,stale,cacheMs:CACHE_MS,rate:{softLimitPerMinute:SOFT_LIMIT_PER_MIN,usedInWindow:used}};
  }
  async fixtureOdds(fixtureId){
    const previous=await this.cached(fixtureId),age=previous?.fetchedAt?Math.max(0,now()-Number(previous.fetchedAt)):null;
    if(previous?.fullOdds&&age!==null&&age<=CACHE_MS){const times=await this.rateState();return this.pack(fixtureId,previous,true,false,'FULL_MARKET_CACHE',times.length)}
    if(this.inflight.has(fixtureId))return this.inflight.get(fixtureId);
    const task=this.fresh(fixtureId,previous).finally(()=>this.inflight.delete(fixtureId));this.inflight.set(fixtureId,task);return task;
  }
  async health(){
    const times=await this.rateState();return{ok:true,component:'NOMAD343_FULL_MARKET',version:VERSION,requestMode:'ONE_FIXTURE_ONE_REQUEST_ALL_BOOKMAKERS',bookmakerCount:BOOKMAKERS.length,bookmakers:BOOKMAKERS.map(([slug,name])=>({slug,name})),cacheMs:CACHE_MS,staleMs:STALE_MS,rate:{softLimitPerMinute:SOFT_LIMIT_PER_MIN,usedInWindow:times.length}};
  }
  async fetch(request){
    const u=new URL(request.url);
    if(request.method==='GET'&&(u.pathname==='/health'||u.pathname==='/status'))return response(await this.health());
    if(request.method==='GET'&&u.pathname==='/fixture-odds'){
      const fixtureId=String(u.searchParams.get('fixtureId')||'').trim();if(!fixtureId)return response({ok:false,version:VERSION,error:'FIXTURE_ID_REQUIRED'},400);
      try{return response(await this.fixtureOdds(fixtureId))}catch(error){const status=Number(error?.status)>=400&&Number(error?.status)<600?Number(error.status):502,retry=num(error?.retryAfter);return response({ok:false,version:VERSION,fixtureId,error:String(error?.message||error),retryAfter:retry},status,retry!==null?{'retry-after':String(retry)}:{})}
    }
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  }
}
function stub(env){return env.FULL_MARKET.get(env.FULL_MARKET.idFromName('global'))}
export default{
  async fetch(request,env){
    const u=new URL(request.url);if(!['GET','HEAD'].includes(request.method))return response({ok:false,version:VERSION,error:'METHOD_NOT_ALLOWED'},405);
    const target=new URL('https://full-market.internal');target.pathname=u.pathname;target.search=u.search;
    const r=await stub(env).fetch(new Request(target,{method:'GET',headers:{accept:'application/json'}}));
    return request.method==='HEAD'?new Response(null,{status:r.status,headers:r.headers}):r;
  }
};
