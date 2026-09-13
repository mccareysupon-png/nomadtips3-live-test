const API_BASE='https://api.5dollarfootballapi.com/v1';

export const FIVEUSD_CADENCE=Object.freeze({
  liveRefreshMs:3_000,
  liveRequestBudgetPer60s:20,
  upcomingRefreshMs:120_000,
  refereeRequestBudgetPer60s:10,
  providerRequestCeilingPer60s:40,
  livePageSize:50,
  liveMaxPages:10,
});

export const FIVEUSD_REFEREES=Object.freeze([
  Object.freeze({sourceId:'source5',position:5,bookmaker:'1xBet',slug:'1xbet'}),
  Object.freeze({sourceId:'source6',position:6,bookmaker:'Bet365',slug:'bet365'}),
  Object.freeze({sourceId:'source9',position:9,bookmaker:'Macauslot',slug:'macauslot'}),
  Object.freeze({sourceId:'source10',position:10,bookmaker:'Crown',slug:'crown'}),
  Object.freeze({sourceId:'source14',position:14,bookmaker:'Easybets',slug:'easybets'}),
  Object.freeze({sourceId:'source15',position:15,bookmaker:'Vcbet',slug:'vcbet'}),
  Object.freeze({sourceId:'source16',position:16,bookmaker:'Interwetten',slug:'interwetten'}),
  Object.freeze({sourceId:'source18',position:18,bookmaker:'12Bet',slug:'12bet'}),
  Object.freeze({sourceId:'source21',position:21,bookmaker:'18Bet',slug:'18bet'}),
  Object.freeze({sourceId:'source25',position:25,bookmaker:'Pinnacle',slug:'pinnacle'}),
]);

const finite=value=>value!==null&&value!==undefined&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value));
const num=value=>finite(value)?Number(value):null;
const text=value=>value===null||value===undefined?null:String(value);
const now=()=>Date.now();
const normalizedBookmakerKey=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const quarterGoal=value=>finite(value)&&Math.abs(Number(value)*4-Math.round(Number(value)*4))<1e-9;

export function pair(value){
  if(!value||typeof value!=='object') return {home:null,away:null};
  return {home:num(value.home??value[0]),away:num(value.away??value[1])};
}

export function extractRows(payload){
  if(Array.isArray(payload?.data)) return payload.data;
  if(Array.isArray(payload?.data?.data)) return payload.data.data;
  if(Array.isArray(payload?.fixtures)) return payload.fixtures;
  return [];
}

export function paginationOf(payload){
  const p=payload?.pagination??payload?.data?.pagination??payload?.meta?.pagination??payload?.meta??{};
  const raw=p?.has_more??p?.hasMore??payload?.has_more??payload?.hasMore??false;
  return {
    hasMore:raw===true||raw===1||raw==='1'||raw==='true',
    page:num(p?.page),
    perPage:num(p?.per_page??p?.perPage),
  };
}

export function fixtureId(fixture){
  const id=fixture?.id??fixture?.fixture_id??fixture?.fixture?.id??null;
  return id===null?null:String(id);
}

function minuteOf(fixture){
  for(const value of [fixture?.minute,fixture?.elapsed,fixture?.status?.minute,fixture?.status?.elapsed,fixture?.timer?.minute,fixture?.timer?.elapsed]){
    if(finite(value)) return Number(value);
  }
  const found=String(fixture?.status_code??fixture?.statusCode??'').match(/\d+/);
  return found?Number(found[0]):null;
}

function team(fixture,side){
  const root=fixture?.teams?.[side]??fixture?.[`${side}_team`]??fixture?.[side]??{};
  return {
    id:text(root?.id??fixture?.[`${side}_id`]??null),
    name:text(root?.name??fixture?.[`${side}_name`]??null),
  };
}

function league(fixture){
  const root=fixture?.league??fixture?.competition??{};
  return {
    id:text(root?.id??fixture?.league_id??fixture?.competition_id??null),
    name:text(root?.name??fixture?.league_name??fixture?.competition_name??null),
    country:text(root?.country?.name??root?.country??fixture?.country??null),
  };
}

function score(value){
  if(!value||typeof value!=='object') return {home:null,away:null};
  return {home:num(value.home??value[0]),away:num(value.away??value[1])};
}

function kickoffAtOf(fixture){
  const raw=fixture?.kickoff_utc??fixture?.kickoffUtc??fixture?.kickoff??fixture?.date??fixture?.start_time??null;
  if(typeof raw==='string'&&Number.isFinite(Date.parse(raw))) return Date.parse(raw);
  const numeric=num(fixture?.kickoff_ts??fixture?.start_time);
  if(numeric===null) return null;
  return numeric>10_000_000_000?numeric:numeric*1000;
}

