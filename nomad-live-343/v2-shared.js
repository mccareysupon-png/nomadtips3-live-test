(()=>{
'use strict';
const VERSION='343-v2-shared-ui-v2-theme-flow';
const THEME_KEY='nomad343_dashboard_theme_v1';
const LEGACY_THEME_KEY='nomad343_theme_v1';
const ROOT=document.documentElement;

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
  /* Page 1 dashboard owns its existing toggle to avoid double handlers.
     Pages 2/3 and legacy V2 pages are owned here. */
  if(document.body?.dataset?.page==='live')return;
  document.querySelectorAll('[data-v2-theme],[data-theme-toggle]').forEach(btn=>{
    if(btn.dataset.themeBound==='1')return;
    btn.dataset.themeBound='1';
    btn.addEventListener('click',toggleTheme);
  });
}
function init(){
  ensureUtils();
  setTheme(storedTheme(),{persist:true});
  bindThemeControls();
  markActive();
  window.addEventListener('storage',e=>{
    if(e.key===THEME_KEY&&(e.newValue==='dark'||e.newValue==='light'))setTheme(e.newValue,{persist:false});
  });
  ROOT.dataset.v2='ready';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.NOMAD343_V2_SHARED={version:VERSION,setTheme,toggleTheme};
})();
