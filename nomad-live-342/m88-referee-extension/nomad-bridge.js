(()=>{
'use strict';
const PAGE_EVENT='nomad:m88-collector-payload';
function push(payload){
  if(!payload||payload.schema!=='m88-msports-referee') return;
  window.dispatchEvent(new CustomEvent(PAGE_EVENT,{detail:payload}));
}
chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==='M88_REFEREE_PUSH') push(message.payload);
});
try{
  chrome.runtime.sendMessage({type:'M88_REFEREE_GET_ALL'},response=>{
    if(chrome.runtime.lastError) return;
    const rows=Array.isArray(response?.payloads)?response.payloads:[];
    rows.forEach(push);
  });
}catch{}
})();
