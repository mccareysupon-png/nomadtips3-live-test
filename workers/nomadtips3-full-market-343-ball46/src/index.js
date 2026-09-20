const VERSION = 'nomad343-ball46-full-market-v6-central-producer-cache-only';
const API_BASE = 'https://api.5dollarfootballapi.com/v1';
const BOOKMAKERS = Object.freeze([
  'bet365','pinnacle','williamhill','ladbrokes','vcbet','1xbet','bwin','easybets','interwetten',
  'betfair','snai','macauslot','betsson','betathome','18bet','10bet','12bet','coral','crown'
]);
const PROVIDER_LIMIT_PER_MINUTE = 40;
const PRODUCER_MAX_CALLS_PER_CYCLE = 20;
const PRODUCER_LOCAL_MAX_PER_MINUTE = 24;
const PROVIDER_REMAINING_RESERVE = 12;
const PRODUCER_MIN_REFRESH_MS = 90_000;
const TIMEOUT_MS = 12_000;
const BOARD_CACHE_LIMIT = 64;
const PRESETS = Object.freeze({
  eco: { mode:'eco', label:'ประหยัด', cacheMs:90_000 },
  normal: { mode:'normal', label:'ปกติ', cacheMs:60_000 },
  fast: { mode:'fast', label:'เร็ว', cacheMs:45_000 }
});
const DEFAULT_MODE = 'normal';
const now = () => Date.now();
function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
function response(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...extraHeaders} });
}
function safeFixtureId(value) {
  const id = String(value ?? '').trim(); return /^[A-Za-z0-9_-]{1,96}$/.test(id) ? id : null;
}
function preset(mode) { return PRESETS[String(mode || '').toLowerCase()] || PRESETS[DEFAULT_MODE]; }
function routeOf(pathname) {
  const p = String(pathname || '');
  for (const route of ['/health','/settings','/fixture-odds','/board-cache','/__producer-board']) if (p === route || p.endsWith(route)) return route;
  return p;
}
function exactProviderPayload(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
  return data && typeof data === 'object' ? data : null;
}
function bookmakerRows(fullOdds) {
  const candidates = [fullOdds?.bookmakers, fullOdds?.data?.bookmakers, fullOdds?.odds?.bookmakers, fullOdds?.markets?.bookmakers];
  return candidates.find(Array.isArray) || [];
}
function countMarketRows(fullOdds) {
  let n = 0;
  for (const row of bookmakerRows(fullOdds)) {
    const odds = row?.odds ?? row?.markets ?? row?.data?.odds ?? row?.data?.markets;
    if (Array.isArray(odds)) n += odds.length;
    else if (odds && typeof odds === 'object') n += Object.keys(odds).length;
  }
  return n;
}
function countNumericLeaves(value, depth = 0) {
  if (depth > 10 || value === null || value === undefined) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return 1;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return 1;
  if (Array.isArray(value)) return value.reduce((n,v)=>n+countNumericLeaves(v,depth+1),0);
  if (typeof value === 'object') return Object.values(value).reduce((n,v)=>n+countNumericLeaves(v,depth+1),0);
  return 0;
}
function providerMetaFromResponse(r) {
  return {
    limit:finite(r.headers.get('x-ratelimit-limit')),
    remaining:finite(r.headers.get('x-ratelimit-remaining')),
    reset:finite(r.headers.get('x-ratelimit-reset')),
    retryAfter:finite(r.headers.get('retry-after'))
  };
}
async function providerRequest(fixtureId, key) {
  const url = new URL(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds`);
  url.searchParams.set('bookmakers', BOOKMAKERS.join(','));
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url,{cache:'no-store',signal:controller.signal,headers:{accept:'application/json',authorization:`Bearer ${key}`}});
    const meta = providerMetaFromResponse(r);
    const raw = await r.text(); let payload = null; try { payload = JSON.parse(raw); } catch {}
    if (!r.ok) {
      const err = new Error(`provider:HTTP_${r.status}`); err.status=r.status; err.providerMeta=meta; err.payload=payload; throw err;
    }
    if (!payload || typeof payload !== 'object' || Number(payload.success) !== 1) {
      const err = new Error('provider:INVALID_ODDS_RESPONSE'); err.status=502; err.providerMeta=meta; err.payload=payload; throw err;
    }
    const fullOdds = exactProviderPayload(payload);
    if (!fullOdds) { const err=new Error('provider:EMPTY_ODDS_RESPONSE'); err.status=502; err.providerMeta=meta; throw err; }
    return { fullOdds, meta };
  } catch (err) {
    if (err?.name === 'AbortError') { const timeout=new Error('provider:TIMEOUT'); timeout.status=504; throw timeout; }
    throw err;
  } finally { clearTimeout(timer); }
}
function isLiveFixture(f) {
  const board = String(f?.boardState ?? '').toLowerCase();
  const raw = `${f?.status ?? ''} ${f?.statusCode ?? ''} ${f?.statusReason ?? ''}`.toLowerCase();
  if (board === 'finished' || /finished|full_time|full time|\bft\b|ended/.test(raw)) return false;
  return board === 'live' || /in_play|in play|live|playing|first half|second half|\b1h\b|\b2h\b|half/.test(raw) || /^\d+$/.test(String(f?.statusCode ?? ''));
}
export class FullMarketGate {
  constructor(ctx, env) { this.ctx=ctx; this.env=env; this.producerPromise=null; }
  async config() { const saved=await this.ctx.storage.get('controlConfig'); return preset(saved?.mode); }
  async setConfig(mode) {
    const key=String(mode||'').toLowerCase(); if(!PRESETS[key]) { const err=new Error('INVALID_MODE'); err.status=400; throw err; }
    await this.ctx.storage.put('controlConfig',{mode:key,updatedAt:now()}); return PRESETS[key];
  }
  async callWindow() {
    const cutoff=now()-60_000, stored=await this.ctx.storage.get('providerCalls');
    return Array.isArray(stored)?stored.filter(ts=>Number(ts)>cutoff):[];
  }
  async saveCallWindow(calls) { await this.ctx.storage.put('providerCalls',calls.slice(-120)); }
  async cached(fixtureId) { const row=await this.ctx.storage.get(`fixture:${fixtureId}`); return row?.fullOdds ? row : null; }
  async producerState() { return await this.ctx.storage.get('producerState') || null; }
  cacheBody(fixtureId, entry, producer=null) {
    if (!entry?.fullOdds) return null;
    const fetchedAt=Number(entry.fetchedAt||0)||null;
    return {
      fixtureId, fullOdds:entry.fullOdds, fetchedAt, ageMs:fetchedAt?Math.max(0,now()-fetchedAt):null,
      bookmakerCount:Number(entry.bookmakerCount ?? bookmakerRows(entry.fullOdds).length),
      marketCount:Number(entry.marketCount ?? countMarketRows(entry.fullOdds)),
      numericValueCount:Number(entry.numericValueCount ?? countNumericLeaves(entry.fullOdds)),
      held:Boolean(entry.held), lastAttemptAt:entry.lastAttemptAt??null, lastSuccessAt:entry.lastSuccessAt??fetchedAt,
      lastError:entry.lastError??null, source:'FULL_MARKET_CENTRAL_CACHE', producerCycleId:entry.producerCycleId??null,
      externalRequestsAdded:0, viewerRefreshEnabled:false, producer
    };
  }
  async readOnly(fixtureId) {
    const [entry,producer]=await Promise.all([this.cached(fixtureId),this.producerState()]);
    if (!entry) return response({ok:false,version:VERSION,fixtureId,error:'FULL_MARKET_CACHE_MISS',cacheOnly:true,viewerRefreshEnabled:false,externalRequestsAdded:0,producer},404);
    return response({ok:true,version:VERSION,cacheOnly:true,...this.cacheBody(fixtureId,entry,producer)});
  }
  async boardCache(ids) {
    const list=[...new Set((Array.isArray(ids)?ids:[]).map(safeFixtureId).filter(Boolean))].slice(0,BOARD_CACHE_LIMIT);
    const producer=await this.producerState(); const entries={};
    for (const id of list) { const row=await this.cached(id); if(row) entries[id]=this.cacheBody(id,row,null); }
    return response({ok:true,version:VERSION,mode:'CENTRAL_CACHE_READ_ONLY',cacheOnly:true,viewerRefreshEnabled:false,externalRequestsAdded:0,requested:list.length,returned:Object.keys(entries).length,entries,producer});
  }
  async markHeld(fixtureId,cached,err,cycleId) {
    if (!cached?.fullOdds) return null;
    const meta=err?.providerMeta||{};
    const held={...cached,held:true,lastAttemptAt:now(),lastError:String(err?.message||err),producerCycleId:cycleId,guard:{...(cached.guard||{}),providerLimit:meta.limit??cached?.guard?.providerLimit??null,providerRemaining:meta.remaining??cached?.guard?.providerRemaining??null,providerReset:meta.reset??cached?.guard?.providerReset??null,retryAfterSec:meta.retryAfter??null}};
    await this.ctx.storage.put(`fixture:${fixtureId}`,held); return held;
  }
  async refreshOne(fixtureId,cycleId) {
    const at=now(), cached=await this.cached(fixtureId);
    const blockedUntil=finite(await this.ctx.storage.get('blockedUntil'));
    if (blockedUntil!==null && at<blockedUntil) return {ok:false,fixtureId,externalRequestsAdded:0,held:Boolean(cached),reason:'PROVIDER_BACKOFF',retryAfterSec:Math.max(1,Math.ceil((blockedUntil-at)/1000))};
    const calls=await this.callWindow();
    if (calls.length>=PRODUCER_LOCAL_MAX_PER_MINUTE) return {ok:false,fixtureId,externalRequestsAdded:0,held:Boolean(cached),reason:'LOCAL_RATE_GUARD',callsLast60s:calls.length};
    if (!this.env.FIVEDOLLAR_API_KEY) return {ok:false,fixtureId,externalRequestsAdded:0,held:Boolean(cached),reason:'FIVEDOLLAR_API_KEY_MISSING'};
    const nextCalls=[...calls,at]; await this.saveCallWindow(nextCalls);
    try {
      const result=await providerRequest(fixtureId,this.env.FIVEDOLLAR_API_KEY);
      const fullOdds=result.fullOdds; const fetchedAt=now();
      const entry={fetchedAt,fullOdds,bookmakerCount:bookmakerRows(fullOdds).length,marketCount:countMarketRows(fullOdds),numericValueCount:countNumericLeaves(fullOdds),held:false,lastAttemptAt:fetchedAt,lastSuccessAt:fetchedAt,lastError:null,producerCycleId:cycleId,guard:{accountLimitPerMinute:PROVIDER_LIMIT_PER_MINUTE,producerLocalMaxPerMinute:PRODUCER_LOCAL_MAX_PER_MINUTE,callsLast60s:nextCalls.length,providerLimit:result.meta.limit,providerRemaining:result.meta.remaining,providerReset:result.meta.reset}};
      await this.ctx.storage.put(`fixture:${fixtureId}`,entry);
      await this.ctx.storage.put('providerMeta',{at:fetchedAt,lastStatus:200,...result.meta});
      return {ok:true,fixtureId,externalRequestsAdded:1,held:false,entry,providerRemaining:result.meta.remaining};
    } catch (err) {
      const meta=err?.providerMeta||{}; await this.ctx.storage.put('providerMeta',{at:now(),lastStatus:Number(err?.status||502),limit:meta.limit??null,remaining:meta.remaining??null,reset:meta.reset??null,retryAfter:meta.retryAfter??null,error:String(err?.message||err)});
      if (Number(err?.status)===429) { const retry=Math.max(1,Number(meta.retryAfter||5)); await this.ctx.storage.put('blockedUntil',now()+retry*1000); }
      const held=await this.markHeld(fixtureId,cached,err,cycleId);
      return {ok:false,fixtureId,externalRequestsAdded:1,held:Boolean(held),reason:String(err?.message||err),providerRemaining:meta.remaining??null,retryAfterSec:meta.retryAfter??null};
    }
  }
  async prewarm(fixtureIds, sourceMeta={}) {
    if (this.producerPromise) return this.producerPromise;
    this.producerPromise=(async()=>{
      const cycleId=`fm-${now().toString(36)}`; const startedAt=now();
      const ids=[...new Set((Array.isArray(fixtureIds)?fixtureIds:[]).map(safeFixtureId).filter(Boolean))];
      const candidates=[]; let skippedFresh=0;
      for (const id of ids) { const row=await this.cached(id); const age=row?.fetchedAt?startedAt-Number(row.fetchedAt):Number.POSITIVE_INFINITY; if(age<PRODUCER_MIN_REFRESH_MS){skippedFresh++;continue;} candidates.push({id,age}); }
      candidates.sort((a,b)=>b.age-a.age);
      let attempted=0,providerCalls=0,refreshed=0,held=0,errors=0,stopReason=null;
      const details=[];
      for (const item of candidates) {
        if (providerCalls>=PRODUCER_MAX_CALLS_PER_CYCLE) { stopReason='CYCLE_BUDGET'; break; }
        const r=await this.refreshOne(item.id,cycleId); attempted++; providerCalls+=Number(r.externalRequestsAdded||0); if(r.ok) refreshed++; else { errors++; if(r.held) held++; }
        details.push({fixtureId:item.id,ok:r.ok,held:Boolean(r.held),reason:r.reason||null,externalRequestsAdded:Number(r.externalRequestsAdded||0)});
        if (r.reason==='PROVIDER_BACKOFF' || r.reason==='LOCAL_RATE_GUARD' || /HTTP_429/.test(String(r.reason||''))) { stopReason=r.reason; break; }
        if (finite(r.providerRemaining)!==null && Number(r.providerRemaining)<=PROVIDER_REMAINING_RESERVE) { stopReason='PROVIDER_RESERVE'; break; }
      }
      const state={ok:true,version:VERSION,cycleId,startedAt,finishedAt:now(),source:'SCHEDULED_CENTRAL_PRODUCER',sourceMeta,liveFixtures:ids.length,candidates:candidates.length,attempted,providerCalls,refreshed,held,errors,skippedFresh,queued:Math.max(0,candidates.length-attempted),stopReason,viewerRefreshEnabled:false,producerMaxCallsPerCycle:PRODUCER_MAX_CALLS_PER_CYCLE,producerLocalMaxPerMinute:PRODUCER_LOCAL_MAX_PER_MINUTE,providerReserve:PROVIDER_REMAINING_RESERVE,details:details.slice(-40)};
      await this.ctx.storage.put('producerState',state); return state;
    })().finally(()=>{this.producerPromise=null});
    return this.producerPromise;
  }
  async health() {
    const [calls,cfg,blockedUntil,providerMeta,producer]=await Promise.all([this.callWindow(),this.config(),this.ctx.storage.get('blockedUntil'),this.ctx.storage.get('providerMeta'),this.producerState()]);
    const blocked=finite(blockedUntil);
    return {ok:true,component:'BALL46_FULL_MARKET_GATE',version:VERSION,mode:cfg.mode,modeLabel:cfg.label,cacheOnlyViewer:true,viewerRefreshEnabled:false,bookmakerRequestCount:BOOKMAKERS.length,bookmakers:BOOKMAKERS,accountLimitPerMinute:PROVIDER_LIMIT_PER_MINUTE,producerMaxCallsPerCycle:PRODUCER_MAX_CALLS_PER_CYCLE,producerLocalMaxPerMinute:PRODUCER_LOCAL_MAX_PER_MINUTE,providerRemainingReserve:PROVIDER_REMAINING_RESERVE,callsLast60s:calls.length,blockedUntil:blocked,retryAfterSec:blocked&&blocked>now()?Math.max(1,Math.ceil((blocked-now())/1000)):0,providerMeta:providerMeta||null,producer,presets:Object.values(PRESETS)};
  }
  async fetch(request) {
    const url=new URL(request.url), route=routeOf(url.pathname);
    if(route==='/health'&&request.method==='GET') return response(await this.health());
    if(route==='/settings') {
      if(request.method==='GET') return response({ok:true,version:VERSION,config:await this.config(),presets:Object.values(PRESETS)});
      if(request.method==='PUT'||request.method==='POST') { try { const body=await request.json().catch(()=>({})); return response({ok:true,version:VERSION,config:await this.setConfig(body?.mode),presets:Object.values(PRESETS)}); } catch(err){ return response({ok:false,version:VERSION,error:String(err?.message||err)},Number(err?.status||400)); } }
      return response({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    }
    if(route==='/fixture-odds'&&request.method==='GET') {
      const id=safeFixtureId(url.searchParams.get('fixtureId')||url.searchParams.get('fixture_id')||url.searchParams.get('id'));
      if(!id) return response({ok:false,version:VERSION,error:'INVALID_FIXTURE_ID',cacheOnly:true,externalRequestsAdded:0},400);
      return this.readOnly(id);
    }
    if(route==='/board-cache'&&(request.method==='POST'||request.method==='GET')) {
      let ids=[]; if(request.method==='POST'){ const body=await request.json().catch(()=>({})); ids=Array.isArray(body?.fixtureIds)?body.fixtureIds:[]; } else ids=String(url.searchParams.get('fixtureIds')||'').split(',');
      return this.boardCache(ids);
    }
    if(route==='/__producer-board'&&request.method==='POST') {
      const body=await request.json().catch(()=>({})); return response(await this.prewarm(body?.fixtureIds,body?.sourceMeta));
    }
    return response({ok:false,version:VERSION,error:'NOT_FOUND',path:url.pathname},404);
  }
}
function gate(env) { return env.FULL_MARKET_GATE.get(env.FULL_MARKET_GATE.idFromName('global')); }
async function hubSnapshot(env) {
  if(!env.HUB) throw new Error('HUB_SERVICE_NOT_BOUND');
  const r=await env.HUB.fetch(new Request('https://hub.internal/snapshot',{method:'GET',headers:{'x-ball46-full-market-producer':'1'}}));
  const j=await r.json().catch(()=>null); if(!r.ok||j?.ok!==true||!Array.isArray(j?.fixtures)) throw new Error(`HUB_SNAPSHOT_${r.status}`);
  return j;
}
export default {
  async fetch(request,env) {
    const route=routeOf(new URL(request.url).pathname);
    if(route==='/__producer-board') return response({ok:false,version:VERSION,error:'PRODUCER_ROUTE_PRIVATE'},404);
    if(!['/fixture-odds','/board-cache','/health','/settings'].includes(route)) return response({ok:false,version:VERSION,error:'NOT_FOUND'},404);
    return gate(env).fetch(request);
  },
  async scheduled(event,env,ctx) {
    const run=(async()=>{
      try {
        const hub=await hubSnapshot(env); const live=hub.fixtures.filter(isLiveFixture); const ids=live.map(f=>safeFixtureId(f?.fixtureId??f?.id)).filter(Boolean);
        const req=new Request('https://full-market.internal/__producer-board',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds:ids,sourceMeta:{hubVersion:hub.version??null,hubFetchedAt:hub.fetchedAt??null,hubAgeMs:hub.ageMs??null,hubFixtures:hub.fixtures.length,liveFixtures:ids.length,cron:event?.cron??null}})});
        return await gate(env).fetch(req);
      } catch(err) {
        await gate(env).fetch(new Request('https://full-market.internal/__producer-board',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fixtureIds:[],sourceMeta:{error:String(err?.message||err),cron:event?.cron??null}})})).catch(()=>{});
        return null;
      }
    })();
    ctx.waitUntil(run); return run;
  }
};
