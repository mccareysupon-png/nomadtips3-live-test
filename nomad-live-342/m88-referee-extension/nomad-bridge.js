(()=>{
'use strict';
const PAGE_EVENT='nomad:m88-collector-payload';
const READY_EVENT='nomad:m88-observer-ready';
let ready=false;
const pending=new Map();

function valid(payload){return Boolean(payload&&payload.schema==='m88-msports-referee'&&payload.event_id&&payload.market_id&&payload.selection_id)}
function key(payload){return `${payload.event_id}|${payload.market_id}|${payload.selection_id}`}
function dispatch(payload){
  if(!valid(payload)) return;
  window.dispatchEvent(new CustomEvent(PAGE_EVENT,{detail:JSON.stringify(payload)}));
}
function queueOrDispatch(payload){
  if(!valid(payload)) return;
  if(!ready){pending.set(key(payload),payload);return;}
  dispatch(payload);
}
function flush(){
  if(!ready) return;
  for(const payload of pending.values()) dispatch(payload);
  pending.clear();
}
function requestCache(){
  try{
    chrome.runtime.sendMessage({type:'M88_REFEREE_GET_ALL'},response=>{
      if(chrome.runtime.lastError) return;
      const rows=Array.isArray(response?.payloads)?response.payloads:[];
      rows.forEach(queueOrDispatch);
      flush();
    });
  }catch{}
}

window.addEventListener(READY_EVENT,()=>{
  ready=true;
  requestCache();
  flush();
});
chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==='M88_REFEREE_PUSH') queueOrDispatch(message.payload);
});

function detectReady(){
  if(ready) return;
  try{
    if(document.documentElement?.dataset?.nomadM88ObserverReady==='1'){
      ready=true;
      requestCache();
      flush();
    }
  }catch{}
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',detectReady,{once:true});
else detectReady();
setTimeout(detectReady,250);
setTimeout(detectReady,1000);
})();