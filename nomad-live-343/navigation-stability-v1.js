(()=>{
'use strict';
const ROOT=document.documentElement;
if(!ROOT.classList.contains('b46-page2-prep'))return;
let released=false;
function release(){if(released)return;released=true;ROOT.classList.remove('b46-page2-prep');ROOT.dataset.b46NavStable='ready'}
function ready(){return Boolean(document.querySelector('[data-b46-page2-workspace]'))}
function check(frame=0){
  if(ready()||frame>=24){release();return}
  requestAnimationFrame(()=>check(frame+1));
}
function start(){requestAnimationFrame(()=>check(0))}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
setTimeout(release,1200);
})();
