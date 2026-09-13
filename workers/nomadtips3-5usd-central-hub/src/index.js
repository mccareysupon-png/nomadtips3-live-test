import { DurableObject } from 'cloudflare:workers';

const VERSION='nomad-5usd-central-hub-v0.2';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const LIVE_TTL_MS=55_000;
const REFEREE_TTL_MS=55_000;
const LIVE_PAGE_SIZE=50;
const LIVE_MAX_PAGES=10;
const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type,x-central-hub-token',
  'cache-control':'no-store'
};
const REFEREE_DEFINITIONS=Object.freeze([
  Object.freeze({sourceId:'source5',position:5,bookmaker:'1xBet',slug:'1xbet'}),
  Object.freeze({sourceId:'source6',position:6,bookmaker:'Bet365',slug:'bet365'}),
  Object.freeze({sourceId:'source9',position:9,bookmaker:'Macauslot',slug:'macauslot'}),
  Object.freeze({sourceId:'source10',position:10,bookmaker:'Crown',slug:'crown'}),
  Object.freeze({sourceId:'source14',position:14,bookmaker:'Easybets',slug:'easybets'}),
  Object.freeze({sourceId:'source15',position:15,bookmaker:'Vcbet',slug:'vcbet'}),
  Object.freeze({sourceId:'source16',position:16,bookmaker:'Interwetten',slug:'interwetten'}),
  Object.freeze({sourceId:'source18',position:18,bookmaker:'12Bet',slug:'12bet'}),
  Object.freeze({sourceId:'source21',position:21,bookmaker:'18Bet',slug:'18bet'}),
  Object.freeze({sourceId:'source25',position:25,bookmaker:'Pinnacle',slug:'pinnacle'})
]);
const REFEREE_SLUGS=REFEREE_DEFINITIONS.map(item=>item.slug).join(',');
const json=(body,status=200,extraHeaders={})=>new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...extraHeaders}});
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=v=>finite(v)?Number(v):null;
const now=()=>Date.now();
const iso=v=>finite(v)?new Date(Number(v)).toISOString():null;
const authHeaders=env=>({accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`});

function pair(value){
  if(!value||typeof value!=='object') return {home:null,away:null};
  return {home:num(value.home??value[0]),away:num(value.away??value[1])};
}

function extractRows(payload){
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.data?.data)) return payload.data.data;
  if(Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}

function paginationOf(payload){
  const p=payload?.pagination??payload?.data?.pagination??{};
  return {hasMore:Boolean(p?.has_more??p?.hasMore),page:num(p?.page),perPage:num(p?.per_page??p?.perPage)};
}

function fixtureId(f){return f?.id??f?.fixture_id??f?.fixture?.id??null;}
function minuteOf(f){
  for(const value of [f?.minute,f?.elapsed,f?.status?.minute,f?.status?.elapsed,f?.timer?.minute,f?.timer?.elapsed]) if(finite(value)) return Number(value);
  const found=String(f?.status_code??f?.statusCode??'').match(/\d+/);
  return found?Number(found[0]):null;
}
function teamNames(f){return {home:f?.teams?.home?.name??f?.home_team?.name??f?.home?.name??f?.home_name??'',away:f?.teams?.away?.name??f?.away_team?.name??f?.away?.name??f?.away_name??''};}
function leagueName(f){return f?.league?.name??f?.competition?.name??f?.league_name??'';}
function statsRoot(f){return f?.statistics??f?.stats??f?.live_statistics??{};}

function bet365Root(f){
  const direct=f?.odds??null;
  const books=direct?.bookmakers??f?.bookmakers??f?.odds_bookmakers??null;
  if(Array.isArray(books)){
    const bookmaker=books.find(item=>String(item?.slug??item?.name??item?.bookmaker??'').toLowerCase().replace(/[^a-z0-9]/g,'').includes('bet365'));
    if(bookmaker) return bookmaker.odds??bookmaker.markets??bookmaker;
  }
  return direct;
}

function normalizeInlineOdds(root){
  if(!root||typeof root!=='object') return {available:false,asianHandicap:null,goalLine:null,oneXtwo:null,raw:null};
  const ah=root?.asian_handicap?.inplay??root?.asian?.inplay??null;
  const goal=root?.goal_line?.inplay??root?.goalline?.inplay??null;
  const oneXtwo=root?.['1x2']?.inplay??root?.moneyline?.inplay??null;
  const lineValue=value=>{
    if(finite(value)) return Number(value);
    if(value&&typeof value==='object'&&finite(value.line)) return Number(value.line);
    return null;
  };
  return {
    available:true,
    asianHandicap:{line:lineValue(ah),home:num(ah?.home),away:num(ah?.away)},
    goalLine:{line:lineValue(goal),over:num(goal?.over),under:num(goal?.under)},
    oneXtwo:{home:num(oneXtwo?.home),draw:num(oneXtwo?.draw),away:num(oneXtwo?.away)},
    raw:root
  };
}

function normalizeFixture(f,observedAt){
  const id=fixtureId(f),teams=teamNames(f),stats=statsRoot(f),score=f?.goals??f?.score??{};
  return {
    fixtureId:id===null?null:String(id),
    league:{name:leagueName(f)},
    home:{name:teams.home},
    away:{name:teams.away},
    minute:minuteOf(f),
    status:f?.status??f?.status_code??'live',
    statusCode:f?.status_code??f?.statusCode??null,
    score:{home:num(score?.home),away:num(score?.away)},
    statistics:{
      attacks:pair(stats?.attacks),
      dangerousAttack:pair(stats?.dangerous_attacks??stats?.dangerousAttacks),
      shots:pair(stats?.shots??stats?.total_shots??stats?.totalShots),
      shotsOn:pair(stats?.shots_on_target??stats?.shotsOnTarget??stats?.sot),
      shotsOff:pair(stats?.shots_off_target??stats?.shotsOffTarget??stats?.off),
      corners:pair(f?.corners??stats?.corners),
      possession:pair(stats?.possession)
    },
    events:Array.isArray(f?.events)?f.events:[],
    odds:{bookmaker:'Bet365',...normalizeInlineOdds(bet365Root(f))},
    kickoffAt:f?.kickoff_utc??f?.kickoff_ts??f?.kickoff??null,
    observedAt,
    timestampKind:'hub_observed_at'
  };
}

function rateMeta(response){
  return {
    limit:num(response.headers.get('x-ratelimit-limit')),
    remaining:num(response.headers.get('x-ratelimit-remaining')),
    reset:response.headers.get('x-ratelimit-reset')??null,
    retryAfter:response.headers.get('retry-after')??null
  };
}

async function providerRequest(url,env){
  if(!env.FIVEDOLLAR_API_KEY) throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const response=await fetch(url,{headers:authHeaders(env),cf:{cacheTtl:0,cacheEverything:false}});
  const text=await response.text();
  let payload=null;try{payload=JSON.parse(text);}catch{}
  if(!response.ok){
    const error=new Error(`5USD_HTTP_${response.status}`);
    error.rate=rateMeta(response);
    throw error;
  }
  if(!payload) throw new Error('5USD_INVALID_JSON');
  return {payload,rate:rateMeta(response)};
}

async function fetchProviderLive(env){
  const byId=new Map();
  let requests=0,lastRate=null;
  for(let page=1;page<=LIVE_MAX_PAGES;page++){
    const url=`${API_BASE}/fixtures?status=live&include=odds,events,stats&per_page=${LIVE_PAGE_SIZE}&page=${page}`;
    const result=await providerRequest(url,env);requests++;lastRate=result.rate;
    const rows=extractRows(result.payload);
    for(const row of rows){const id=fixtureId(row);if(id!==null) byId.set(String(id),row);}
    const pagination=paginationOf(result.payload);
    if(!pagination.hasMore||rows.length<LIVE_PAGE_SIZE) break;
  }
  return {rows:[...byId.values()],requests,rate:lastRate};
}

function extractBookmakers(payload){
  if(Array.isArray(payload?.data?.bookmakers)) return payload.data.bookmakers;
  if(Array.isArray(payload?.bookmakers)) return payload.bookmakers;
  if(Array.isArray(payload?.data?.data?.bookmakers)) return payload.data.data.bookmakers;
  return [];
}

const normalizedBookmakerKey=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const quarterGoal=value=>finite(value)&&Math.abs(Number(value)*4-Math.round(Number(value)*4))<1e-9;

function bookmakerForDefinition(bookmakers,definition){
  const slugKey=normalizedBookmakerKey(definition.slug),nameKey=normalizedBookmakerKey(definition.bookmaker);
  return bookmakers.find(book=>{
    const keys=[book?.slug,book?.name,book?.bookmaker].map(normalizedBookmakerKey);
    return keys.includes(slugKey)||keys.includes(nameKey);
  })||null;
}

function inplayAsian(book){
  const root=book?.odds??book?.markets??book??{};
  return root?.asian_handicap?.inplay??root?.asian?.inplay??null;
}

function normalizeReferee(definition,book,observedAt,previous=null){
  const ah=inplayAsian(book);
  const line=num(ah?.line),homeOdds=num(ah?.home),awayOdds=num(ah?.away);
  const valid=line!==null&&quarterGoal(line)&&homeOdds!==null&&awayOdds!==null&&homeOdds>1&&awayOdds>1;
  const status=!book?'BOOKMAKER UNAVAILABLE':!ah?'AH UNAVAILABLE':valid?'AH READY':'AH INVALID';
  const priceFingerprint=valid?`${line}|${homeOdds}|${awayOdds}`:null;
  const unchanged=priceFingerprint&&priceFingerprint===previous?.priceFingerprint;
  const lastChangedAt=unchanged&&finite(previous?.lastChangedAt)?Number(previous.lastChangedAt):priceFingerprint?observedAt:null;
  return {
    sourceId:definition.sourceId,
    position:definition.position,
    bookmaker:definition.bookmaker,
    slug:definition.slug,
    provider:'5DollarFootballAPI',
    market:'FULL MATCH LIVE AH',
    status,
    line:valid?line:null,
    awayLine:valid?-line:null,
    homeOdds:valid?homeOdds:null,
    awayOdds:valid?awayOdds:null,
    bookmakerVerified:Boolean(book),
    observedAt,
    timestampKind:'hub_observed_at',
    sourceUpdatedAt:null,
    lastChangedAt,
    lastChangedAtKind:'hub_detected_change_at',
    priceFingerprint,
    shadowOnly:true,
    voteEligible:false
  };
}

async function fetchRefereeSnapshot(fixtureId,env,previous=null){
  const url=`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?market=asian&bookmakers=${encodeURIComponent(REFEREE_SLUGS)}`;
  const result=await providerRequest(url,env);
  const observedAt=now(),books=extractBookmakers(result.payload),previousBySource=new Map((previous?.referees||[]).map(item=>[item.sourceId,item]));
  const referees=REFEREE_DEFINITIONS.map(definition=>normalizeReferee(definition,bookmakerForDefinition(books,definition),observedAt,previousBySource.get(definition.sourceId)));
  const ready=referees.filter(item=>item.status==='AH READY').length;
  return {
    ok:true,service:'nomadtips3-5usd-central-hub',version:VERSION,provider:'5DollarFootballAPI',
    fixtureId:String(fixtureId),observedAt,observedAtIso:iso(observedAt),timestampKind:'hub_observed_at',
    mode:'SHADOW_ONLY',refereeCount:referees.length,readyCount:ready,unavailableCount:referees.length-ready,
    votingEnabled:false,referees,upstream:{requests:1,rate:result.rate}
  };
}

function authorized(request,env){
  const required=String(env.CENTRAL_HUB_TOKEN??'');
  if(!required) return true;
  return request.headers.get('x-central-hub-token')===required;
}

export class FiveUsdCentralState extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.refreshPromise=null;this.refereePromises=new Map();}

  async readCache(){return (await this.ctx.storage.get('liveCache'))??null;}
  async readMeta(){return (await this.ctx.storage.get('meta'))??{lastAttemptAt:null,lastSuccessAt:null,lastError:null,upstreamRequests:0,rate:null};}
  async readRefereeMeta(){return (await this.ctx.storage.get('refereeMeta'))??{lastAttemptAt:null,lastSuccessAt:null,lastError:null,fixtureId:null,rate:null};}
  refereeKey(fixtureId){return `referee:${fixtureId}`;}

  async health(){
    const [cache,meta,refereeMeta]=await Promise.all([this.readCache(),this.readMeta(),this.readRefereeMeta()]);
    const ageMs=finite(cache?.observedAt)?Math.max(0,now()-Number(cache.observedAt)):null;
    return {
      ok:true,service:'nomadtips3-5usd-central-hub',version:VERSION,
      mode:'ISOLATED_SHADOW_NOT_CONNECTED',
      provider:'5DollarFootballAPI',
      cache:{present:Boolean(cache),ttlMs:LIVE_TTL_MS,ageMs,fixtureCount:Array.isArray(cache?.fixtures)?cache.fixtures.length:0,observedAt:iso(cache?.observedAt)},
      upstream:{lastAttemptAt:iso(meta.lastAttemptAt),lastSuccessAt:iso(meta.lastSuccessAt),lastError:meta.lastError??null,requestsLastRefresh:Number(meta.upstreamRequests||0),rate:meta.rate??null},
      refereeBus:{count:REFEREE_DEFINITIONS.length,ttlMs:REFEREE_TTL_MS,shadowOnly:true,votingEnabled:false,lastFixtureId:refereeMeta.fixtureId??null,lastAttemptAt:iso(refereeMeta.lastAttemptAt),lastSuccessAt:iso(refereeMeta.lastSuccessAt),lastError:refereeMeta.lastError??null,rate:refereeMeta.rate??null},
      consumers:{nomad341:false,nomad343:false},
      timestampPolicy:'observedAt and lastChangedAt are HUB observation times; neither is bookmaker-native quote time'
    };
  }

  async refresh(){
    if(this.refreshPromise) return this.refreshPromise;
    this.refreshPromise=(async()=>{
      const started=now();
      const previousMeta=await this.readMeta();
      await this.ctx.storage.put('meta',{...previousMeta,lastAttemptAt:started,lastError:null});
      try{
        const upstream=await fetchProviderLive(this.env);
        const observedAt=now();
        const fixtures=upstream.rows.map(row=>normalizeFixture(row,observedAt)).filter(row=>row.fixtureId);
        const cache={
          ok:true,service:'nomadtips3-5usd-central-hub',version:VERSION,provider:'5DollarFootballAPI',
          observedAt,observedAtIso:iso(observedAt),timestampKind:'hub_observed_at',
          fixtureCount:fixtures.length,fixtures
        };
        await this.ctx.storage.put({liveCache:cache,meta:{lastAttemptAt:started,lastSuccessAt:observedAt,lastError:null,upstreamRequests:upstream.requests,rate:upstream.rate}});
        return cache;
      }catch(error){
        const meta={...previousMeta,lastAttemptAt:started,lastError:String(error?.message||error),upstreamRequests:0,rate:error?.rate??previousMeta.rate??null};
        await this.ctx.storage.put('meta',meta);
        throw error;
      }finally{this.refreshPromise=null;}
    })();
    return this.refreshPromise;
  }

  async live(){
    const cached=await this.readCache();
    const ageMs=finite(cached?.observedAt)?Math.max(0,now()-Number(cached.observedAt)):null;
    if(cached&&ageMs!==null&&ageMs<=LIVE_TTL_MS) return {...cached,cache:{hit:true,stale:false,ageMs,ttlMs:LIVE_TTL_MS}};
    try{
      const fresh=await this.refresh();
      return {...fresh,cache:{hit:false,stale:false,ageMs:0,ttlMs:LIVE_TTL_MS}};
    }catch(error){
      if(cached){
        const staleAge=Math.max(0,now()-Number(cached.observedAt||0));
        return {...cached,cache:{hit:true,stale:true,ageMs:staleAge,ttlMs:LIVE_TTL_MS},warning:String(error?.message||error)};
      }
      throw error;
    }
  }

  async referees(fixtureId){
    const key=this.refereeKey(fixtureId),cached=(await this.ctx.storage.get(key))??null;
    const ageMs=finite(cached?.observedAt)?Math.max(0,now()-Number(cached.observedAt)):null;
    if(cached&&ageMs!==null&&ageMs<=REFEREE_TTL_MS) return {...cached,cache:{hit:true,stale:false,ageMs,ttlMs:REFEREE_TTL_MS}};
    if(this.refereePromises.has(fixtureId)) return this.refereePromises.get(fixtureId);
    const promise=(async()=>{
      const started=now();
      await this.ctx.storage.put('refereeMeta',{lastAttemptAt:started,lastSuccessAt:null,lastError:null,fixtureId,rate:null});
      try{
        const fresh=await fetchRefereeSnapshot(fixtureId,this.env,cached);
        await this.ctx.storage.put(key,fresh);
        await this.ctx.storage.put('refereeMeta',{lastAttemptAt:started,lastSuccessAt:fresh.observedAt,lastError:null,fixtureId,rate:fresh.upstream?.rate??null});
        return {...fresh,cache:{hit:false,stale:false,ageMs:0,ttlMs:REFEREE_TTL_MS}};
      }catch(error){
        await this.ctx.storage.put('refereeMeta',{lastAttemptAt:started,lastSuccessAt:null,lastError:String(error?.message||error),fixtureId,rate:error?.rate??null});
        if(cached){
          const staleAge=Math.max(0,now()-Number(cached.observedAt||0));
          return {...cached,cache:{hit:true,stale:true,ageMs:staleAge,ttlMs:REFEREE_TTL_MS},warning:String(error?.message||error)};
        }
        throw error;
      }finally{this.refereePromises.delete(fixtureId);}
    })();
    this.refereePromises.set(fixtureId,promise);
    return promise;
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
    if(request.method!=='GET') return json({ok:false,error:'method_not_allowed'},405);
    if(url.pathname==='/health') return json(await this.health());
    if(url.pathname==='/live'){
      if(!authorized(request,this.env)) return json({ok:false,error:'unauthorized'},401);
      try{return json(await this.live());}
      catch(error){return json({ok:false,service:'nomadtips3-5usd-central-hub',version:VERSION,error:String(error?.message||error)},503);}
    }
    if(url.pathname==='/referees'){
      if(!authorized(request,this.env)) return json({ok:false,error:'unauthorized'},401);
      const fixtureId=String(url.searchParams.get('fixtureId')??'').trim();
      if(!/^\d+$/.test(fixtureId)) return json({ok:false,error:'fixtureId_required'},400);
      try{return json(await this.referees(fixtureId));}
      catch(error){return json({ok:false,service:'nomadtips3-5usd-central-hub',version:VERSION,fixtureId,error:String(error?.message||error)},503);}
    }
    return json({ok:false,error:'not_found'},404);
  }
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
    const url=new URL(request.url);
    if(url.pathname==='/') return json({service:'nomadtips3-5usd-central-hub',version:VERSION,status:'isolated-shadow',connectedConsumers:[],endpoints:['/health','/live','/referees']});
    const id=env.STATE.idFromName('primary');
    return env.STATE.get(id).fetch(new Request(`https://hub.local${url.pathname}${url.search}`,request));
  }
};
