import { DurableObject } from 'cloudflare:workers';

const VERSION='nomad343-rich-odds-v1-central-cache';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const BOOKMAKERS=[
  ['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill'],['ladbrokes','Ladbrokes'],['vcbet','VCBet'],
  ['1xbet','1xBet'],['bwin','Bwin'],['easybets','Easybets'],['interwetten','Interwetten'],['betfair','Betfair'],
  ['snai','SNAI'],['macauslot','Macau Slot'],['betsson','Betsson'],['betathome','Bet-at-home'],['18bet','18Bet'],
  ['10bet','10BET'],['12bet','12Bet'],['coral','Coral'],['crown','Crown']
];
const BOOKMAKER_QUERY=BOOKMAKERS.map(([slug])=>slug).join(',');
const MAX_PROVIDER_REQUESTS_PER_RUN=20;
const MIN_FIXTURE_REFRESH_MS=120_000;
const CACHE_STALE_MS=360_000;
const STOP_REMAINING_AT=5;
const TIMEOUT_MS=15_000;
const now=()=>Date.now();
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));

function response(body,status=200,extra={}){
  return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extra}});
}
function isLive(f){
  const raw=String(f?.boardState??f?.status??f?.statusCode??'').toLowerCase();
  if(f?.boardState==='finished'||/finished|full_time|full time|\bft\b|ended/.test(raw))return false;
  return f?.boardState==='live'||/in_play|in play|live|playing|first|second|\b1h\b|\b2h\b|\bhalf\b/.test(raw)||/^\d+$/.test(String(f?.statusCode??''));
}
function bookmakerRows(payload){
  if(Array.isArray(payload?.data?.bookmakers))return payload.data.bookmakers;
  if(Array.isArray(payload?.bookmakers))return payload.bookmakers;
  return [];
}
function norm(v){return String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function hasRichAh(rows){
  for(const row of Array.isArray(rows)?rows:[]){
    const slug=norm(row?.slug??row?.name??row?.bookmaker?.slug??row?.bookmaker?.name);
    if(slug!=='bet365')continue;
    const odds=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??{};
    const market=odds?.asian_handicap??odds?.asianHandicap??odds?.asian;
    if(!market||typeof market!=='object')continue;
    for(const stage of ['inplay','closing','opening']){
      const v=market?.[stage];if(!v||typeof v!=='object')continue;
      const h=num(v.home??v.home_odds??v.homeOdds),a=num(v.away??v.away_odds??v.awayOdds),line=num(v.line??v.hdp??v.handicap);
      if(line!==null&&(h!==null||a!==null))return true;
    }
  }
  return false;
}

async function providerFetch(env,fixtureId){
  if(!env.FIVEDOLLAR_API_KEY)throw Object.assign(new Error('FIVEDOLLAR_API_KEY_MISSING'),{status:500});
  const url=`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(BOOKMAKER_QUERY)}`;
  const ac=new AbortController(),timer=setTimeout(()=>ac.abort(),TIMEOUT_MS);
  try{
    const r=await fetch(url,{cache:'no-store',signal:ac.signal,headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});
    const raw=await r.text();let body=null;try{body=JSON.parse(raw)}catch{}
    const remaining=num(r.headers.get('x-ratelimit-remaining'));
    const reset=num(r.headers.get('x-ratelimit-reset'));
    const retryAfter=num(r.headers.get('retry-after'));
    if(!r.ok){const e=new Error(`5USD_RICH_ODDS_HTTP_${r.status}`);e.status=r.status;e.remaining=remaining;e.reset=reset;e.retryAfter=retryAfter;e.providerBody=body??raw.slice(0,300);throw e}
    if(!body||typeof body!=='object')throw Object.assign(new Error('5USD_RICH_ODDS_INVALID_JSON'),{status:502,remaining,reset,retryAfter});
    return {body,remaining,reset,retryAfter};
  }catch(e){if(e?.name==='AbortError')throw Object.assign(new Error('5USD_RICH_ODDS_TIMEOUT'),{status:504});throw e}
  finally{clearTimeout(timer)}
}

export class RichOddsCache extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.ctx=ctx;this.env=env;this.refreshPromise=null}
  async meta(){return await this.ctx.storage.get('meta')||{version:VERSION,lastAttemptAt:null,lastSuccessAt:null,lastError:null,liveIds:[],cursor:0}}
  async hubSnapshot(){
    const r=await this.env.HUB.fetch('https://hub.internal/snapshot');
    const j=await r.json().catch(()=>null);
    if(!r.ok||j?.ok!==true)throw new Error(j?.error||`HUB_HTTP_${r.status}`);
    return j;
  }
  async refresh(){
    if(this.refreshPromise)return this.refreshPromise;
    this.refreshPromise=this._refresh().finally(()=>{this.refreshPromise=null});
    return this.refreshPromise;
  }
  async _refresh(){
    const startedAt=now(),previous=await this.meta();
    try{
      const hub=await this.hubSnapshot();
      const live=(Array.isArray(hub.fixtures)?hub.fixtures:[]).filter(isLive).filter(f=>f?.fixtureId).map(f=>({fixtureId:String(f.fixtureId),home:f?.home?.name??null,away:f?.away?.name??null,minute:num(f?.minute)}));
      const liveIds=live.map(x=>x.fixtureId);
      if(!live.length){const meta={version:VERSION,mode:'CENTRAL_SCHEDULED_PER_FIXTURE',clickDriven:false,lastAttemptAt:startedAt,lastSuccessAt:now(),lastError:null,hubFetchedAt:hub.fetchedAt??null,liveCount:0,liveIds:[],cursor:0,maxProviderRequestsPerRun:MAX_PROVIDER_REQUESTS_PER_RUN,attempted:0,success:0,errors:0,rateLimited:false,planRestricted:false,stoppedLowRemaining:false,lastRemaining:null,retryAfter:null,bookmakerCount:BOOKMAKERS.length,richAhCount:0};await this.ctx.storage.put('meta',meta);return meta}
      let cursor=Math.max(0,Math.floor(num(previous.cursor)??0))%live.length;
      let attempted=0,success=0,errors=0,richAhCount=0,rateLimited=false,planRestricted=false,stoppedLowRemaining=false,lastRemaining=null,retryAfter=null,scanned=0;
      for(let step=0;step<live.length&&attempted<MAX_PROVIDER_REQUESTS_PER_RUN;step++){
        const idx=(cursor+step)%live.length,item=live[idx];scanned=step+1;
        const prior=await this.ctx.storage.get(`fixture:${item.fixtureId}`)||null;
        const age=prior?.fetchedAt?Math.max(0,startedAt-Number(prior.fetchedAt)):null;
        if(age!==null&&age<MIN_FIXTURE_REFRESH_MS)continue;
        attempted++;
        try{
          const p=await providerFetch(this.env,item.fixtureId);lastRemaining=p.remaining;
          const rows=bookmakerRows(p.body),record={fixtureId:item.fixtureId,home:item.home,away:item.away,minute:item.minute,fullOdds:clone(p.body),bookmakers:clone(rows),fetchedAt:now(),bookmakerCount:rows.length,richAh:hasRichAh(rows),remaining:p.remaining,reset:p.reset};
          await this.ctx.storage.put(`fixture:${item.fixtureId}`,record);success++;if(record.richAh)richAhCount++;
          if(p.remaining!==null&&p.remaining<=STOP_REMAINING_AT){stoppedLowRemaining=true;break}
        }catch(e){
          errors++;lastRemaining=num(e?.remaining);retryAfter=num(e?.retryAfter);
          const status=Number(e?.status)||0;
          if(status===429){rateLimited=true;break}
          if(status===403){planRestricted=true;break}
        }
      }
      const nextCursor=(cursor+Math.max(1,scanned))%live.length;
      const meta={version:VERSION,mode:'CENTRAL_SCHEDULED_PER_FIXTURE',clickDriven:false,lastAttemptAt:startedAt,lastSuccessAt:now(),lastError:null,hubFetchedAt:hub.fetchedAt??null,liveCount:live.length,liveIds,cursor:nextCursor,maxProviderRequestsPerRun:MAX_PROVIDER_REQUESTS_PER_RUN,minFixtureRefreshMs:MIN_FIXTURE_REFRESH_MS,attempted,success,errors,rateLimited,planRestricted,stoppedLowRemaining,lastRemaining,retryAfter,bookmakerCount:BOOKMAKERS.length,richAhCount};
      await this.ctx.storage.put('meta',meta);return meta;
    }catch(e){const meta={...previous,version:VERSION,mode:'CENTRAL_SCHEDULED_PER_FIXTURE',clickDriven:false,lastAttemptAt:startedAt,lastError:String(e?.message||e)};await this.ctx.storage.put('meta',meta);return meta}
  }
  async snapshot(){
    const meta=await this.meta(),rows=[];
    for(const id of Array.isArray(meta.liveIds)?meta.liveIds:[]){
      const rec=await this.ctx.storage.get(`fixture:${id}`)||null;if(!rec?.fetchedAt)continue;
      const ageMs=Math.max(0,now()-Number(rec.fetchedAt));if(ageMs>CACHE_STALE_MS)continue;
      rows.push({...rec,ageMs,stale:ageMs>MIN_FIXTURE_REFRESH_MS});
    }
    return {ok:true,version:VERSION,mode:'CENTRAL_SCHEDULED_PER_FIXTURE',clickDriven:false,providerRequestsAddedByRead:0,maxProviderRequestsPerRun:MAX_PROVIDER_REQUESTS_PER_RUN,minFixtureRefreshMs:MIN_FIXTURE_REFRESH_MS,cacheStaleMs:CACHE_STALE_MS,bookmakerCount:BOOKMAKERS.length,fetchedAt:meta.lastSuccessAt??null,liveCount:meta.liveCount??0,cachedFixtures:rows.length,rateLimited:Boolean(meta.rateLimited),planRestricted:Boolean(meta.planRestricted),stoppedLowRemaining:Boolean(meta.stoppedLowRemaining),lastRemaining:meta.lastRemaining??null,retryAfter:meta.retryAfter??null,lastError:meta.lastError??null,rows};
  }
  async health(){const meta=await this.meta();return {ok:!meta.lastError,component:'NOMAD343_RICH_ODDS',...meta,providerRequestsAddedByRead:0}}
  async fetch(request){
    const u=new URL(request.url);
    if(request.method==='POST'&&u.pathname==='/_internal/refresh')return response(await this.refresh());
    if(request.method==='GET'&&u.pathname==='/snapshot')return response(await this.snapshot());
    if(request.method==='GET'&&(u.pathname==='/health'||u.pathname==='/status'))return response(await this.health());
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  }
}
function stub(env){return env.CACHE.get(env.CACHE.idFromName('global'))}
export default{
  async fetch(request,env){
    const u=new URL(request.url),s=stub(env);
    if(request.method==='GET'&&u.pathname==='/snapshot'){const r=await s.fetch('https://rich.internal/snapshot');return response(await r.json(),r.status)}
    if(request.method==='GET'&&(u.pathname==='/health'||u.pathname==='/status')){const r=await s.fetch('https://rich.internal/health');return response(await r.json(),r.status)}
    return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
  },
  async scheduled(_event,env,ctx){ctx.waitUntil(stub(env).fetch('https://rich.internal/_internal/refresh',{method:'POST'}))}
};
