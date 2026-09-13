import { DurableObject } from 'cloudflare:workers';

const VERSION='nomad-5usd-central-hub-v0.1';
const API_BASE='https://api.5dollarfootballapi.com/v1';
const LIVE_TTL_MS=55_000;
const LIVE_PAGE_SIZE=500;
const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type,x-central-hub-token',
  'cache-control':'no-store'
};
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
    asianHandicap:{
      line:lineValue(ah),
      home:num(ah?.home),
      away:num(ah?.away)
    },
    goalLine:{
      line:lineValue(goal),
      over:num(goal?.over),
      under:num(goal?.under)
    },
    oneXtwo:{
      home:num(oneXtwo?.home),
      draw:num(oneXtwo?.draw),
      away:num(oneXtwo?.away)
    },
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

async function fetchProviderLive(env){
  if(!env.FIVEDOLLAR_API_KEY) throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const url=`${API_BASE}/fixtures?status=live&include=odds,events,stats&per_page=${LIVE_PAGE_SIZE}&page=1`;
  const response=await fetch(url,{headers:authHeaders(env),cf:{cacheTtl:0,cacheEverything:false}});
  const text=await response.text();
  let payload=null;try{payload=JSON.parse(text);}catch{}
  if(!response.ok) throw new Error(`5USD_HTTP_${response.status}`);
  if(!payload) throw new Error('5USD_INVALID_JSON');
  return extractRows(payload);
}

function authorized(request,env){
  const required=String(env.CENTRAL_HUB_TOKEN??'');
  if(!required) return true;
  return request.headers.get('x-central-hub-token')===required;
}

export class FiveUsdCentralState extends DurableObject{
  constructor(ctx,env){super(ctx,env);this.refreshPromise=null;}

  async readCache(){return (await this.ctx.storage.get('liveCache'))??null;}
  async readMeta(){return (await this.ctx.storage.get('meta'))??{lastAttemptAt:null,lastSuccessAt:null,lastError:null,upstreamRequests:0};}

  async health(){
    const [cache,meta]=await Promise.all([this.readCache(),this.readMeta()]);
    const ageMs=finite(cache?.observedAt)?Math.max(0,now()-Number(cache.observedAt)):null;
    return {
      ok:true,service:'nomadtips3-5usd-central-hub',version:VERSION,
      mode:'ISOLATED_NOT_CONNECTED',
      provider:'5DollarFootballAPI',
      cache:{present:Boolean(cache),ttlMs:LIVE_TTL_MS,ageMs,fixtureCount:Array.isArray(cache?.fixtures)?cache.fixtures.length:0,observedAt:iso(cache?.observedAt)},
      upstream:{lastAttemptAt:iso(meta.lastAttemptAt),lastSuccessAt:iso(meta.lastSuccessAt),lastError:meta.lastError??null,requestsLastRefresh:Number(meta.upstreamRequests||0)},
      consumers:{nomad341:false,nomad343:false},
      timestampPolicy:'observedAt is HUB observation time; it is not bookmaker quote time'
    };
  }

  async refresh(){
    if(this.refreshPromise) return this.refreshPromise;
    this.refreshPromise=(async()=>{
      const started=now();
      const previousMeta=await this.readMeta();
      await this.ctx.storage.put('meta',{...previousMeta,lastAttemptAt:started,lastError:null});
      try{
        const rows=await fetchProviderLive(this.env);
        const observedAt=now();
        const fixtures=rows.map(row=>normalizeFixture(row,observedAt)).filter(row=>row.fixtureId);
        const cache={
          ok:true,service:'nomadtips3-5usd-central-hub',version:VERSION,provider:'5DollarFootballAPI',
          observedAt,observedAtIso:iso(observedAt),timestampKind:'hub_observed_at',
          fixtureCount:fixtures.length,fixtures
        };
        await this.ctx.storage.put({liveCache:cache,meta:{lastAttemptAt:started,lastSuccessAt:observedAt,lastError:null,upstreamRequests:1}});
        return cache;
      }catch(error){
        const meta={...previousMeta,lastAttemptAt:started,lastError:String(error?.message||error),upstreamRequests:1};
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
    return json({ok:false,error:'not_found'},404);
  }
}

export default{
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:JSON_HEADERS});
    const url=new URL(request.url);
    if(url.pathname==='/') return json({service:'nomadtips3-5usd-central-hub',version:VERSION,status:'isolated',connectedConsumers:[],endpoints:['/health','/live']});
    const id=env.STATE.idFromName('primary');
    return env.STATE.get(id).fetch(new Request(`https://hub.local${url.pathname}${url.search}`,request));
  }
};
