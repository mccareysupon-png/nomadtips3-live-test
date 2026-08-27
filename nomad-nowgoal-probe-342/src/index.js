const VERSION='3.42-probe';
const COMPANY_ID='17';
const COMPANY_NAME='Mansion88';
const DEFAULT_MATCH_ID='2607237';
const REQUEST_TIMEOUT_MS=10000;

const HOSTS=Object.freeze([
  'https://www.nowgoal.com',
  'https://live3.nowgoal29.com',
  'https://live.nowgoal59.com',
]);

const cors={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
};

const json=(body,status=200)=>new Response(JSON.stringify(body,null,2),{
  status,
  headers:{...cors,'content-type':'application/json; charset=utf-8'},
});

function cleanText(value){
  return String(value||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ')
    .trim();
}

function rawCellValues(rowHtml){
  const values=[];
  const re=/<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
  let m;
  while((m=re.exec(rowHtml))){
    const attrs=m[1]||'';
    const body=m[2]||'';
    const dataMatch=attrs.match(/\bdata-o=["']([^"']*)["']/i);
    values.push(dataMatch?dataMatch[1]:cleanText(body));
  }
  return values;
}

function findRow(html,rowType){
  const id=`tr_o_${rowType}_${COMPANY_ID}`;
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp(`<tr\\b[^>]*\\bid=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/tr>`,'i');
  const match=html.match(re);
  if(!match) return null;
  const full=match[0];
  return {
    id,
    label:rowType==='1'?'FIRST':rowType==='2'?'LIVE':'RUN',
    values:rawCellValues(full),
    text:cleanText(full).slice(0,500),
  };
}

function parseM88(html){
  const rows={
    first:findRow(html,'1'),
    live:findRow(html,'2'),
    run:findRow(html,'3'),
  };
  return {
    companyId:COMPANY_ID,
    companyName:COMPANY_NAME,
    companyNamePresent:/\bMansion88\b/i.test(html),
    rows,
    found:Boolean(rows.first||rows.live||rows.run),
  };
}

function unique(values,limit=80){
  return [...new Set(values)].slice(0,limit);
}

function pageDiagnostics(html){
  const companyIds=[];
  for(const m of html.matchAll(/\bid=["']tr_o_[123]_(\d+)["']/gi)) companyIds.push(m[1]);

  const companyNames=[];
  for(const m of html.matchAll(/<td\b[^>]*\bclass=["'][^"']*companyBg[^"']*["'][^>]*>[\s\S]*?<b>([\s\S]*?)<\/b>/gi)){
    const name=cleanText(m[1]);
    if(name) companyNames.push(name);
  }

  const ajaxPaths=[];
  for(const m of html.matchAll(/["'](\/[^"']{1,180}(?:ajax|odds)[^"']{0,180})["']/gi)){
    const path=String(m[1]||'').replace(/&amp;/gi,'&');
    if(path) ajaxPaths.push(path);
  }

  return {
    companyRowCount:companyIds.length,
    companyIds:unique(companyIds),
    companyNames:unique(companyNames),
    hasLiveCompareDiv:/\bid=["']liveCompareDiv["']/i.test(html),
    hasAhDetail:/\bid=["']ahdetail["']/i.test(html),
    hasAddOddsCmp:/\baddOddsCmp\s*\(/i.test(html),
    hasOddsDetailWin:/\b_oddsDetailWin\b/i.test(html),
    hasMansion88Text:/\bMansion88\b/i.test(html),
    hasM88Text:/\bM88\b/i.test(html),
    ajaxPaths:unique(ajaxPaths,30),
  };
}

async function fetchOne(host,matchId){
  const target=`${host}/oddscomp/${matchId}`;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),REQUEST_TIMEOUT_MS);
  const started=Date.now();
  try{
    const response=await fetch(target,{
      signal:controller.signal,
      redirect:'follow',
      cache:'no-store',
      headers:{
        'accept':'text/html,application/xhtml+xml',
        'accept-language':'en-US,en;q=0.9',
        'user-agent':'Mozilla/5.0 (compatible; NOMAD342-Nowgoal-Probe/1.0)',
      },
    });
    const html=await response.text();
    return {
      host,
      target,
      ok:response.ok,
      status:response.status,
      elapsedMs:Date.now()-started,
      bytes:html.length,
      contentType:response.headers.get('content-type'),
      finalUrl:response.url,
      m88:parseM88(html),
      diagnostics:pageDiagnostics(html),
    };
  }catch(error){
    return {
      host,
      target,
      ok:false,
      status:null,
      elapsedMs:Date.now()-started,
      bytes:0,
      error:String(error?.name==='AbortError'?'timeout':error?.message||error),
      m88:{companyId:COMPANY_ID,companyName:COMPANY_NAME,companyNamePresent:false,rows:{first:null,live:null,run:null},found:false},
      diagnostics:null,
    };
  }finally{
    clearTimeout(timer);
  }
}

export default {
  async fetch(request){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='GET') return json({ok:false,error:'method_not_allowed'},405);

    const url=new URL(request.url);
    if(url.pathname==='/'||url.pathname==='/health'){
      return json({
        ok:true,
        version:VERSION,
        purpose:'isolated Nowgoal/Mansion88 reachability probe only',
        integration:false,
        company:{id:COMPANY_ID,name:COMPANY_NAME},
        defaultMatchId:DEFAULT_MATCH_ID,
      });
    }
    if(url.pathname!=='/probe') return json({ok:false,error:'not_found'},404);

    const matchId=(url.searchParams.get('matchId')||DEFAULT_MATCH_ID).trim();
    if(!/^\d{5,12}$/.test(matchId)) return json({ok:false,error:'invalid_match_id'},400);

    const results=[];
    for(const host of HOSTS) results.push(await fetchOne(host,matchId));
    const reachable=results.filter(x=>x.ok).length;
    const m88Found=results.filter(x=>x.m88?.found).length;

    return json({
      ok:reachable>0,
      version:VERSION,
      purpose:'isolated Nowgoal/Mansion88 reachability probe only',
      integration:false,
      matchId,
      company:{id:COMPANY_ID,name:COMPANY_NAME},
      summary:{hosts:HOSTS.length,reachable,m88Found},
      results,
      observedAt:new Date().toISOString(),
    });
  },
};
