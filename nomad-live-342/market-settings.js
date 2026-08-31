(()=>{
'use strict';
const MODE_KEY='nomadMarket342Mode';
const BASE_KEY='nomadMarket342Base';
const REQUIRED_UNLOCK_KEY='nomadMarket342RequiredUnlocked';
function safeGet(key,fallback=''){try{return localStorage.getItem(key)??fallback}catch{return fallback}}
function safeSet(key,value){try{localStorage.setItem(key,value)}catch{}}
function start(){
  if(document.body?.dataset?.page!=='settings')return;
  const form=document.getElementById('settingsForm'),mode=form?.elements?.marketMode,status=document.getElementById('marketEndpointStatus');
  if(!form||!mode)return;
  const unlocked=safeGet(REQUIRED_UNLOCK_KEY,'')==='1';
  const required=[...mode.options].find(x=>x.value==='REQUIRED');if(required)required.disabled=!unlocked;
  const saved=String(safeGet(MODE_KEY,'DISPLAY')).toUpperCase();
  mode.value=['OFF','DISPLAY','CONFIRM'].includes(saved)||(saved==='REQUIRED'&&unlocked)?saved:'DISPLAY';
  if(status){const configured=Boolean(String(safeGet(BASE_KEY,'')).trim());status.textContent=configured?'Authorized market endpoint configured':'Authorized market endpoint not connected yet';status.className=configured?'oktxt':'waittxt'}
  form.addEventListener('submit',()=>{const chosen=String(mode.value||'DISPLAY').toUpperCase();safeSet(MODE_KEY,chosen==='REQUIRED'&&!unlocked?'DISPLAY':chosen)});
  document.getElementById('defaultsButton')?.addEventListener('click',()=>safeSet(MODE_KEY,'DISPLAY'));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
