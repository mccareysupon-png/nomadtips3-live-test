const API_ROUTES=new Map([
  ['/api/feed','/feed'],
  ['/api/statistics','/statistics'],
  ['/api/config','/config'],
  ['/api/health','/health'],
]);

const PREDICTIONS_ORIGIN='https://mccareysupon-png.github.io';
const PREDICTIONS_BASE='/nomadtips3-live-test';
const NOMAD342_PREFIX='/nomad-live-342';
const NOMAD342_MARKET_1X2='/nomad-live-342-market/1x2';
const TOTALCORNER_ORIGIN='https://www.totalcorner.com';
const MARKET_CACHE_MS=30_000;
const market1x2Cache=new Map();

function unavailable(message,status=503){
  return new Response(message,{status,headers:{
    'cache-control':'no-store',
    'content-type':'text/plain; charset=utf-8',
    'x-nomad-web':'3.41-production',
  }});
}

function marketHeaders(){
  return {
    'access-control-allow-origin':'*',
    'access-control-allow-methods':'GET,OPTIONS',
    'access-control-allow-headers':'content-type',
    'cache-control':'no-store, max-age=0',
    'content-type':'application/json; charset=utf-8',
    'x-nomad-web':'nomad-live-342-market-sidecar',
  };
}

function marketJson(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:marketHeaders()});
}

function decodeHtml(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
}

