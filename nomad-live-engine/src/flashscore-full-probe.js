const FS='https://www.flashscore.com';
const HEADERS={accept:'*/*','accept-language':'en-US,en;q=0.9','x-fsign':'SW9D1eZo','user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36',referer:`${FS}/`};
const json=(x,status=200)=>new Response(JSON.stringify(x,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const clip=(s,n=12000)=>String(s||'').slice(0,n);
function rowObjects(text=''){
  return String(text).split('~').map(raw=>{
    const out={};
    for(const field of raw.split('¬')){
      const i=field.indexOf('÷');
      if(i>0) out[field.slice(0,i)]=field.slice(i+1);
    }
    return out;
  }).filter(x=>Object.keys(x).length);
}
async function fsFetch(path){const url=path.startsWith('http')?path:`${FS}${path}`;const r=await fetch(url,{headers:HEADERS});const text=await r.text();return {url,status:r.status,ok:r.ok,ct:r.headers.get('content-type'),text};}
function eventCandidates(text){return rowObjects(text).filter(x=>x.AA&&x.AE&&x.AF).slice(0,40);}
function compactRows(text,max=80){return rowObjects(text).slice(0,max).map(x=>Object.fromEntries(Object.entries(x).filter(([,v])=>String(v).length<900)));}
async function inspectEvent(e){
  const id=e.AA;
  const [summary,stats,h2h,lineups,players,odds]=await Promise.all([fsFetch(`/x/feed/df_sui_1_${id}`),fsFetch(`/x/feed/df_st_1_${id}`),fsFetch(`/x/feed/df_hh_1_${id}`),fsFetch(`/x/feed/df_li_1_${id}`),fsFetch(`/x/feed/df_lu_1_${id}`),fsFetch(`/x/feed/df_od_1_${id}`)]);
  return {event:e,status:{summary:summary.status,stats:stats.status,h2h:h2h.status,lineups:lineups.status,players:players.status,odds:odds.status},statsRows:compactRows(stats.text,120),oddsRows:compactRows(odds.text,160),statsRaw:clip(stats.text,10000),oddsRaw:clip(odds.text,16000)};
}
export default {async fetch(request){
  const u=new URL(request.url);if(u.pathname!=='/probe') return json({ok:true,service:'isolated-source-probe'});
  try{
    const feed=await fsFetch('/x/feed/f_1_0_3_en_1');const allRows=rowObjects(feed.text);const candidates=eventCandidates(feed.text);const samples=[];
    for(const e of candidates.slice(0,10)){const s=await inspectEvent(e);samples.push(s);if(s.status.stats===200&&s.status.odds===200&&s.oddsRaw.length>20) break;}
    return json({ok:true,checkedAt:new Date().toISOString(),feed:{status:feed.status,bytes:feed.text.length,rowCount:allRows.length,eventCount:candidates.length,headRows:compactRows(feed.text,8)},samples});
  }catch(e){return json({ok:false,checkedAt:new Date().toISOString(),error:String(e?.stack||e)},500);}
}};
