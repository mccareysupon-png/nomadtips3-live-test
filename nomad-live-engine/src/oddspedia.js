import {normalizeTeamName,teamSimilarity} from './real-market.js';

export const ODDSPEDIA_SOURCE='Oddspedia';
export const ODDSPEDIA_BOOKMAKER='Bet365';
export const ODDSPEDIA_LIVE_URL='https://oddspedia.com/football';
export const ODDSPEDIA_ODDS_URL='https://oddspedia.com/football/odds';

const BLOCK_PAGE=/captcha|verify you are human|access denied|cf-chl|cloudflare ray id|temporarily blocked/i;
const MARKET_END=/^(?:Both Teams to Score|Double Chance|Draw No Bet|Correct Score|European Handicap|Total Corners|Asian Handicap Cards|Asian Handicap Corners|Half Time \/ Full Time|Odd or Even|Clean Sheet|To Win to Nil|Live streaming|Match Poll|Bonus Offers|About the Match)$/i;
const AH_PAIR=/^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/;
const PRICE=/^[+-]?\d+(?:\.\d+)?$/;

const decodeEntities=value=>String(value??'')
  .replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16)));

function attribute(tag,name){
  const match=String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`,'i'));
  return match?decodeEntities(match[2]):'';
}

export function oddspediaVisibleLines(html=''){
  let value=String(html);
  value=value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<img\b[^>]*>/gi,tag=>`\n${attribute(tag,'alt')}\n`)
    .replace(/<(?:br|hr)\b[^>]*>/gi,'\n')
    .replace(/<\/(?:div|section|article|li|p|span|button|a|h[1-6]|tr|td|th)>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
  return decodeEntities(value).split(/\r?\n/)
    .map(line=>line.replace(/\s+/g,' ').trim())
    .filter(Boolean);
}

function eventIdFromUrl(url){
  const match=String(url||'').match(/-(\d+)(?:\/?(?:[?#].*)?)?$/);
  return match?match[1]:null;
}

export function parseOddspediaEventLinks(html='',base=ODDSPEDIA_LIVE_URL){
  const links=[],seen=new Set();
  const anchor=/<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while((match=anchor.exec(String(html)))){
    const href=attribute(match[1],'href');
    if(!href) continue;
    let url;
    try{url=new URL(href,base);}catch{continue;}
    if(url.hostname!=='oddspedia.com'&&!url.hostname.endsWith('.oddspedia.com')) continue;
    if(!/^\/football\/[a-z0-9][a-z0-9-]*-\d+\/?$/i.test(url.pathname)) continue;
    const eventId=eventIdFromUrl(url.pathname);
    if(!eventId) continue;
    url.hash='';url.search='';
    if(seen.has(url.href)) continue;
    seen.add(url.href);
    const label=oddspediaVisibleLines(match[2]).join(' ');
    const slug=url.pathname.split('/').filter(Boolean).at(-1).replace(/-\d+$/,'').replace(/-/g,' ');
    links.push({eventId,url:url.href,label,slug});
  }
  return links;
}

function tokenCoverage(candidate,team){
  const source=new Set(normalizeTeamName(candidate).split(' ').filter(Boolean));
  const target=normalizeTeamName(team).split(' ').filter(Boolean);
  if(!target.length) return 0;
  return target.filter(token=>source.has(token)).length/target.length;
}

export function matchOddspediaEvent(match,events=[]){
  const expected=`${match?.home||''} ${match?.away||''}`.trim();
  if(!expected) return null;
  let best=null;
  for(const event of events){
    const candidate=`${event.label||''} ${event.slug||''}`.trim();
    const homeCoverage=tokenCoverage(candidate,match.home),awayCoverage=tokenCoverage(candidate,match.away);
    const pairScore=Math.max(teamSimilarity(expected,event.label||''),teamSimilarity(expected,event.slug||''),teamSimilarity(expected,candidate));
    const homeNorm=normalizeTeamName(match.home),awayNorm=normalizeTeamName(match.away),candidateNorm=normalizeTeamName(candidate);
    const homeIndex=homeNorm?candidateNorm.indexOf(homeNorm):-1,awayIndex=awayNorm?candidateNorm.indexOf(awayNorm):-1;
    const orientation=homeIndex>=0&&awayIndex>=0?homeIndex<=awayIndex:true;
    const confidence=Math.min(1,pairScore*.65+homeCoverage*.175+awayCoverage*.175);
    const ok=orientation&&homeCoverage>=.6&&awayCoverage>=.6&&confidence>=.70;
    if(!ok) continue;
    if(!best||confidence>best.confidence) best={...event,confidence:Number(confidence.toFixed(4)),homeCoverage,awayCoverage};
  }
  return best;
}

function americanToDecimal(value){
  const odds=Number(value);
  if(!Number.isFinite(odds)||Math.abs(odds)<100) return null;
  return odds>0?1+odds/100:1+100/Math.abs(odds);
}

export function parseOddspediaPrice(value){
  const raw=String(value??'').trim().replace(/,/g,'.');
  if(!PRICE.test(raw)) return null;
  const numeric=Number(raw);
  if(!Number.isFinite(numeric)) return null;
  if(numeric>1&&numeric<=100) return numeric;
  const american=americanToDecimal(numeric);
  return american==null?null:Number(american.toFixed(4));
}

function parseBet365Prices(row=[]){
  const prices=[];
  for(let index=0;index<row.length;index++){
    if(!/^bet\s*365$/i.test(row[index])) continue;
    for(let next=index+1;next<Math.min(row.length,index+5);next++){
      const value=parseOddspediaPrice(row[next]);
      if(value!=null){prices.push(value);break;}
      if(/^bet\s*365$/i.test(row[next])) break;
    }
  }
  return prices;
}

export function parseOddspediaBet365Asian(html='',sourceUpdatedAt=Date.now()){
  const raw=String(html);
  if(BLOCK_PAGE.test(raw)) return oddspediaUnavailable('source_blocked:challenge_page');
  const lines=oddspediaVisibleLines(raw);
  const ahIndex=lines.findIndex(line=>/^Asian Handicap$/i.test(line));
  if(ahIndex<0) return oddspediaUnavailable('parser_failed:asian_handicap_section_not_found');
  const section=[];
  for(let index=ahIndex+1;index<lines.length;index++){
    if(MARKET_END.test(lines[index])) break;
    section.push(lines[index]);
  }
  const fullTimeIndex=section.findIndex(line=>/^Full Time$/i.test(line));
  if(fullTimeIndex<0) return oddspediaUnavailable('parser_failed:full_time_asian_handicap_not_found');
  const body=section.slice(fullTimeIndex+1);
  const candidates=[];
  for(let index=0;index<body.length;index++){
    const pair=body[index].match(AH_PAIR);
    if(!pair) continue;
    const row=[body[index]];
    for(let cursor=index+1;cursor<body.length;cursor++){
      if(/^Compare odds$/i.test(body[cursor])||AH_PAIR.test(body[cursor])) break;
      row.push(body[cursor]);
    }
    const homeLine=Number(pair[1]),awayLine=Number(pair[2]);
    if(!Number.isFinite(homeLine)||!Number.isFinite(awayLine)||Math.abs(homeLine+awayLine)>1e-9) continue;
    const prices=parseBet365Prices(row);
    if(prices.length<2) continue;
    candidates.push({
      line:homeLine,awayLine,homeOdds:prices[0],awayOdds:prices[1],main:row.some(line=>/^Main line$/i.test(line)),
      sourceUpdatedAt:Number(sourceUpdatedAt),source:ODDSPEDIA_SOURCE,bookmaker:ODDSPEDIA_BOOKMAKER,market:'FULL MATCH LIVE AH',
    });
  }
  if(!candidates.length) return oddspediaUnavailable('bookmaker_pair_not_found');
  return {status:'AH READY',source:ODDSPEDIA_SOURCE,bookmaker:ODDSPEDIA_BOOKMAKER,market:'FULL MATCH LIVE AH',sourceUpdatedAt:Number(sourceUpdatedAt),candidates};
}

function inConfiguredRange(candidate,config){
  if(candidate.homeOdds<config.oddsMinimum) return false;
  if(config.oddsMaximumEnabled&&candidate.homeOdds>config.oddsMaximum) return false;
  return true;
}

export function selectOddspediaCandidate(parsed,config){
  if(parsed?.status!=='AH READY'||!Array.isArray(parsed.candidates)||!parsed.candidates.length) return parsed;
  let pool=[...parsed.candidates];
  if(config.allowedLinesMode==='SELECTED'){
    const matches=pool.filter(candidate=>config.allowedSelectionLines.some(line=>Math.abs(Number(line)-candidate.line)<1e-9));
    if(matches.length) pool=matches;
  }
  const priceMatches=pool.filter(candidate=>inConfiguredRange(candidate,config));
  if(priceMatches.length) pool=priceMatches;
  pool.sort((a,b)=>Number(b.main)-Number(a.main));
  const selected=pool[0];
  return {...selected,status:'AH READY',source:ODDSPEDIA_SOURCE,bookmaker:ODDSPEDIA_BOOKMAKER,market:'FULL MATCH LIVE AH'};
}

export function oddspediaUnavailable(reason='not_available'){
  return {status:'AH UNAVAILABLE',reason,source:ODDSPEDIA_SOURCE,bookmaker:ODDSPEDIA_BOOKMAKER,market:'FULL MATCH LIVE AH'};
}

function classifiedReason(error){
  const message=String(error?.message||error||'unknown_error');
  if(/source_http_403/i.test(message)) return 'source_blocked:http_403';
  if(/source_http_429/i.test(message)) return 'source_blocked:http_429';
  if(/source_blocked:challenge_page/i.test(message)) return 'source_blocked:challenge_page';
  if(/AbortError|aborted|timeout/i.test(message)) return 'source_timeout';
  return `price_fetch_failed:${message}`;
}

async function fetchDocument(url,timeoutMs=10000,fetchImpl=fetch){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetchImpl(url,{signal:controller.signal,cache:'no-store',headers:{
      'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
      'accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache, no-store','pragma':'no-cache'
    }});
    if(!response.ok) throw new Error(`source_http_${response.status}`);
    const html=await response.text();
    if(html.length<500) throw new Error('source_body_too_small');
    if(BLOCK_PAGE.test(html)) throw new Error('source_blocked:challenge_page');
    const fetchedAt=Date.now();
    const responseDate=Date.parse(response.headers.get('date')||'');
    const sourceUpdatedAt=Number.isFinite(responseDate)&&responseDate<=fetchedAt+5000?responseDate:fetchedAt;
    return {html,sourceUpdatedAt};
  }finally{clearTimeout(timer);}
}

async function eventIndex(matches,timeoutMs,fetchImpl){
  const primary=await fetchDocument(ODDSPEDIA_LIVE_URL,timeoutMs,fetchImpl);
  let links=parseOddspediaEventLinks(primary.html,ODDSPEDIA_LIVE_URL);
  const unmatched=matches.filter(match=>!matchOddspediaEvent(match,links));
  if(unmatched.length){
    try{
      const secondary=await fetchDocument(ODDSPEDIA_ODDS_URL,timeoutMs,fetchImpl);
      const more=parseOddspediaEventLinks(secondary.html,ODDSPEDIA_ODDS_URL);
      const known=new Set(links.map(item=>item.url));
      links=[...links,...more.filter(item=>!known.has(item.url))];
    }catch{}
  }
  return links;
}

export async function fetchOddspediaBet365Markets(matches=[],config,observedAt=Date.now(),fetchImpl=fetch){
  const targets=Array.isArray(matches)?matches:[];
  if(!targets.length) return {status:'NOT_NEEDED',checked:0,mapped:0,ready:0,results:[],checkedAt:observedAt};
  if(fetchImpl===fetch){
    const reason='source_removed';
    return {
      status:'REMOVED',checked:targets.length,mapped:0,ready:0,error:null,checkedAt:observedAt,
      results:targets.map(match=>({matchId:match.id,market:oddspediaUnavailable(reason),event:null})),
    };
  }
  let events;
  try{events=await eventIndex(targets,config.requestTimeoutMs,fetchImpl);}
  catch(error){
    const reason=classifiedReason(error);
    return {status:'ERROR',checked:targets.length,mapped:0,ready:0,error:reason,checkedAt:observedAt,
      results:targets.map(match=>({matchId:match.id,market:oddspediaUnavailable(reason),event:null}))};
  }
  const mapped=targets.map(match=>({match,event:matchOddspediaEvent(match,events)}));
  const results=await Promise.all(mapped.map(async item=>{
    if(!item.event) return {matchId:item.match.id,event:null,market:oddspediaUnavailable('no_matching_event')};
    try{
      const document=await fetchDocument(item.event.url,config.requestTimeoutMs,fetchImpl);
      const parsed=parseOddspediaBet365Asian(document.html,document.sourceUpdatedAt);
      const market=selectOddspediaCandidate(parsed,config);
      return {matchId:item.match.id,event:item.event,market:{...market,eventId:item.event.eventId,eventUrl:item.event.url,mappingConfidence:item.event.confidence}};
    }catch(error){
      return {matchId:item.match.id,event:item.event,market:{...oddspediaUnavailable(classifiedReason(error)),eventId:item.event.eventId,eventUrl:item.event.url,mappingConfidence:item.event.confidence}};
    }
  }));
  const mappedCount=results.filter(item=>item.event).length;
  const ready=results.filter(item=>item.market?.status==='AH READY').length;
  const failed=results.filter(item=>item.market?.reason?.startsWith('source_blocked:')||item.market?.reason?.startsWith('price_fetch_failed:')||item.market?.reason==='source_timeout').length;
  return {status:failed?'READY_WITH_ERRORS':'READY',checked:targets.length,mapped:mappedCount,ready,results,events:events.length,checkedAt:observedAt};
}