export function classifyBoardState(fixture){
  const status=String(fixture?.status?.name??fixture?.status??'').toLowerCase();
  const code=String(fixture?.status_code??fixture?.status?.code??fixture?.status?.short??'').toLowerCase();
  const value=`${status} ${code}`;
  if(/finished|full[_ ]?time|\bft\b|ended|cancelled|canceled|abandoned|postponed|walkover/.test(value)) return 'terminal';
  if(/in[_ ]?play|live|half[_ ]?time|\bht\b/.test(value)||/^\d+$/.test(code)) return 'live';
  if(/scheduled|not[_ ]?started|\bns\b|waiting|upcoming/.test(value)) return 'scheduled';
  if(/unknown/.test(value)) return 'unknown';
  return kickoffAtOf(fixture)!==null?'scheduled':'unknown';
}

function statsRoot(fixture){return fixture?.statistics??fixture?.stats??fixture?.live_statistics??{};}

export function normalizeFixture(fixture,observedAt=now()){
  const stats=statsRoot(fixture);
  const id=fixtureId(fixture);
  const boardState=classifyBoardState(fixture);
  return {
    fixtureId:id,
    legacyMatchId:null,
    league:league(fixture),
    home:team(fixture,'home'),
    away:team(fixture,'away'),
    kickoffAt:kickoffAtOf(fixture),
    status:text(fixture?.status?.name??fixture?.status??null),
    statusCode:text(fixture?.status_code??fixture?.status?.code??fixture?.status?.short??null),
    boardState,
    minute:minuteOf(fixture),
    score:score(fixture?.goals??fixture?.score),
    stats:{
      attacks:pair(stats?.attacks),
      dangerousAttack:pair(stats?.dangerous_attacks??stats?.dangerousAttacks),
      shots:pair(stats?.shots??stats?.total_shots??stats?.totalShots),
      shotsOn:pair(stats?.shots_on_target??stats?.shotsOnTarget??stats?.sot),
      shotsOff:pair(stats?.shots_off_target??stats?.shotsOffTarget??stats?.off),
      corners:pair(fixture?.corners??stats?.corners),
      possession:pair(stats?.possession),
    },
    events:Array.isArray(fixture?.events)?fixture.events:[],
    inlineOdds:fixture?.odds??fixture?.bookmakers??fixture?.markets??null,
    provenance:{
      provider:'5DollarFootballAPI',
      observedAt,
      lastSeenAt:observedAt,
      sourceUpdatedAt:null,
      timestampKind:'adapter_observed_at',
    },
  };
}

export function filterBoardFixtures(fixtures,{at=now(),upcomingWindowMs=2*60*60*1000}={}){
  const out=[];
  for(const raw of Array.isArray(fixtures)?fixtures:[]){
    const row=raw?.fixtureId!==undefined&&raw?.boardState?raw:normalizeFixture(raw,at);
    if(!row.fixtureId) continue;
    if(row.boardState==='live') { out.push(row); continue; }
    if(row.boardState!=='scheduled') continue;
    if(!finite(row.kickoffAt)) continue;
    const delta=Number(row.kickoffAt)-at;
    if(delta>=0&&delta<=upcomingWindowMs) out.push(row);
  }
  return out.sort((a,b)=>Number(a.kickoffAt??0)-Number(b.kickoffAt??0));
}

export function dedupeFixtures(fixtures=[]){
  const map=new Map();
  for(const row of fixtures){
    const id=fixtureId(row)??row?.fixtureId??null;
    if(id!==null) map.set(String(id),row);
  }
  return [...map.values()];
}

function rateMeta(response){
  return {
    limit:num(response.headers?.get?.('x-ratelimit-limit')),
    remaining:num(response.headers?.get?.('x-ratelimit-remaining')),
    reset:response.headers?.get?.('x-ratelimit-reset')??null,
    retryAfter:response.headers?.get?.('retry-after')??null,
  };
}

async function providerRequest(url,apiKey,fetchImpl=fetch){
  if(!apiKey) throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const response=await fetchImpl(url,{headers:{accept:'application/json',authorization:`Bearer ${apiKey}`},cache:'no-store'});
  const raw=await response.text();
  let payload=null;
  try{payload=JSON.parse(raw);}catch{}
  if(!response.ok){
    const error=new Error(`5USD_HTTP_${response.status}`);
    error.status=response.status;
    error.rate=rateMeta(response);
    throw error;
  }
  if(!payload||typeof payload!=='object') throw new Error('5USD_INVALID_JSON');
  return {payload,rate:rateMeta(response)};
}

export async function fetchLiveFixtures({apiKey,fetchImpl=fetch,maxPages=FIVEUSD_CADENCE.liveMaxPages,observedAt=now()}={}){
  const byId=new Map();
  let requests=0,lastRate=null,truncated=false;
  for(let page=1;page<=maxPages;page++){
    const url=`${API_BASE}/fixtures?status=live&include=odds,events,stats&per_page=${FIVEUSD_CADENCE.livePageSize}&page=${page}`;
    const result=await providerRequest(url,apiKey,fetchImpl);
    requests+=1;lastRate=result.rate;
    const rows=extractRows(result.payload);
    for(const raw of rows){
      const normalized=normalizeFixture(raw,observedAt);
      if(normalized.fixtureId&&normalized.boardState==='live') byId.set(normalized.fixtureId,normalized);
    }
    const pagination=paginationOf(result.payload);
    const more=pagination.hasMore||rows.length===FIVEUSD_CADENCE.livePageSize;
    if(!more) break;
    if(page===maxPages) truncated=true;
  }
  return {fixtures:[...byId.values()],requests,rate:lastRate,truncated,observedAt};
}

