export const GOALOO_BET365_COMPANY_ID=8;
export const GOALOO_BET365_FEED='runOddsData_8';
export const GOALOO_BET365_URL='https://live10.goaloo28.com/gf/data/odds/en/runOddsData_8.txt';

const MARKET_GATES=new Set(['REAL MARKET','REAL PRICE AGE','MARKET / ODDS']);
const num=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?n:null;};
const marketOdd=raw=>{const v=num(raw);if(v===null)return null;return v>=0&&v<1.5?Number((1+v).toFixed(3)):v;};
const isQuarterLine=value=>{const n=num(value);return n!==null&&Math.abs(n*4-Math.round(n*4))<1e-7;};
const fmtLine=value=>{const n=num(value);return n===null?'—':`${n>0?'+':''}${Number.isInteger(n)?n:n.toFixed(2).replace(/0+$/,'').replace(/\.$/,'')}`;};

export function parseGoalooBet365RunOdds(source){
  const out=new Map();
  for(const raw of String(source||'').split('$')){
    if(!raw||!raw.includes('!'))continue;
    const parts=raw.split('!'),id=String(parts.shift()||'').trim();
    if(!/^\d+$/.test(id))continue;
    const ah=String(parts[0]||'').split(',').map(num);
    if(ah.length<3)continue;
    const home=marketOdd(ah[0]),line=num(ah[1]),away=marketOdd(ah[2]);
    if(home===null||line===null||away===null)continue;
    out.set(id,{
      providerCompanyId:GOALOO_BET365_COMPANY_ID,
      providerName:'Bet365',
      source:'Goaloo',
      asianHandicap:{home,line,away,linePerspective:'HOME',raw:{home:ah[0],line:ah[1],away:ah[2]}}
    });
  }
  return out;
}

export async function fetchGoalooBet365RunOdds({fetchImpl=fetch,now=Date.now(),timeoutMs=7000,cacheSeconds=15}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const observedAt=new Date(now).toISOString(),bucket=Math.floor(now/(cacheSeconds*1000));
  try{
    const response=await fetchImpl(`${GOALOO_BET365_URL}?t=${bucket}`,{
      headers:{'user-agent':'NOMADTIPS3-CAR3.4-GoalooBet365Fallback/1.0','accept':'*/*','accept-language':'en-US,en;q=0.8'},
      signal:controller.signal,
      cf:{cacheTtl:cacheSeconds,cacheEverything:true}
    });
    if(!response.ok)throw new Error(`GOALOO_BET365_HTTP_${response.status}`);
    const text=await response.text();
    return{quotes:parseGoalooBet365RunOdds(text),observedAt,feed:GOALOO_BET365_FEED,companyId:GOALOO_BET365_COMPANY_ID};
  }finally{clearTimeout(timer);}
}

function gateMap(match){
  const gates=Array.isArray(match?.engine?.gates)?match.engine.gates:[];
  return new Map(gates.map(g=>[String(g?.[0]||''),Boolean(g?.[1])]));
}
export function nonMarketReady(match){
  const gates=Array.isArray(match?.engine?.gates)?match.engine.gates:[];
  if(!gates.length)return false;
  const relevant=gates.filter(g=>!MARKET_GATES.has(String(g?.[0]||'')));
  return relevant.length>0&&relevant.every(g=>Boolean(g?.[1]));
}
export function primaryMarketReady(match){
  const map=gateMap(match);
  return [...MARKET_GATES].every(name=>map.get(name)===true);
}

export function evaluateGoalooBet365Quote(match,quote,config={}){
  const ah=quote?.asianHandicap;
  const home=num(ah?.home),away=num(ah?.away),rawHomeLine=num(ah?.line);
  const side=String(match?.engine?.side||'').toUpperCase();
  if((side!=='HOME'&&side!=='AWAY')||home===null||away===null||rawHomeLine===null)return{passed:false,reason:'INVALID_QUOTE'};
  if(home<=1||away<=1||!isQuarterLine(rawHomeLine))return{passed:false,reason:'INVALID_AH'};
  const selectedLine=side==='AWAY'?-rawHomeLine:rawHomeLine,selectedOdds=side==='AWAY'?away:home;
  const ahMin=num(config.ahMin),ahMax=num(config.ahMax),oddsMin=num(config.oddsMin),oddsMax=num(config.oddsMax);
  const linePassed=(ahMin===null||selectedLine>=ahMin)&&(ahMax===null||selectedLine<=ahMax);
  const oddsPassed=(oddsMin===null||selectedOdds>=oddsMin)&&(oddsMax===null||selectedOdds<=oddsMax);
  return{passed:linePassed&&oddsPassed,reason:linePassed?(oddsPassed?'PASS':'ODDS_FAIL'):'LINE_FAIL',side,rawHomeLine,selectedLine,selectedOdds,homeOdds:home,awayOdds:away};
}

function replaceMarketGates(gates=[],evaluation){
  const replacements={
    'REAL MARKET':['REAL MARKET',true,'Goaloo · Bet365'],
    'REAL PRICE AGE':['REAL PRICE AGE',true,'Goaloo current fetch'],
    'MARKET / ODDS':['MARKET / ODDS',true,`Bet365 (Goaloo) AH ${fmtLine(evaluation.selectedLine)} @ ${evaluation.selectedOdds}`]
  };
  return gates.map(g=>replacements[String(g?.[0]||'')]||g);
}
function bangkokDate(iso){try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}catch{return String(iso||'').slice(0,10);}}

