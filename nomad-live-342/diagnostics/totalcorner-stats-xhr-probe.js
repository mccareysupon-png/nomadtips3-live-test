(()=>{
'use strict';

const STATE_KEY='__NOMAD_TC_STATS_XHR_PROBE__';
const MIN_RETRY_MS=30000;

function compactText(value=''){
  return String(value).replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
}
function lower(value=''){return compactText(value).toLowerCase()}
function isTotalCornerStatsPage(){
  return /(^|\.)totalcorner\.com$/i.test(location.hostname) && /^\/stats\//i.test(location.pathname);
}
function matchIdFromPath(){
  const m=location.pathname.match(/\/(\d+)\/?$/);
  return m?m[1]:null;
}
function challengeDetected(status,html=''){
  const body=String(html||'');
  return status===403||status===429||/cf-chl-|challenge-platform|just a moment|attention required|captcha|cf-turnstile/i.test(body);
}
function pairFromRowText(text){
  const values=[...String(text).matchAll(/(?:^|\s)(\d{1,3}(?:\.\d+)?)\s*%?(?=\s|$)/g)].map(m=>Number(m[1])).filter(Number.isFinite);
  if(values.length<2)return null;
  return {home:values[0],away:values[values.length-1]};
}
function findMetric(doc,labels){
  const rows=[...doc.querySelectorAll('tr')].map((node,index)=>({index,node,text:compactText(node.textContent||'')})).filter(x=>x.text);
  for(const row of rows){
    const rowLower=lower(row.text);
    if(!labels.some(label=>rowLower.includes(label)))continue;
    const pair=pairFromRowText(row.text);
    return {pair,rowText:row.text,rowIndex:row.index};
  }
  const text=compactText(doc.body?.textContent||doc.documentElement?.textContent||'');
  for(const label of labels){
    const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const patterns=[
      new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s+${esc}\\s+(\\d{1,3}(?:\\.\\d+)?)\\s*%?`,'i'),
      new RegExp(`${esc}[^\\d]{0,60}(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s*(?:-|–|:|\\s+)\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*%?`,'i'),
      new RegExp(`(\\d{1,3}(?:\\.\\d+)?)\\s*%?\\s*(?:-|–|:)\\s*(\\d{1,3}(?:\\.\\d+)?)\\s*%?[^A-Za-z]{0,30}${esc}`,'i'),
    ];
    for(const re of patterns){
      const m=re.exec(text);
      if(m)return {pair:{home:Number(m[1]),away:Number(m[2])},rowText:m[0],rowIndex:null};
    }
  }
  return {pair:null,rowText:null,rowIndex:null};
}
function parseStats(html){
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const sot=findMetric(doc,['shoot on target','shots on target','shot on target']);
  const off=findMetric(doc,['shoot off target','shots off target','shot off target']);
  const possession=findMetric(doc,['possession %','ball possession','possession']);
  return {
    title:compactText(doc.title||''),
    metrics:{
      shotOnTarget:sot.pair,
      shotOff:off.pair,
      possession:possession.pair,
    },
    evidence:{
      shotOnTarget:sot.rowText,
      shotOff:off.rowText,
      possession:possession.rowText,
    },
  };
}
function requestCurrentStats(){
  return new Promise(resolve=>{
    const url=new URL(location.href);
    url.searchParams.set('_nomad_stats_probe',String(Date.now()));
    const xhr=new XMLHttpRequest();
    xhr.open('GET',url.toString(),true);
    xhr.withCredentials=true;
    xhr.timeout=12000;
    xhr.setRequestHeader('Accept','text/html,application/xhtml+xml');
    xhr.onreadystatechange=()=>{
      if(xhr.readyState!==4)return;
      const html=xhr.responseText||'';
      if(challengeDetected(xhr.status,html)){
        resolve({ok:false,access:'CLOUDFLARE_CHALLENGE',status:xhr.status,bytes:html.length});
        return;
      }
      if(xhr.status<200||xhr.status>=300){
        resolve({ok:false,access:'HTTP_ERROR',status:xhr.status,bytes:html.length});
        return;
      }
      resolve({ok:true,access:'PAGE_OK',status:xhr.status,bytes:html.length,...parseStats(html)});
    };
    xhr.ontimeout=()=>resolve({ok:false,access:'TIMEOUT',status:0,bytes:0});
    xhr.onerror=()=>resolve({ok:false,access:'NETWORK_ERROR',status:xhr.status||0,bytes:0});
    xhr.send();
  });
}
async function run(){
  if(!isTotalCornerStatsPage()){
    const result={ok:false,access:'WRONG_PAGE',url:location.href};
    console.warn('[NOMAD TC STATS XHR]',result);
    return result;
  }
  const state=window[STATE_KEY]||{};
  const now=Date.now();
  if(state.lastRunAt&&now-state.lastRunAt<MIN_RETRY_MS){
    const result={ok:false,access:'THROTTLED',retryAfterMs:MIN_RETRY_MS-(now-state.lastRunAt)};
    console.warn('[NOMAD TC STATS XHR]',result);
    return result;
  }
  window[STATE_KEY]={...state,lastRunAt:now};
  const result=await requestCurrentStats();
  const output={
    ...result,
    matchId:matchIdFromPath(),
    url:location.href,
    checkedAt:new Date().toISOString(),
  };
  window[STATE_KEY]={lastRunAt:now,lastResult:output};
  console.log('[NOMAD TC STATS XHR]',output);
  if(output.metrics)console.table(output.metrics);
  return output;
}

window.NOMAD_TOTALCORNER_STATS_XHR=Object.freeze({run});
console.info('[NOMAD TC STATS XHR] ready; run NOMAD_TOTALCORNER_STATS_XHR.run() from an already-open TotalCorner /stats/ page.');
})();
