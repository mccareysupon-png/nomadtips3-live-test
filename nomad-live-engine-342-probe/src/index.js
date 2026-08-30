const SOURCE='https://www.totalcorner.com';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64 x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';

const json=(value,status=200)=>new Response(JSON.stringify(value,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}});
const strip=s=>String(s||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/\s+/g,' ').trim();
const clip=(s,n=1600)=>String(s||'').slice(0,n);

function snippets(html,needle,radius=420,limit=8){
  const out=[]; const lower=html.toLowerCase(),q=needle.toLowerCase(); let from=0;
  while(out.length<limit){const i=lower.indexOf(q,from);if(i<0)break;out.push(clip(html.slice(Math.max(0,i-radius),i+q.length+radius),radius*2+q.length));from=i+q.length;}
  return out;
}
function scriptSrcs(html){
  return [...String(html).matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]).slice(0,80);
}
function inputs(html){
  return [...String(html).matchAll(/<(?:input|select|option)\b[^>]*>/gi)].map(m=>m[0]).filter(x=>/shot|possess|event|column|custom|display|show/i.test(x)).slice(0,120);
}
function tablePreview(html){
  const table=(String(html).match(/<table\b[^>]*>[\s\S]*?<\/table>/i)||[])[0]||'';
  const rows=[...table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(m=>strip(m[0])).filter(Boolean);
  return rows.slice(0,8);
}
async function get(url,headers={}){
  const r=await fetch(url,{cache:'no-store',headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,*/*;q=0.8','accept-language':'en-US,en;q=0.9',...headers}});
  const text=await r.text();
  return {url,status:r.status,contentType:r.headers.get('content-type'),length:text.length,text};
}
function summarize(hit){
  const html=hit.text;
  return {url:hit.url,status:hit.status,contentType:hit.contentType,length:hit.length,
    has:{shotsOn:/Shots? on Target|Shoot on target/i.test(html),shotsOff:/Shots? off Target|Shoot off target/i.test(html),possession:/Possession/i.test(html),events:/Live Events|Events with chart|Events without chart/i.test(html),customize:/Customize Columns|Save Default/i.test(html)},
    inputs:inputs(html),scripts:scriptSrcs(html),table:tablePreview(html),
    context:{shotsOn:snippets(html,'Shots on Target'),shotsOff:snippets(html,'Shots off Target'),possession:snippets(html,'Possession'),events:snippets(html,'Events with chart'),customize:snippets(html,'Customize Columns'),save:snippets(html,'Save Default')}
  };
}
async function inspectScripts(baseSummary){
  const out=[];
  for(const raw of baseSummary.scripts.slice(0,30)){
    let url;try{url=new URL(raw,SOURCE).toString();}catch{continue;}
    if(!url.startsWith(SOURCE)&&!url.includes('totalcorner.com')) continue;
    try{
      const hit=await get(url,{'accept':'*/*','referer':`${SOURCE}/match/today/`});
      const interesting=/shot|possess|column|custom|ajax|xmlhttprequest|fetch\(|cookie|localstorage|event/i.test(hit.text);
      if(!interesting)continue;
      const matches=[];
      for(const q of ['shot','possess','column','custom','ajax','XMLHttpRequest','fetch(','cookie','localStorage','event']){
        const s=snippets(hit.text,q,260,3);if(s.length)matches.push({q,s});
      }
      out.push({url,status:hit.status,length:hit.length,matches});
    }catch(e){out.push({url,error:String(e?.message||e)});}
  }
  return out.slice(0,20);
}

export default {async fetch(request){
  const u=new URL(request.url);
  if(u.pathname!='/probe'&&u.pathname!='/')return json({ok:false,error:'not_found'},404);
  try{
    const candidates=[
      `${SOURCE}/match/today/`,
      `${SOURCE}/match/today/?columns=events,attacks,dangerousAttacks,shotOn,shotOff,possession`,
      `${SOURCE}/match/today?columns=events,attacks,dangerousAttacks,shotOn,shotOff,possession`,
      `${SOURCE}/match/today/?columns=events%2Cattacks%2CdangerousAttacks%2CshotOn%2CshotOff%2Cpossession`,
    ];
    const hits=[];for(const url of candidates)hits.push(summarize(await get(url)));
    const scripts=await inspectScripts(hits[0]);
    return json({ok:true,observedAt:new Date().toISOString(),hits,scripts});
  }catch(e){return json({ok:false,error:String(e?.stack||e)},500);}
}};
