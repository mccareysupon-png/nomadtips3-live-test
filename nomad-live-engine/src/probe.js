import {DEFAULT_CONFIG} from './config.js';
import {parseToday,parseLiveDetail,parseBet365Asian} from './parser.js';

const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const challengeRe=/(cf-chl|challenge-platform|captcha|verify you are human|just a moment|access denied|attention required|cloudflare ray id)/i;
const fetchHeaders={'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9','cache-control':'no-cache'};

async function grab(url){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),10000);
  try{
    const r=await fetch(url,{signal:ac.signal,headers:fetchHeaders,redirect:'follow'});
    const text=await r.text();
    return {ok:r.ok,status:r.status,finalUrl:r.url,contentType:r.headers.get('content-type')||'',text};
  }catch(e){
    return {ok:false,status:null,finalUrl:null,contentType:'',text:'',error:String(e?.message||e)};
  }finally{clearTimeout(timer)}
}

function htmlShape(x){
  const text=x.text||'';
  const title=(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]?.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()||null;
  const rows=(text.match(/<tr\b/gi)||[]).length;
  const statsLinks=(text.match(/href=["'][^"']*\/stats\//gi)||[]).length;
  const oddsLinks=(text.match(/href=["'][^"']*\/odds\//gi)||[]).length;
  const liveLinks=(text.match(/href=["'][^"']*\/live\//gi)||[]).length;
  const numericMatchLinks=(text.match(/href=["'][^"']*\/(?:stats|odds|live)\/[^"']*\/\d+(?:[?"'#]|$)/gi)||[]).length;
  return {ok:x.ok,status:x.status,bytes:text.length,contentType:x.contentType,title,rows,statsLinks,oddsLinks,liveLinks,numericMatchLinks,challenge:challengeRe.test(text),error:x.error||null};
}

function liveHasData(v){
  if(Number.isFinite(v?.minute)) return true;
  for(const k of ['attacks','dangerousAttack','shotsOn','shotsOff','corners','possession']){
    if(Number.isFinite(v?.[k]?.home)||Number.isFinite(v?.[k]?.away)) return true;
  }
  return v?.score?.home!=null||v?.score?.away!=null;
}

async function probe(){
  const todayRaw=await grab(DEFAULT_CONFIG.scanUrl);
  const today=htmlShape(todayRaw);
  let parsed=[];
  if(todayRaw.ok){
    try{parsed=parseToday(todayRaw.text,DEFAULT_CONFIG.sourceHost);}catch(e){today.parseError=String(e?.message||e);}
  }
  today.parsedMatches=parsed.length;
  today.withMinute=parsed.filter(m=>Number.isFinite(m.minute)).length;
  today.withScore=parsed.filter(m=>m.score?.home!=null&&m.score?.away!=null).length;
  today.inWatchWindow=parsed.filter(m=>Number.isFinite(m.minute)&&m.minute>=DEFAULT_CONFIG.watchMinuteFrom&&m.minute<=DEFAULT_CONFIG.watchMinuteTo&&m.score?.home!=null&&m.score?.away!=null).length;

  const deep=[];
  for(const m of parsed.slice(0,3)){
    const statsRaw=await grab(m.urls.stats);
    const statsShape=htmlShape(statsRaw);
    let statsParsed=null;
    try{statsParsed=statsRaw.ok?parseLiveDetail(statsRaw.text):null;}catch(e){statsShape.parseError=String(e?.message||e);}
    statsShape.parsed=liveHasData(statsParsed);
    statsShape.minute=Number.isFinite(statsParsed?.minute)?statsParsed.minute:null;

    const oddsRaw=await grab(m.urls.odds);
    const oddsShape=htmlShape(oddsRaw);
    let market=null;
    try{market=oddsRaw.ok?parseBet365Asian(oddsRaw.text):null;}catch(e){oddsShape.parseError=String(e?.message||e);}
    oddsShape.parsed=!!market;
    oddsShape.bookmaker=market?.bookmaker||null;
    oddsShape.line=Number.isFinite(market?.line)?market.line:null;

    deep.push({matchId:m.id,minute:m.minute,score:m.score,stats:statsShape,odds:oddsShape});
  }

  const endedRaw=await grab(DEFAULT_CONFIG.endedUrl);
  const ended=htmlShape(endedRaw);
  let endedParsed=[];
  if(endedRaw.ok){
    try{endedParsed=parseToday(endedRaw.text,DEFAULT_CONFIG.sourceHost);}catch(e){ended.parseError=String(e?.message||e);}
  }
  ended.parsedMatches=endedParsed.length;

  return {checkedAt:new Date().toISOString(),today,deep,ended};
}

export default {
  async fetch(request){
    const u=new URL(request.url);
    if(u.pathname!=='/probe') return new Response(JSON.stringify({ok:true,endpoint:'/probe'}),{headers});
    return new Response(JSON.stringify(await probe()),{headers});
  }
};