function stripHtml(value=''){
  return decodeHtml(String(value).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
}

function slugPart(value=''){
  const raw=String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ');
  return raw.replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function oddsUrl(id,home,away){
  const h=slugPart(home)||'home',a=slugPart(away)||'away';
  return `${TOTALCORNER_ORIGIN}/odds/${encodeURIComponent(`${h}-vs-${a}`)}/${encodeURIComponent(id)}`;
}

function panelSlice(html,name){
  const raw=String(html||'');
  const re=new RegExp(`<div\\b[^>]*data-market-panel=["']${name}["'][^>]*>`,'i');
  const match=re.exec(raw);
  if(!match)return '';
  const start=match.index;
  const rest=raw.slice(start+match[0].length);
  const next=/<div\b[^>]*data-market-panel=["'][^"']+["'][^>]*>/i.exec(rest);
  return raw.slice(start,next?start+match[0].length+next.index:raw.length);
}

function rowSlices(panel){
  const starts=[];
  const re=/<div\b[^>]*class=["'][^"']*\boa-major-row\b[^"']*["'][^>]*>/gi;
  let match;
  while((match=re.exec(panel)))starts.push(match.index);
  return starts.map((start,index)=>panel.slice(start,starts[index+1]??panel.length));
}

function spanValue(attrs,body){
  const raw=(String(attrs).match(/\bdata-sort-value=["']([^"']+)["']/i)||[])[1]??stripHtml(body);
  const n=Number(String(raw).trim());
  return Number.isFinite(n)?n:null;
}

function groupTriples(row){
  const triples=[];
  const groupRe=/<div\b[^>]*class=["'][^"']*\boa-major-group\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let group;
  while((group=groupRe.exec(row))){
    const values=[];
    const spanRe=/<span\b([^>]*)>([\s\S]*?)<\/span>/gi;
    let span;
    while((span=spanRe.exec(group[1])))values.push(spanValue(span[1],span[2]));
    const triple=values.filter(v=>v!==null).slice(0,3);
    if(triple.length===3&&triple.every(v=>v>1&&v<1000))triples.push(triple);
  }
  return triples;
}

function parseTotalCorner1X2(html){
  const panel=panelSlice(html,'1x2');
  if(!panel)return {status:'UNAVAILABLE',reason:'1x2_panel_not_found'};
  const rows=rowSlices(panel);
  for(const row of rows){
    const company=(row.match(/\boa-major-company\b[\s\S]{0,700}?<strong\b[^>]*>([\s\S]*?)<\/strong>/i)||[])[1];
    if(!/bet\s*365/i.test(stripHtml(company||'')))continue;
    const triples=groupTriples(row);
    if(!triples.length)return {status:'UNAVAILABLE',reason:'bet365_1x2_values_not_found'};
    const current=triples[triples.length-1],open=triples.length>1?triples[0]:null;
    return {
      status:'READY',
      bookmaker:'Bet365',
      market:'FULL MATCH 1X2',
      source:'TotalCorner',
      home:current[0],draw:current[1],away:current[2],
      open:open?{home:open[0],draw:open[1],away:open[2]}:null,
    };
  }
  return {status:'UNAVAILABLE',reason:'bet365_1x2_row_not_found'};
}

async function nomad342Market1X2(request,url){
  if(url.pathname!==NOMAD342_MARKET_1X2)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:marketHeaders()});
  if(request.method!=='GET')return marketJson({ok:false,status:'UNAVAILABLE',market:'FULL MATCH 1X2',bookmaker:'Bet365',source:'TotalCorner',reason:'method_not_allowed'},405);
  const id=String(url.searchParams.get('id')||'').trim();
  const home=String(url.searchParams.get('home')||'').trim();
  const away=String(url.searchParams.get('away')||'').trim();
  if(!/^\d+$/.test(id)||!home||!away)return marketJson({ok:false,status:'UNAVAILABLE',market:'FULL MATCH 1X2',bookmaker:'Bet365',source:'TotalCorner',reason:'invalid_match_identity'},400);

  const now=Date.now(),cached=market1x2Cache.get(id);
  if(cached&&now-cached.at<MARKET_CACHE_MS)return marketJson({...cached.value,cacheHit:true});

  const sourceUrl=oddsUrl(id,home,away);
  try{
    const response=await fetch(sourceUrl,{headers:{accept:'text/html,application/xhtml+xml','user-agent':'Mozilla/5.0 NOMADTIPS3-Market/1.0'}});
    if(!response.ok){
      const value={ok:false,status:'UNAVAILABLE',matchId:id,market:'FULL MATCH 1X2',bookmaker:'Bet365',source:'TotalCorner',reason:`source_http_${response.status}`,observedAt:now};
      market1x2Cache.set(id,{at:now,value});
      return marketJson(value);
    }
    const html=await response.text();
    const parsed=parseTotalCorner1X2(html);
    const value={ok:parsed.status==='READY',matchId:id,...parsed,observedAt:now};
    market1x2Cache.set(id,{at:now,value});
    if(market1x2Cache.size>200){
      for(const [key,item] of market1x2Cache)if(now-item.at>MARKET_CACHE_MS*4)market1x2Cache.delete(key);
    }
    return marketJson(value);
  }catch(error){
    const value={ok:false,status:'UNAVAILABLE',matchId:id,market:'FULL MATCH 1X2',bookmaker:'Bet365',source:'TotalCorner',reason:`source_fetch_failed:${String(error?.message||error).slice(0,120)}`,observedAt:now};
    market1x2Cache.set(id,{at:now,value});
    return marketJson(value);
  }
}

async function proxyApi(request,env,url){
  const enginePath=API_ROUTES.get(url.pathname);
  if(!enginePath) return unavailable('Production API route not found',404);
  if(!env?.PROD_ENGINE||typeof env.PROD_ENGINE.fetch!=='function'){
    return unavailable('Production Engine binding unavailable');
  }
  const internalUrl=new URL(enginePath+url.search,'https://nomadtips3-live-engine.internal');
  return env.PROD_ENGINE.fetch(new Request(internalUrl,request));
}

function legacyLiveRedirect(url){
  if(url.pathname==='/nomad-live/index.html'){
    return Response.redirect(new URL('/'+url.search,url.origin).toString(),302);
  }
  if(url.pathname==='/nomad-live/statistics.html'){
    return Response.redirect(new URL('/statistics.html'+url.search,url.origin).toString(),302);
  }
  return null;
}

async function proxyPredictions(request,url){
  if(url.pathname==='/soccer-predictions'){
    return Response.redirect(new URL('/soccer-predictions/'+url.search,url.origin).toString(),302);
  }
  if(!url.pathname.startsWith('/soccer-predictions/')) return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('Soccer Predictions route supports GET/HEAD only',405);
  }
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','soccer-predictions-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function proxyNomad342(request,url){
  if(url.pathname===NOMAD342_PREFIX){
    return Response.redirect(new URL(NOMAD342_PREFIX+'/'+url.search,url.origin).toString(),302);
  }
  if(!url.pathname.startsWith(NOMAD342_PREFIX+'/')) return null;
  if(request.method!=='GET'&&request.method!=='HEAD'){
    return unavailable('NOMAD Live 3.42 route supports GET/HEAD only',405);
  }
  const upstreamUrl=new URL(PREDICTIONS_BASE+url.pathname+url.search,PREDICTIONS_ORIGIN);
  const upstreamRequest=new Request(upstreamUrl.toString(),request);
  const response=await fetch(upstreamRequest);
  const headers=new Headers(response.headers);
  headers.set('cache-control','no-store, max-age=0');
  headers.set('pragma','no-cache');
  headers.set('expires','0');
  headers.set('x-nomad-web','nomad-live-342-bridge');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

function releaseResponse(){
  return Response.json({
    ok:true,
    service:'nomadtips3-live-web-production',
    version:'3.41',
    mode:'production',
  },{headers:{
    'cache-control':'no-store',
    'x-nomad-web':'3.41-production',
  }});
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/__nomad_release') return releaseResponse();
    const marketResponse=await nomad342Market1X2(request,url);
    if(marketResponse)return marketResponse;
    if(url.pathname==='/api'||url.pathname.startsWith('/api/')){
      return proxyApi(request,env,url);
    }
    const liveRedirect=legacyLiveRedirect(url);
    if(liveRedirect) return liveRedirect;
    const predictionsResponse=await proxyPredictions(request,url);
    if(predictionsResponse) return predictionsResponse;
    const nomad342Response=await proxyNomad342(request,url);
    if(nomad342Response) return nomad342Response;
    if(!env?.ASSETS||typeof env.ASSETS.fetch!=='function'){
      return unavailable('Static assets unavailable');
    }
    return env.ASSETS.fetch(request);
  },
};
