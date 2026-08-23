import {teamSimilarity} from './real-market.js';

const BASE='https://www.nowgoal.net';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';
const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
const n=value=>finite(value)?Number(value):null;

// Keep the three production sockets already proven in 3.41 exactly where they are.
// SOURCE 8 remains intentionally unused after the retired 5Dollar experiment.
export const NOWGOAL_BOOKMAKERS=Object.freeze([
  Object.freeze({companyId:'50',bookmaker:'1xBet',sourceId:'source5',position:5,core:true}),
  Object.freeze({companyId:'8',bookmaker:'Bet365',sourceId:'source6',position:6,core:true}),
  Object.freeze({companyId:'17',bookmaker:'M88',sourceId:'source7',position:7,core:true}),
  Object.freeze({companyId:'1',bookmaker:'Macauslot',sourceId:'source9',position:9}),
  Object.freeze({companyId:'3',bookmaker:'Crown',sourceId:'source10',position:10}),
  Object.freeze({companyId:'4',bookmaker:'Ladbrokes',sourceId:'source11',position:11}),
  Object.freeze({companyId:'7',bookmaker:'SNAI',sourceId:'source12',position:12}),
  Object.freeze({companyId:'9',bookmaker:'William Hill',sourceId:'source13',position:13}),
  Object.freeze({companyId:'12',bookmaker:'Easybets',sourceId:'source14',position:14}),
  Object.freeze({companyId:'14',bookmaker:'Vcbet',sourceId:'source15',position:15}),
  Object.freeze({companyId:'19',bookmaker:'Interwetten',sourceId:'source16',position:16}),
  Object.freeze({companyId:'22',bookmaker:'10BET',sourceId:'source17',position:17}),
  Object.freeze({companyId:'24',bookmaker:'12Bet',sourceId:'source18',position:18}),
  Object.freeze({companyId:'31',bookmaker:'Sbobet',sourceId:'source19',position:19}),
  Object.freeze({companyId:'35',bookmaker:'Wewbet',sourceId:'source20',position:20}),
  Object.freeze({companyId:'42',bookmaker:'18Bet',sourceId:'source21',position:21}),
  Object.freeze({companyId:'48',bookmaker:'HK Jockey Club',sourceId:'source22',position:22}),
  Object.freeze({companyId:'49',bookmaker:'BWin',sourceId:'source23',position:23}),
  Object.freeze({companyId:'23',bookmaker:'188BET',sourceId:'source24',position:24}),
  Object.freeze({companyId:'47',bookmaker:'Pinnacle',sourceId:'source25',position:25}),
]);

const COMPANY_ID='50';
const BET365_COMPANY_ID='8';
const M88_COMPANY_ID='17';
const EXTRA_BOOKMAKERS=NOWGOAL_BOOKMAKERS.filter(item=>!item.core);

// These three caches are retained for strict backward compatibility with the
// already-proven 3.41 sockets. New bookmakers are deliberately change-feed-only
// so they do not introduce additional mutable module state.
const observedPriceChanges=new Map();
const observedBet365PriceChanges=new Map();
const observedM88PriceChanges=new Map();

function bookmakerUnavailable(bookmaker,reason='nowgoal_unavailable',extra={}){
  return {status:'AH UNAVAILABLE',reason,source:'Nowgoal',bookmaker,bookmakerVerified:true,market:'FULL MATCH LIVE AH',sourceUpdatedAt:null,...extra};
}

export function nowgoalUnavailable(reason='nowgoal_unavailable'){
  return bookmakerUnavailable('1xBet',reason);
}

export function nowgoalBet365Unavailable(reason='nowgoal_bet365_unavailable'){
  return bookmakerUnavailable('Bet365',reason);
}

export function nowgoalM88Unavailable(reason='nowgoal_m88_unavailable'){
  return bookmakerUnavailable('M88',reason);
}

