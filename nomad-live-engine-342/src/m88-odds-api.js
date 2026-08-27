const API_BASE='https://api.odds-api.io/v3';
const BOOKMAKER='M88';

const finite=v=>{
  if(v===null||v===undefined||v===''||typeof v==='boolean') return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
};

export function normalizeTeam(value=''){
  return String(value||'')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/&/g,' and ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
    .replace(/\s+/g,' ');
}

function variants(value=''){
  const base=normalizeTeam(value);
  if(!base) return new Set();
  const out=new Set([base]);
  const tokens=base.split(' ');
  const suffixes=new Set(['fc','cf','sc','afc','fk','ac','club']);
  if(tokens.length>1&&suffixes.has(tokens[tokens.length-1])) out.add(tokens.slice(0,-1).join(' '));
  if(tokens.length>1&&tokens[0]==='fc') out.add(tokens.slice(1).join(' '));
  return out;
}

export function sameTeam(a,b){
  const av=variants(a),bv=variants(b);
  for(const x of av) if(bv.has(x)) return true;
  return false;
}

export function matchLiveEvent(events,match){
  const list=Array.isArray(events)?events:Array.isArray(events?.events)?events.events:[];
  const matches=list.filter(event=>sameTeam(event?.home,match?.home)&&sameTeam(event?.away,match?.away));
  if(matches.length===1) return {status:'MATCHED',event:matches[0],count:1};
  if(matches.length>1) return {status:'AMBIGUOUS',event:null,count:matches.length};
  return {status:'NOT_FOUND',event:null,count:0};
}

const signed=n=>{
  const v=finite(n);
  if(v===null) return '';
  if(v===0) return '0';
  return v>0?`+${v}`:String(v);
};

function parseUpdatedAt(value){
  const t=Date.parse(String(value||''));
  return Number.isFinite(t)?t:null;
}

export function extractM88SpreadObservation(oddsResponse,match,now=Date.now()){
  const books=oddsResponse?.bookmakers&&typeof oddsResponse.bookmakers==='object'?oddsResponse.bookmakers:{};
  const bookKey=Object.keys(books).find(key=>String(key).toLowerCase()==='m88');
  const markets=bookKey&&Array.isArray(books[bookKey])?books[bookKey]:[];
  const spreads=markets.filter(m=>String(m?.name||'').toLowerCase()==='spread');
  const rows=[];
  for(const market of spreads){
    for(const row of Array.isArray(market?.odds)?market.odds:[]){
      const hdp=finite(row?.hdp),home=finite(row?.home),away=finite(row?.away);
      if(hdp===null||home===null||away===null||home<1||away<1) continue;
      rows.push({hdp,home,away,updatedAt:parseUpdatedAt(market?.updatedAt)});
    }
  }
  const unique=[...new Map(rows.map(row=>[`${row.hdp}|${row.home}|${row.away}`,row])).values()];
  const base={
    book:'M88',
    matchId:String(match?.id||''),
    home:String(match?.home||''),
    away:String(match?.away||''),
    minute:finite(match?.minute),
    score:Array.isArray(match?.score)?match.score.slice(0,2):null,
    oddsFormat:'DECIMAL',
    transport:'ODDS_API_IO_M88',
    providerEventId:String(oddsResponse?.id||''),
  };
  if(!unique.length) return {...base,status:'UNAVAILABLE',reason:'M88_SPREAD_UNAVAILABLE',observedAt:null,availableLines:[]};
  if(unique.length!==1){
    return {...base,status:'UNKNOWN',reason:'M88_MULTIPLE_SPREAD_LINES_MAIN_NOT_PROVEN',observedAt:Math.max(...unique.map(x=>x.updatedAt||0))||null,availableLines:unique};
  }
  const line=unique[0];
  if(line.updatedAt===null) return {...base,status:'UNKNOWN',reason:'M88_SPREAD_TIMESTAMP_MISSING',observedAt:null,availableLines:unique};
  return {
    ...base,
    status:'VALID',
    reason:'M88_SINGLE_SIGNED_HOME_SPREAD',
    observedAt:line.updatedAt||now,
    rawHomeLine:signed(line.hdp),
    rawAwayLine:signed(-line.hdp),
    homeOddsRaw:line.home,
    awayOddsRaw:line.away,
    availableLines:unique,
  };
}

async function fetchJson(url,fetchImpl){
  const response=await fetchImpl(url,{headers:{accept:'application/json'},cache:'no-store'});
  if(!response.ok) throw new Error(`odds_api_http_${response.status}`);
  return response.json();
}

export async function fetchM88Observation({apiKey,match,fetchImpl=fetch,now=Date.now()}){
  const base={book:'M88',matchId:String(match?.id||''),home:String(match?.home||''),away:String(match?.away||''),minute:finite(match?.minute),score:Array.isArray(match?.score)?match.score.slice(0,2):null,oddsFormat:'DECIMAL',transport:'ODDS_API_IO_M88'};
  if(!apiKey) return {...base,status:'UNAVAILABLE',reason:'ODDS_API_KEY_NOT_CONFIGURED',observedAt:null};
  try{
    const eventsUrl=new URL(`${API_BASE}/events/live`);
    eventsUrl.searchParams.set('apiKey',apiKey);
    eventsUrl.searchParams.set('sport','football');
    const events=await fetchJson(eventsUrl.toString(),fetchImpl);
    const found=matchLiveEvent(events,match);
    if(found.status==='NOT_FOUND') return {...base,status:'UNAVAILABLE',reason:'M88_EVENT_NOT_FOUND',observedAt:null};
    if(found.status==='AMBIGUOUS') return {...base,status:'MISMATCH',reason:'M88_EVENT_MATCH_AMBIGUOUS',observedAt:null};
    const oddsUrl=new URL(`${API_BASE}/odds`);
    oddsUrl.searchParams.set('apiKey',apiKey);
    oddsUrl.searchParams.set('eventId',String(found.event.id));
    oddsUrl.searchParams.set('bookmakers',BOOKMAKER);
    const odds=await fetchJson(oddsUrl.toString(),fetchImpl);
    return extractM88SpreadObservation(odds,match,now);
  }catch(error){
    return {...base,status:'UNAVAILABLE',reason:String(error?.message||error||'M88_API_ERROR').slice(0,120),observedAt:null};
  }
}