export function countGoalooBet365FallbackCandidates(latest,history=[],config={}){
  const existing=new Set(history.map(r=>r.key).filter(Boolean));
  return (latest?.matches||[]).filter(match=>{
    const side=String(match?.engine?.side||'').toUpperCase(),key=`${match?.sourceMatchId}:${side}:AH`;
    if(side!=='HOME'&&side!=='AWAY')return false;
    if(existing.has(key)||match?.engine?.dailyBlocked)return false;
    return nonMarketReady(match)&&!primaryMarketReady(match);
  }).length;
}

export function applyGoalooBet365Fallback({latest,config={},history=[],fallbackStreaks={},quotes=new Map(),at=new Date().toISOString()}={}){
  const matches=Array.isArray(latest?.matches)?latest.matches:[],existing=new Set(history.map(r=>r.key).filter(Boolean));
  const today=bangkokDate(at),todayCount=history.filter(r=>r.selectionDate===today).length;
  let attempted=0,quoteMatched=0,pricePassed=0,newSignals=0;
  const rejected={missing:0,line:0,odds:0,invalid:0};
  for(const match of matches){
    const side=String(match?.engine?.side||'').toUpperCase();
    if(side!=='HOME'&&side!=='AWAY')continue;
    const key=`${match.sourceMatchId}:${side}:AH`;
    const dailyBlocked=Boolean(config.signalLimitEnabled)&&todayCount+newSignals>=Number(config.maxSignalsPerDay||10);
    if(existing.has(key)||match?.engine?.dailyBlocked||dailyBlocked||!nonMarketReady(match)||primaryMarketReady(match)){fallbackStreaks[key]=0;continue;}
    attempted++;
    const quote=quotes.get(String(match.sourceMatchId));
    if(!quote){rejected.missing++;fallbackStreaks[key]=0;continue;}
    quoteMatched++;
    const evaluation=evaluateGoalooBet365Quote(match,quote,config);
    if(!evaluation.passed){
      if(evaluation.reason==='LINE_FAIL')rejected.line++;
      else if(evaluation.reason==='ODDS_FAIL')rejected.odds++;
      else rejected.invalid++;
      fallbackStreaks[key]=0;continue;
    }
    pricePassed++;
    const previousMarket=match.realMarket?{source:match.realMarket.source||null,status:match.realMarket.status||null,error:match.realMarket.error||null}:null;
    match.odds={...(match.odds||{}),asianHandicap:{line:evaluation.rawHomeLine,home:evaluation.homeOdds,away:evaluation.awayOdds,updatedAt:at,provider:'Bet365 (Goaloo)',providerCompanyId:GOALOO_BET365_COMPANY_ID,linePerspective:'HOME'}};
    match.realMarket={source:'Goaloo',bookmaker:'Bet365',status:'MATCH',checkedAt:at,oddsUpdatedAt:at,marketAgeSeconds:0,feed:GOALOO_BET365_FEED,companyId:GOALOO_BET365_COMPANY_ID,linePerspective:'HOME',mapping:'GOALOO_MATCH_ID',pricingSource:'GOALOO_BET365_FALLBACK',freshnessBasis:'FETCH_OBSERVED',fallbackFrom:previousMarket};
    match.currentAh={status:'MATCH',line:evaluation.rawHomeLine,homeOdds:evaluation.homeOdds,awayOdds:evaluation.awayOdds,updatedAt:at,provider:'Bet365 (Goaloo)',marketAgeSeconds:0,pricingSource:'GOALOO_BET365_FALLBACK'};
    const streak=(Number(fallbackStreaks[key])||0)+1;fallbackStreaks[key]=streak;
    match.engine={...(match.engine||{}),decision:'SHADOW SIGNAL',reason:`Goaloo Bet365 fallback · confirmation ${config.confirmationRounds||1} rounds required`,line:evaluation.selectedLine,rawLine:evaluation.rawHomeLine,selectedLine:evaluation.selectedLine,odds:evaluation.selectedOdds,entryScore:{home:match.score?.home,away:match.score?.away},gates:replaceMarketGates(match.engine?.gates,evaluation),streak,bookmaker:'Bet365',pricingSource:'GOALOO_BET365_FALLBACK'};
    match.enrichment={...(match.enrichment||{}),odds:'GOALOO_BET365_FALLBACK',bookmaker:'Bet365',priceSource:'Goaloo'};
    const rounds=Math.max(1,Number(config.confirmationRounds)||1);
    if(streak<rounds)continue;
    const selectedTeam=side==='AWAY'?match.away:match.home;
    history.push({key,id:match.sourceMatchId,selectionDate:today,selectedAt:at,league:match.league,home:match.home,away:match.away,selectedSide:side,selectedTeam,entryMinute:match.minute,entryScore:{home:match.score?.home,away:match.score?.away},market:'AH',line:evaluation.selectedLine,rawLine:evaluation.rawHomeLine,selectedLine:evaluation.selectedLine,linePerspective:'SELECTED',odds:evaluation.selectedOdds,bookmaker:'Bet365 (Goaloo)',bookmakerCompanyId:GOALOO_BET365_COMPANY_ID,pricingSource:'GOALOO_BET365_FALLBACK',priceProvider:'Bet365',priceSource:'Goaloo',goalooFeed:GOALOO_BET365_FEED,oddsUpdatedAt:at,marketAgeSeconds:0,priceFreshnessBasis:'FETCH_OBSERVED',goalooLinePerspective:'HOME',momentum:match.engine?.momentum,evidence:match.engine?.evidence,kickoffUtc:match.kickoffUtc,status:'PENDING',ftStatus:null,settledAt:null,finalScore:null,result:'PENDING'});
    existing.add(key);newSignals++;
  }
  return{attempted,quoteMatched,pricePassed,newSignals,rejected};
}