function cookieFromHeaders(headers){
  const all=typeof headers?.getSetCookie==='function'?headers.getSetCookie():[];
  if(all.length) return all.map(v=>String(v).split(';')[0]).filter(Boolean).join('; ');
  const one=headers?.get?.('set-cookie')||'';
  return one?String(one).split(';')[0]:'';
}

async function requestText(fetchImpl,path,config,cookie='',accept='*/*'){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),config?.requestTimeoutMs||9000);
  try{
    const response=await fetchImpl(new URL(path,BASE).toString(),{
      signal:controller.signal,redirect:'follow',cache:'no-store',
      headers:{'user-agent':UA,'accept':accept,'accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store','pragma':'no-cache','referer':`${BASE}/`,...(cookie?{cookie}:{})}
    });
    const text=await response.text();
    if(!response.ok) throw new Error(`NOWGOAL_HTTP_${response.status}`);
    return {text,cookie:cookieFromHeaders(response.headers)};
  }finally{clearTimeout(timer);}
}

function splitLiteral(body=''){
  const out=[]; let current='',quote=null,escape=false;
  for(const ch of body){
    if(quote){
      if(escape){current+=ch;escape=false;continue;}
      if(ch==='\\'){escape=true;continue;}
      if(ch===quote){quote=null;continue;}
      current+=ch;continue;
    }
    if(ch==='\''||ch==='"'){quote=ch;continue;}
    if(ch===','){out.push(current.trim());current='';continue;}
    current+=ch;continue;
  }
  out.push(current.trim());
  return out.map(value=>value===''?null:value);
}

export function parseNowgoalRoster(js=''){
  const rows=[];
  for(const match of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)){
    const f=splitLiteral(match[1]);
    const id=String(f[0]??'').trim();
    if(!/^\d+$/.test(id)) continue;
    rows.push({id,home:String(f[4]??'').trim(),away:String(f[5]??'').trim(),date:String(f[6]??'').trim(),state:n(f[8]),score:{home:n(f[9]),away:n(f[10])}});
  }
  return rows;
}

export function parseGoal50Rows(xml=''){
  const rows=new Map();
  for(const match of String(xml).matchAll(/<m>([^<]+)<\/m>/g)){
    const f=match[1].split(',');
    const id=String(f[0]||'').trim();
    if(!/^\d+$/.test(id)) continue;
    rows.set(id,{id,rawLine:n(f[2]),homeHk:n(f[3]),awayHk:n(f[4]),fields:f});
  }
  return rows;
}

export function normalizeNowgoalBookmakerAhRow(row,sourceUpdatedAt,bookmaker='1xBet'){
  const unavailable=reason=>bookmakerUnavailable(bookmaker,reason);
  if(!row||!finite(row.rawLine)||!finite(row.homeHk)||!finite(row.awayHk)) return unavailable('invalid_nowgoal_ah_row');
  // NowGoal raw AH: positive = HOME gives, negative = AWAY gives.
  // NOMAD stores canonical HOME handicap, therefore flip the raw sign exactly once.
  // NowGoal feed prices are Hong Kong odds; NOMAD stores decimal odds.
  const line=-Number(row.rawLine);
  const homeOdds=Number((Number(row.homeHk)+1).toFixed(4));
  const awayOdds=Number((Number(row.awayHk)+1).toFixed(4));
  if(!finite(line)||!finite(homeOdds)||!finite(awayOdds)||homeOdds<=1||awayOdds<=1) return unavailable('invalid_nowgoal_ah_row');
  if(!finite(sourceUpdatedAt)) return unavailable('missing_verified_price_change_time');
  return {status:'AH READY',line,homeOdds,awayOdds,bookmaker,bookmakerVerified:true,market:'FULL MATCH LIVE AH',source:'Nowgoal',sourceUpdatedAt:Number(sourceUpdatedAt),sourceTimestampKind:'nowgoal_change_observed'};
}

