(()=>{
'use strict';
const cfg=window.NOMAD_M88BOT_RUNTIME||{};
const $=id=>document.getElementById(id);
const text=(id,value)=>{const el=$(id);if(el)el.textContent=value??'—';};
const state=(id,value,kind='neutral')=>{const el=$(id);if(!el)return;el.textContent=value;el.classList.remove('ok','bad','neutral');el.classList.add(kind);};
const fmtTime=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleString();};

async function getJson(path){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),Number(cfg.requestTimeoutMs)||9000);
  try{
    const res=await fetch(`${String(cfg.engineBase||'').replace(/\/$/,'')}${path}`,{cache:'no-store',signal:ac.signal,headers:{accept:'application/json'}});
    const body=await res.json().catch(()=>null);
    if(!res.ok)throw new Error(`HTTP ${res.status}`);
    return body;
  }finally{clearTimeout(timer);}
}

async function refresh(){
  text('targetRoute',String(cfg.targetRoute||'').replace(/^https?:\/\//,''));
  text('routeState',cfg.routeState||'NOT ROUTED');
  text('sourceBranch',cfg.sourceBranch||'—');
  state('dbStatus',cfg.centralLedgerState==='READY'?'READY':'NOT PROVISIONED',cfg.centralLedgerState==='READY'?'ok':'neutral');
  text('lastProbe',new Date().toLocaleTimeString());

  try{
    const health=await getJson(cfg.endpoints?.health||'/health');
    const version=String(health?.version||'');
    const healthy=health?.ok!==false&&version==='3.42';
    state('workerStatus',healthy?'ONLINE':'CHECK',healthy?'ok':'bad');
    text('workerNote',healthy?'3.42 response verified':'unexpected health response');
    text('workerVersion',version||'—');
    text('lastError',health?.lastError||'—');
  }catch(error){
    state('workerStatus','OFFLINE','bad');
    text('workerNote','health probe failed');
    text('workerVersion','—');
    text('lastError',String(error?.message||error));
  }

  try{
    const feed=await getJson(cfg.endpoints?.feed||'/feed');
    const matches=Array.isArray(feed?.matches)?feed.matches:[];
    const valid=feed?.version==='3.42'&&Array.isArray(feed?.matches);
    state('feedStatus',valid?(matches.length?'UP':'EMPTY'):'CHECK',valid?'ok':'bad');
    text('feedNote',valid?`${matches.length} live match${matches.length===1?'':'es'}`:'feed contract mismatch');
    text('feedMode',feed?.mode||'—');
    text('liveCount',String(matches.length));
    text('feedUpdated',fmtTime(feed?.updatedAt));
    if(feed?.lastError)text('lastError',feed.lastError);
  }catch(error){
    state('feedStatus','OFFLINE','bad');
    text('feedNote','feed probe failed');
    text('feedMode','—');
    text('liveCount','—');
    text('feedUpdated','—');
    text('lastError',String(error?.message||error));
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',refresh,{once:true});
else refresh();
setInterval(refresh,Math.max(10000,Number(cfg.refreshMs)||15000));
})();
