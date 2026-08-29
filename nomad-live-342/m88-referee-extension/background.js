(()=>{
'use strict';
const STORE_KEY='nomadM88LatestByEvent';
const MAX_EVENTS=100;
const NOMAD_URLS=[
  'https://mccareysupon-png.github.io/nomadtips3-live-test/nomad-live-342/*',
  'http://127.0.0.1/*',
  'http://localhost/*'
];

function eventKey(p){return String(p?.event_id||'')}
function valid(p){return Boolean(p&&p.schema==='m88-msports-referee'&&eventKey(p)&&p.market_id&&p.selection_id)}
async function readStore(){
  try{return (await chrome.storage.session.get(STORE_KEY))[STORE_KEY]||{}}catch{return {}}
}
async function writeStore(store){
  const entries=Object.entries(store).sort((a,b)=>Date.parse(b[1]?.received_at_utc||0)-Date.parse(a[1]?.received_at_utc||0)).slice(0,MAX_EVENTS);
  await chrome.storage.session.set({[STORE_KEY]:Object.fromEntries(entries)});
}
async function broadcast(payload){
  try{
    const tabs=await chrome.tabs.query({url:NOMAD_URLS});
    for(const tab of tabs){if(tab.id) chrome.tabs.sendMessage(tab.id,{type:'M88_REFEREE_PUSH',payload}).catch(()=>{})}
  }catch{}
}
chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type==='M88_REFEREE_UPDATE'&&valid(message.payload)){
    (async()=>{
      const store=await readStore();
      store[eventKey(message.payload)]=message.payload;
      await writeStore(store);
      await broadcast(message.payload);
      sendResponse({ok:true});
    })().catch(()=>sendResponse({ok:false}));
    return true;
  }
  if(message?.type==='M88_REFEREE_GET_ALL'){
    readStore().then(store=>sendResponse({ok:true,payloads:Object.values(store)})).catch(()=>sendResponse({ok:false,payloads:[]}));
    return true;
  }
});
})();