export function normalizeNowgoalAhRow(row,sourceUpdatedAt){
  const market=normalizeNowgoalBookmakerAhRow(row,sourceUpdatedAt,'1xBet');
  if(market.status!=='AH READY'&&market.reason==='invalid_nowgoal_ah_row') return nowgoalUnavailable('invalid_nowgoal_ah_row');
  if(market.status!=='AH READY'&&market.reason==='missing_verified_price_change_time') return nowgoalUnavailable('missing_verified_price_change_time');
  return market;
}

export function normalizeNowgoalBet365AhRow(row,sourceUpdatedAt){
  const market=normalizeNowgoalBookmakerAhRow(row,sourceUpdatedAt,'Bet365');
  if(market.status!=='AH READY'&&market.reason==='invalid_nowgoal_ah_row') return nowgoalBet365Unavailable('invalid_nowgoal_bet365_ah_row');
  if(market.status!=='AH READY'&&market.reason==='missing_verified_price_change_time') return nowgoalBet365Unavailable('missing_verified_price_change_time');
  return market;
}

export function normalizeNowgoalM88AhRow(row,sourceUpdatedAt){
  const market=normalizeNowgoalBookmakerAhRow(row,sourceUpdatedAt,'M88');
  if(market.status!=='AH READY'&&market.reason==='invalid_nowgoal_ah_row') return nowgoalM88Unavailable('invalid_nowgoal_m88_ah_row');
  if(market.status!=='AH READY'&&market.reason==='missing_verified_price_change_time') return nowgoalM88Unavailable('missing_verified_price_change_time');
  return market;
}

function teamVariant(value=''){
  const text=String(value).trim().toLowerCase();
  const youth=text.match(/(?:^|[\s(\-])(?:u|under\s*)(\d{2})(?:$|[\s)\-])/i);
  return {
    women:/\(\s*w\s*\)|(?:^|\s)(?:women|ladies|feminine|femenino)(?:$|\s)/i.test(text),
    youth:youth?Number(youth[1]):null,
    reserve:/(?:^|\s)(?:reserves?|reserve|ii|b)(?:$|\s)/i.test(text),
  };
}

function sameVariant(a,b){
  const left=teamVariant(a),right=teamVariant(b);
  if(left.women!==right.women) return false;
  if((left.youth==null)!==(right.youth==null)) return false;
  if(left.youth!=null&&right.youth!=null&&left.youth!==right.youth) return false;
  if(left.reserve!==right.reserve) return false;
  return true;
}

export function nowgoalMappingCompatible(match,row){
  if(!match||!row) return false;
  if(!sameVariant(match.home,row.home)||!sameVariant(match.away,row.away)) return false;
  const matchScore=match.score||{},rowScore=row.score||{};
  const bothScoresKnown=finite(matchScore.home)&&finite(matchScore.away)&&finite(rowScore.home)&&finite(rowScore.away);
  if(bothScoresKnown&&(Number(matchScore.home)!==Number(rowScore.home)||Number(matchScore.away)!==Number(rowScore.away))) return false;
  return true;
}

function mapMatches(matches,roster){
  const candidates=roster.filter(row=>Number.isFinite(row.state)&&row.state>0);
  const unused=new Set(candidates.map((_,i)=>i));
  return matches.map(match=>{
    let best=null;
    for(const index of unused){
      const row=candidates[index];
      if(!nowgoalMappingCompatible(match,row)) continue;
      const home=teamSimilarity(match.home,row.home),away=teamSimilarity(match.away,row.away),score=(home+away)/2;
      if(home<.62||away<.62||score<.74) continue;
      if(!best||score>best.score) best={index,row,score,home,away};
    }
    if(!best) return {match,row:null,confidence:0};
    unused.delete(best.index);
    return {match,row:best.row,confidence:Number(best.score.toFixed(4)),breakdown:{home:Number(best.home.toFixed(4)),away:Number(best.away.toFixed(4))}};
  });
}