export async function fetchScheduledFixtures({apiKey,fetchImpl=fetch,startTime,endTime,maxPages=3,observedAt=now()}={}){
  const byId=new Map();
  let requests=0,lastRate=null,truncated=false;
  for(let page=1;page<=maxPages;page++){
    const params=new URLSearchParams({status:'scheduled',per_page:String(FIVEUSD_CADENCE.livePageSize),page:String(page)});
    if(finite(startTime)) params.set('start_time',String(Math.floor(Number(startTime)/1000)));
    if(finite(endTime)) params.set('end_time',String(Math.floor(Number(endTime)/1000)));
    const result=await providerRequest(`${API_BASE}/fixtures?${params}`,apiKey,fetchImpl);
    requests+=1;lastRate=result.rate;
    const rows=extractRows(result.payload);
    for(const raw of rows){
      const normalized=normalizeFixture(raw,observedAt);
      if(normalized.fixtureId&&normalized.boardState==='scheduled') byId.set(normalized.fixtureId,normalized);
    }
    const pagination=paginationOf(result.payload);
    const more=pagination.hasMore||rows.length===FIVEUSD_CADENCE.livePageSize;
    if(!more) break;
    if(page===maxPages) truncated=true;
  }
  return {fixtures:[...byId.values()],requests,rate:lastRate,truncated,observedAt};
}

function extractBookmakers(payload){
  if(Array.isArray(payload?.data?.bookmakers)) return payload.data.bookmakers;
  if(Array.isArray(payload?.bookmakers)) return payload.bookmakers;
  if(Array.isArray(payload?.data?.data?.bookmakers)) return payload.data.data.bookmakers;
  return [];
}

function bookmakerForDefinition(bookmakers,definition){
  const slug=normalizedBookmakerKey(definition.slug),name=normalizedBookmakerKey(definition.bookmaker);
  return bookmakers.find(book=>{
    const keys=[book?.slug,book?.name,book?.bookmaker].map(normalizedBookmakerKey);
    return keys.includes(slug)||keys.includes(name);
  })??null;
}

function inplayAsian(book){
  const root=book?.odds??book?.markets??book??{};
  return root?.asian_handicap?.inplay??root?.asian?.inplay??null;
}

export function normalizeReferee(definition,book,observedAt=now(),previous=null){
  const ah=inplayAsian(book);
  const line=num(ah?.line),homeOdds=num(ah?.home),awayOdds=num(ah?.away);
  const valid=line!==null&&quarterGoal(line)&&homeOdds!==null&&awayOdds!==null&&homeOdds>1&&awayOdds>1;
  const fingerprint=valid?`${line}|${homeOdds}|${awayOdds}`:null;
  const unchanged=fingerprint&&fingerprint===previous?.priceFingerprint;
  return {
    sourceId:definition.sourceId,
    position:definition.position,
    source:'5DollarFootballAPI',
    bookmaker:definition.bookmaker,
    bookmakerVerified:Boolean(book),
    status:!book?'BOOKMAKER UNAVAILABLE':!ah?'AH UNAVAILABLE':valid?'AH READY':'AH INVALID',
    market:'FULL MATCH LIVE AH',
    line:valid?line:null,
    awayLine:valid?-line:null,
    homeOdds:valid?homeOdds:null,
    awayOdds:valid?awayOdds:null,
    sourceUpdatedAt:null,
    observedAt,
    lastSeenAt:observedAt,
    lastChangedAt:unchanged&&finite(previous?.lastChangedAt)?Number(previous.lastChangedAt):fingerprint?observedAt:null,
    priceFingerprint:fingerprint,
    timestampKind:'adapter_observed_at',
    shadowOnly:true,
    voteEligible:false,
  };
}

export async function fetchRefereeSnapshot({fixtureId:targetFixtureId,apiKey,fetchImpl=fetch,previous=null,observedAt=now()}={}){
  const id=String(targetFixtureId??'').trim();
  if(!id) throw new Error('FIVEUSD_FIXTURE_ID_MISSING');
  const slugs=FIVEUSD_REFEREES.map(item=>item.slug).join(',');
  const url=`${API_BASE}/fixtures/${encodeURIComponent(id)}/odds?market=asian&bookmakers=${encodeURIComponent(slugs)}`;
  const result=await providerRequest(url,apiKey,fetchImpl);
  const bookmakers=extractBookmakers(result.payload);
  const previousBySource=new Map((previous?.referees??[]).map(item=>[item.sourceId,item]));
  const referees=FIVEUSD_REFEREES.map(definition=>normalizeReferee(definition,bookmakerForDefinition(bookmakers,definition),observedAt,previousBySource.get(definition.sourceId)));
  return {fixtureId:id,observedAt,referees,readyCount:referees.filter(item=>item.status==='AH READY').length,requests:1,rate:result.rate};
}
