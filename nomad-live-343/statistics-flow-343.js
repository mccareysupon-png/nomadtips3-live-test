(()=>{
'use strict';
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const qs=()=>new URLSearchParams(location.search);
const validStatus=new Set(['all','live','scheduled','unknown','finished']);
function applyStatusFromUrl(){
  if(document.body?.dataset?.page!=='live')return;
  const status=qs().get('status');
  if(!status||!validStatus.has(status)||status==='all')return;
  const btn=$(`[data-status-filter="${status}"]`);
  if(btn&&!btn.classList.contains('active'))btn.click();
}
function bindStatusToUrl(){
  if(document.body?.dataset?.page!=='live')return;
  $$('[data-status-filter]').forEach(btn=>{
    if(btn.dataset.flowUrlBound==='1')return;
    btn.dataset.flowUrlBound='1';
    btn.addEventListener('click',()=>{
      const status=btn.dataset.statusFilter||'all';
      const q=qs();
      if(status==='all')q.delete('status');else q.set('status',status);
      if(q.get('match'))q.delete('match');
      const next=`${location.pathname}${q.toString()?`?${q}`:''}`;
      history.replaceState(null,'',next);
    });
  });
}
function mirrorSignalCount(){
  const source=$('[data-signal-count]')||$('[data-next-active-signals]');
  const targets=$$('[data-flow-signal-count]');
  if(!source||!targets.length)return;
  const sync=()=>targets.forEach(target=>{target.textContent=source.textContent||'0'});
  sync();
  new MutationObserver(sync).observe(source,{childList:true,characterData:true,subtree:true});
}
function focusRequestedMatch(){
  if(document.body?.dataset?.page!=='live')return;
  const id=qs().get('match');if(!id)return;
  const find=()=>{
    let row=null;
    try{row=document.querySelector(`[data-match-id="${CSS.escape(id)}"]`)}catch{}
    if(!row)return false;
    row.click();
    row.scrollIntoView({behavior:'smooth',block:'center'});
    return true;
  };
  if(find())return;
  const root=$('[data-board-sections]');if(!root)return;
  const obs=new MutationObserver(()=>{if(find())obs.disconnect()});
  obs.observe(root,{childList:true,subtree:true});
  setTimeout(()=>obs.disconnect(),15000);
}
function init(){applyStatusFromUrl();bindStatusToUrl();mirrorSignalCount();focusRequestedMatch();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
