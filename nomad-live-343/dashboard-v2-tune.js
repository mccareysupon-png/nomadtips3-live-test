(()=>{
'use strict';
const VERSION='343-dashboard-v2-ui-tune-v1';
let autoStatusChosen=false;
let userStatusChosen=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function decorateRows(){
  document.querySelectorAll('.match-row').forEach(row=>{
    const score=row.querySelector('.score-cell');
    const signal=row.querySelector('.signal-cell');
    if(!score||!signal)return;
    const clock=score.querySelector('small:not(.half-score)')?.textContent?.trim()||'—';
    const current=signal.dataset.originalSignal||signal.textContent.trim()||'WATCH';
    if(!signal.dataset.originalSignal)signal.dataset.originalSignal=current;
    signal.innerHTML=`<span class="desktop-signal">${esc(current)}</span><span class="mobile-clock">${esc(clock)}</span><small class="mobile-signal">${esc(current)}</small>`;
  });
}
function countOf(key){const el=document.querySelector(`[data-filter-count="${key}"]`);const n=Number(el?.textContent||0);return Number.isFinite(n)?n:0}
function chooseCompactDefault(){
  if(autoStatusChosen||userStatusChosen)return;
  const active=document.querySelector('[data-status-filter].active');
  if(active&&active.dataset.statusFilter!=='all'){autoStatusChosen=true;return}
  let target='all';
  if(countOf('live')>0)target='live';
  else if(countOf('scheduled')>0)target='scheduled';
  if(target==='all')return;
  const btn=document.querySelector(`[data-status-filter="${target}"]`);
  if(!btn)return;
  autoStatusChosen=true;
  btn.click();
}
function sync(){decorateRows();chooseCompactDefault()}
function init(){
  document.querySelectorAll('[data-status-filter]').forEach(btn=>btn.addEventListener('click',e=>{if(e.isTrusted){userStatusChosen=true;autoStatusChosen=true}}));
  const root=document.querySelector('[data-board-sections]')||document.body;
  new MutationObserver(()=>sync()).observe(root,{childList:true,subtree:true});
  sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.NOMAD343_DASHBOARD_TUNE={version:VERSION};
})();