function refreshObservedChanges(cache,changed,observedAt,keepMs){
  for(const [id,value] of [...cache.entries()]) if(!finite(value)||observedAt-Number(value)>keepMs) cache.delete(id);
  for(const id of changed.keys()) cache.set(id,observedAt);
  return Object.fromEntries([...cache.entries()].map(([id,value])=>[id,Number(value)]));
}

function attachMapping(market,item){
  market.mappingConfidence=item.confidence;
  market.mapping=item.breakdown;
  market.nowgoalMatchId=item.row?.id??null;
  return market;
}

export async function fetchNowgoal1xBetMarkets(matches=[],config,observedAt=Date.now(),previousUpdates=null,fetchImpl=fetch){
  const targets=Array.isArray(matches)?matches:[];
  if(!targets.length) return {status:'NOT_NEEDED',checked:0,mapped:0,ready:0,results:[],priceUpdates:{},bet365PriceUpdates:{},m88PriceUpdates:{},bookmakers:{total:NOWGOAL_BOOKMAKERS.length,extraChecked:0,readyBySource:{}},checkedAt:observedAt};
  const homepage=await requestText(fetchImpl,'/',config,'','text/html,*/*');
  const cookie=homepage.cookie;
  if(!cookie) throw new Error('NOWGOAL_SESSION_COOKIE_MISSING');
  const optionalText=promise=>promise.catch(error=>({text:'',cookie:'',error}));
  const requests=[
    requestText(fetchImpl,'/gf/data/bf_en-idn1.js?'+observedAt,config,cookie,'application/javascript,text/javascript,*/*'),
    requestText(fetchImpl,`/gf/data/odds/en/goal${COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*'),
    requestText(fetchImpl,`/gf/data/odds/en/ch_goal${COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*'),
    optionalText(requestText(fetchImpl,`/gf/data/odds/en/goal${BET365_COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*')),
    optionalText(requestText(fetchImpl,`/gf/data/odds/en/ch_goal${BET365_COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*')),
    optionalText(requestText(fetchImpl,`/gf/data/odds/en/goal${M88_COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*')),
    optionalText(requestText(fetchImpl,`/gf/data/odds/en/ch_goal${M88_COMPANY_ID}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*')),
    ...EXTRA_BOOKMAKERS.map(definition=>optionalText(requestText(fetchImpl,`/gf/data/odds/en/ch_goal${definition.companyId}.xml?${observedAt}`,config,cookie,'application/xml,text/xml,*/*'))),
  ];
  const responses=await Promise.all(requests);
  const [rosterResponse,fullResponse,changeResponse,bet365FullResponse,bet365ChangeResponse,m88FullResponse,m88ChangeResponse,...extraChangeResponses]=responses;
  const roster=parseNowgoalRoster(rosterResponse.text),full=parseGoal50Rows(fullResponse.text),changed=parseGoal50Rows(changeResponse.text);
  const bet365Full=parseGoal50Rows(bet365FullResponse.text),bet365Changed=parseGoal50Rows(bet365ChangeResponse.text);
  const m88Full=parseGoal50Rows(m88FullResponse.text),m88Changed=parseGoal50Rows(m88ChangeResponse.text);
  const extraFeeds=EXTRA_BOOKMAKERS.map((definition,index)=>({definition,response:extraChangeResponses[index],changed:parseGoal50Rows(extraChangeResponses[index]?.text||'')}));
  if(!roster.length) throw new Error('NOWGOAL_ROSTER_EMPTY');
  if(!full.size) throw new Error('NOWGOAL_1XBET_FEED_EMPTY');

  const keepMs=Math.max((config?.maximumPriceAgeSeconds||3600)*2000,7200000);
  const seed=previousUpdates&&typeof previousUpdates==='object'?new Map(Object.entries(previousUpdates)):observedPriceChanges;
  for(const [id,value] of [...seed.entries()]) if(!finite(value)||observedAt-Number(value)>keepMs) seed.delete(id);
  for(const id of changed.keys()) seed.set(id,observedAt);
  if(seed!==observedPriceChanges){
    observedPriceChanges.clear();
    for(const [id,value] of seed) observedPriceChanges.set(id,Number(value));
  }
  const priceUpdates=Object.fromEntries([...seed.entries()].map(([id,value])=>[id,Number(value)]));
  const bet365PriceUpdates=refreshObservedChanges(observedBet365PriceChanges,bet365Changed,observedAt,keepMs);
  const m88PriceUpdates=refreshObservedChanges(observedM88PriceChanges,m88Changed,observedAt,keepMs);

  const mapped=mapMatches(targets,roster); let mappedCount=0,ready=0,bet365Ready=0,m88Ready=0;
  const readyBySource=Object.fromEntries(NOWGOAL_BOOKMAKERS.map(item=>[item.sourceId,0]));
  const results=mapped.map(item=>{
    if(!item.row) return {matchId:item.match.id,market:nowgoalUnavailable('nowgoal_match_not_mapped'),event:null};
    mappedCount++;
    const row=full.get(item.row.id);
    const market=attachMapping(row?normalizeNowgoalAhRow(row,seed.get(item.row.id)):nowgoalUnavailable('nowgoal_1xbet_ah_missing'),item);
    const bet365Row=bet365Full.get(item.row.id);
    const bet365Market=attachMapping(bet365Row
      ?normalizeNowgoalBet365AhRow(bet365Row,observedBet365PriceChanges.get(item.row.id))
      :nowgoalBet365Unavailable(bet365FullResponse.error?'nowgoal_bet365_feed_unavailable':'nowgoal_bet365_ah_missing'),item);
    const m88Row=m88Full.get(item.row.id);
    const m88Market=attachMapping(m88Row
      ?normalizeNowgoalM88AhRow(m88Row,observedM88PriceChanges.get(item.row.id))
      :nowgoalM88Unavailable(m88FullResponse.error?'nowgoal_m88_feed_unavailable':'nowgoal_m88_ah_missing'),item);

    const nowgoalPeers={source6:bet365Market,source7:m88Market};
    for(const feed of extraFeeds){
      const {definition,response,changed:extraChanged}=feed;
      const extraRow=extraChanged.get(item.row.id);
      const reason=response?.error?'nowgoal_bookmaker_feed_unavailable':'price_change_not_observed';
      const peer=attachMapping(extraRow
        ?normalizeNowgoalBookmakerAhRow(extraRow,observedAt,definition.bookmaker)
        :bookmakerUnavailable(definition.bookmaker,reason,{companyId:definition.companyId}),item);
      peer.companyId=definition.companyId;
      nowgoalPeers[definition.sourceId]=peer;
      if(peer.status==='AH READY') readyBySource[definition.sourceId]++;
    }
    market.nowgoalBet365Peer=bet365Market;
    market.nowgoalM88Peer=m88Market;
    market.nowgoalPeers=nowgoalPeers;
    market.companyId=COMPANY_ID;
    bet365Market.companyId=BET365_COMPANY_ID;
    m88Market.companyId=M88_COMPANY_ID;
    if(market.status==='AH READY'){ready++;readyBySource.source5++;}
    if(bet365Market.status==='AH READY'){bet365Ready++;readyBySource.source6++;}
    if(m88Market.status==='AH READY'){m88Ready++;readyBySource.source7++;}
    return {matchId:item.match.id,market,event:item.row};
  });
  return {
    status:'READY',checked:targets.length,mapped:mappedCount,ready,bet365Ready,m88Ready,events:roster.length,results,
    priceUpdates,bet365PriceUpdates,m88PriceUpdates,changed:changed.size,bet365Changed:bet365Changed.size,m88Changed:m88Changed.size,
    bookmakers:{total:NOWGOAL_BOOKMAKERS.length,extraChecked:EXTRA_BOOKMAKERS.length,readyBySource},checkedAt:observedAt,
  };
}
