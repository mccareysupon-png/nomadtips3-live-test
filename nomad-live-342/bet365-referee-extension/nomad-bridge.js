(()=>{
'use strict';
const PAGE_EVENT='nomad:bet365-collector-payload';
const READY_EVENT='nomad:bet365-observer-ready';
let ready=false;const pending=new Map();
function valid(p){return Boolean(p&&p.schema==='bet365-referee'&&p.event_id&&p.market_id&&p.selection_id&&p.segment==='FT');}
function key(p){return `${p.event_id}|${p.market_id}|${p.selection_id}`;}
function dispatch(p){if(valid(p))window.dispatchEvent(new CustomEvent(PAGE_EVENT,{detail:JSON.stringify(p)}));}
function queueOrDispatch(p){if(!valid(p))return;if(!ready){pending.set(key(p),p);return;}dispatch(p);}
function flush(){if(!ready)return;for(const p of pending.values())dispatch(p);pending.clear();}
function requestCache(){try{chrome.runtime.sendMessage({type:'BET365_REFEREE_GET_ALL'},response=>{if(chrome.runtime.lastError)return;const rows=Array.isArray(response?.payloads)?response.payloads:[];rows.forEach(queueOrDispatch);flush();});}catch{}}
window.addEventListener(READY_EVENT,()=>{ready=true;requestCache();flush();});
chrome.runtime.onMessage.addListener(message=>{if(message?.type==='BET365_REFEREE_PUSH')queueOrDispatch(message.payload);});
function detectReady(){if(ready)return;try{if(document.documentElement?.dataset?.nomadBet365ObserverReady==='1'){ready=true;requestCache();flush();}}catch{}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',detectReady,{once:true});else detectReady();
setTimeout(detectReady,250);setTimeout(detectReady,1000);
})();