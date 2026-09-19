(()=>{
'use strict';
const VERSION='343-v2-shared-ui-v4-signal-status-filter-lite';
const THEME_KEY='nomad343_dashboard_theme_v1';
const LEGACY_THEME_KEY='nomad343_theme_v1';
const ROOT=document.documentElement;
let signalStatusMode=false;
let signalBoardObserver=null;
let signalCountObserver=null;
let expandedForSignal=false;
let applyingSignalFilter=false;
let signalFilterFrame=0;

function storedTheme(){
  try{
    const current=localStorage.getItem(THEME_KEY);
    if(current==='dark'||current==='light')return current;
    const legacy=localStorage.getItem(LEGACY_THEME_KEY);
    return legacy==='dark'?'dark':'light';
  }catch{return'light'}
}
function paintThemeButtons(theme){
  const isLight=theme==='light';
  document.querySelectorAll('[data-v2-theme],[data-theme-toggle]').forEach(btn=>{
    btn.textContent=isLight?'☾ Dark':'☀ Light';
    btn.setAttribute('aria-label',isLight?'Switch to dark theme':'Switch to light theme');
    btn.setAttribute('aria-pressed',String(!isLight));
  });
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',isLight?'#edf1f0':'#101512');
}
function setTheme(theme,{persist=true}={}){
  const next=theme==='dark'?'dark':'light';
  ROOT.dataset.theme=next;
  paintThemeButtons(next);
  if(persist){try{localStorage.setItem(THEME_KEY,next)}catch{}}
  document.dispatchEvent(new CustomEvent('nomad343:theme-change',{detail:{theme:next}}));
  return next;
}
function toggleTheme(){setTheme(ROOT.dataset.theme==='dark'?'light':'dark')}
function markActive(){
  const page=document.body?.dataset?.page||'';
  document.querySelectorAll('[data-nav]').forEach(a=>{
    const active=a.dataset.nav===page||(page==='settings'&&a.dataset.nav==='settings');
    a.classList.toggle('active',active);
    if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
}
function ensureUtils(){
  const inner=document.querySelector('.topbar-inner');
  if(!inner||inner.querySelector('.v2-utils'))return;
  const wrap=document.createElement('div');
  wrap.className='v2-utils';
  wrap.innerHTML='<span class="v2-chip">BULK · DEC</span><button type="button" class="v2-theme" data-v2-theme>☾ Dark</button>';
  inner.appendChild(wrap);
}
function bindThemeControls(){
  if(document.body?.dataset?.page==='live')return;
  document.querySelectorAll('[data-v2-theme],[data-theme-toggle]').forEach(btn=>{
    if(btn.dataset.themeBound==='1')return;
    btn.dataset.themeBound='1';
    btn.addEventListener('click',toggleTheme);
  });
}
function signalBadgeValue(){
  const raw=document.querySelector('[data-active-match-count]')?.textContent||'0';
  const value=Number.parseInt(raw.replace(/[^0-9]/g,''),10);
  return Number.isFinite(value)?value:0;
}
function syncSignalBadge(value=null){
  const badge=document.querySelector('[data-signal-status-count]');
  if(!badge)return;
  const next=value===null?signalBadgeValue():Number(value);
  const text=String(Number.isFinite(next)?Math.max(0,next):0);
  if(badge.textContent!==text)badge.textContent=text;
}
function ensureSignalFilterStyle(){
  if(document.getElementById('signal-status-filter-style'))return;
  const style=document.createElement('style');
  style.id='signal-status-filter-style';
  style.textContent='.signal-status-filter .signal-status-label{padding-left:14px}.signal-status-filter .signal-status-mark{display:inline-block;margin-right:8px;color:#e3b84f;font-size:9px;line-height:1}.signal-status-filter-empty{padding:18px 12px;text-align:center;color:var(--muted);font-size:9px}.signal-status-filter.active .signal-status-mark{color:#f1ca64}';
  document.head.appendChild(style);
}
function restoreSignalView(){
  const host=document.querySelector('[data-board-sections]');
  if(!host)return;
  host.querySelectorAll('[data-match-id],.league-block,.show-more').forEach(el=>{el.hidden=false});
  host.querySelector('.signal-status-filter-empty')?.remove();
}
function scheduleSignalFilter(){
  if(!signalStatusMode||signalFilterFrame)return;
  signalFilterFrame=requestAnimationFrame(()=>{
    signalFilterFrame=0;
    applySignalStatusFilter();
  });
}
function applySignalStatusFilter(){
  if(!signalStatusMode||applyingSignalFilter)return;
  applyingSignalFilter=true;
  try{
    const host=document.querySelector('[data-board-sections]');
    const section=host?.querySelector('[data-status-section="live"]');
    if(!section){syncSignalBadge(0);return}
    const expand=section.querySelector('[data-expand-group="live"]');
    if(expand&&/view all/i.test(expand.textContent||'')){
      expandedForSignal=true;
      expand.click();
      scheduleSignalFilter();
      return;
    }
    const rows=section.querySelectorAll('[data-match-id]');
    let count=0;
    for(const row of rows){
      const hasSignal=Boolean(row.querySelector('.signal-cell.locked'));
      row.hidden=!hasSignal;
      if(hasSignal)count++;
    }
    section.querySelectorAll('.league-block').forEach(block=>{
      let visible=false;
      for(const row of block.querySelectorAll('[data-match-id]')){if(!row.hidden){visible=true;break}}
      block.hidden=!visible;
    });
    const more=section.querySelector('.show-more');
    if(more)more.hidden=true;
    const title=section.querySelector('.status-head h2');
    if(title&&title.textContent!=='SIGNAL MATCHES')title.textContent='SIGNAL MATCHES';
    const total=section.querySelector('.status-head>b');
    const countText=String(count);
    if(total&&total.textContent!==countText)total.textContent=countText;
    let empty=section.querySelector('.signal-status-filter-empty');
    if(count===0){
      if(!empty){empty=document.createElement('div');empty.className='signal-status-filter-empty';empty.textContent='No active signals right now.';section.appendChild(empty)}
    }else empty?.remove();
    syncSignalBadge(count);
  }finally{
    applyingSignalFilter=false;
  }
}
function activateSignalStatusFilter(){
  if(signalStatusMode){scheduleSignalFilter();return}
  signalStatusMode=true;
  const live=document.querySelector('[data-status-filter="live"]');
  if(live&&!live.classList.contains('active'))live.click();
  document.querySelectorAll('[data-status-filter]').forEach(btn=>btn.classList.remove('active'));
  document.querySelector('[data-signal-status-filter]')?.classList.add('active');
  scheduleSignalFilter();
}
function exitSignalStatusFilter(){
  if(!signalStatusMode)return;
  signalStatusMode=false;
  if(signalFilterFrame){cancelAnimationFrame(signalFilterFrame);signalFilterFrame=0}
  document.querySelector('[data-signal-status-filter]')?.classList.remove('active');
  restoreSignalView();
  if(expandedForSignal){
    const collapse=document.querySelector('[data-expand-group="live"]');
    if(collapse&&/show less/i.test(collapse.textContent||''))collapse.click();
  }
  expandedForSignal=false;
  syncSignalBadge();
}
function installSignalStatusFilter(){
  if(document.body?.dataset?.page!=='live')return;
  const live=document.querySelector('[data-status-filter="live"]');
  if(!live||document.querySelector('[data-signal-status-filter]'))return;
  ensureSignalFilterStyle();
  const button=document.createElement('button');
  button.type='button';
  button.className='filter signal-status-filter';
  button.dataset.signalStatusFilter='signal';
  button.innerHTML='<span class="signal-status-label"><i class="signal-status-mark">◆</i>Signal</span><b data-signal-status-count>0</b>';
  live.insertAdjacentElement('afterend',button);
  button.addEventListener('click',activateSignalStatusFilter);
  document.querySelectorAll('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{if(signalStatusMode)exitSignalStatusFilter()},{capture:true}));
  const host=document.querySelector('[data-board-sections]');
  if(host){
    signalBoardObserver=new MutationObserver(()=>{if(signalStatusMode)scheduleSignalFilter()});
    signalBoardObserver.observe(host,{childList:true});
  }
  const activeMatches=document.querySelector('[data-active-match-count]');
  if(activeMatches){
    signalCountObserver=new MutationObserver(()=>{if(!signalStatusMode)syncSignalBadge()});
    signalCountObserver.observe(activeMatches,{childList:true,characterData:true,subtree:true});
  }
  syncSignalBadge();
}
function init(){
  ensureUtils();
  setTheme(storedTheme(),{persist:true});
  bindThemeControls();
  markActive();
  installSignalStatusFilter();
  window.addEventListener('storage',e=>{
    if(e.key===THEME_KEY&&(e.newValue==='dark'||e.newValue==='light'))setTheme(e.newValue,{persist:false});
  });
  ROOT.dataset.v2='ready';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.NOMAD343_V2_SHARED={version:VERSION,setTheme,toggleTheme};
})();
