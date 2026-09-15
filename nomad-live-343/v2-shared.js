(()=>{
'use strict';
const VERSION='343-v2-shared-ui-v1';
const THEME_KEY='nomad343_dashboard_theme_v1';
function setTheme(theme){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;document.querySelectorAll('[data-v2-theme]').forEach(btn=>btn.textContent=next==='light'?'☾ Dark':'☀ Light');try{localStorage.setItem(THEME_KEY,next)}catch{}}
function markActive(){const page=document.body?.dataset?.page||'';document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===page||(page==='settings'&&a.dataset.nav==='settings');a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')})}
function ensureUtils(){const inner=document.querySelector('.topbar-inner');if(!inner||inner.querySelector('.v2-utils'))return;const wrap=document.createElement('div');wrap.className='v2-utils';wrap.innerHTML='<span class="v2-chip">BULK · DEC</span><button type="button" class="v2-theme" data-v2-theme>☾ Dark</button>';inner.appendChild(wrap);wrap.querySelector('[data-v2-theme]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'))}
function init(){let stored=null;try{stored=localStorage.getItem(THEME_KEY)}catch{}setTheme(stored==='dark'?'dark':'light');ensureUtils();markActive();document.documentElement.dataset.v2='ready'}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.NOMAD343_V2_SHARED={version:VERSION,setTheme};
})();
