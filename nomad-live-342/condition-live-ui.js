(()=>{
'use strict';
const C1_ARCHIVE='nomadSignalArchive342',C1_LEDGER='nomadLedger342',C2_ARCHIVE='nomadSignalArchive342C2';
function rows(key){try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch{return []}}
function id(x){return String(x?.matchId??x?.id??'')}
function c2Sides(matchId){const set=new Set(rows(C2_ARCHIVE).filter(x=>id(x)===String(matchId)).map(x=>String(x.targetSide||x.side||'').toUpperCase()).filter(Boolean));return [...set]}
function c1Locked(matchId){return [...rows(C1_ARCHIVE),...rows(C1_LEDGER)].some(x=>id(x)===String(matchId))}
function decorate(){if(document.body?.dataset?.page!=='live')return;document.querySelectorAll('.match-wrap[data-match-id]').forEach(card=>{const matchId=card.dataset.matchId;const locked=card.dataset.signalStatus==='LOCKED'||c1Locked(matchId);const c2=c2Sides(matchId);let label=locked?'C1 HOME':'C1';if(c2.length){const side=c2.length>1?'BOTH':c2[0];label=locked?`C1 HOME + C2 ${side}`:`C2 ${side}`}let badge=card.querySelector('.condition-origin');if(!badge){badge=document.createElement('span');badge.className='condition-origin';const cond=card.querySelector('.cond');(cond||card.querySelector('.statebox')||card).appendChild(badge)}badge.textContent=label})}
function start(){if(document.body?.dataset?.page!=='live')return;const list=document.getElementById('matchList');if(list)new MutationObserver(()=>requestAnimationFrame(decorate)).observe(list,{childList:true,subtree:true});decorate()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();