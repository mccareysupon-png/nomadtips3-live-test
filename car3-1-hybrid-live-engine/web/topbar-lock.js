import './live-fetch-guard.js';
import './visual-tron-v1.js';

const topbar=document.querySelector('.topbar');
const shell=document.querySelector('.shell,.settings-shell');

function installVisualLayer(){
  if(document.querySelector('link[data-car31-visual="tron-v1"]'))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='./visual-tron-v1.css?v=20260816-car33-family-v1';
  link.dataset.car31Visual='tron-v1';
  document.head.appendChild(link);
}

function statisticsHrefForCurrentPage(){
  const path=String(window.location.pathname||'').replace(/\\/g,'/').toLowerCase();
  if(path.includes('/car3-1-hybrid-live-engine/monitor/'))return '../web/statistics.html';
  return './statistics.html';
}

function lockCanonicalStatisticsRoute(){
  const href=statisticsHrefForCurrentPage();
  document.querySelectorAll('.nav a').forEach(link=>{
    if(String(link.textContent||'').trim().toUpperCase()==='STATISTICS'||String(link.textContent||'').trim().toLowerCase()==='statistics')link.setAttribute('href',href);
  });
}

function syncTopbarOffset(){
  if(!topbar||!shell)return;
  const height=Math.ceil(topbar.getBoundingClientRect().height);
  shell.style.setProperty('--topbar-offset',`${height+10}px`);
}

installVisualLayer();
lockCanonicalStatisticsRoute();
syncTopbarOffset();
window.addEventListener('resize',syncTopbarOffset,{passive:true});
window.addEventListener('orientationchange',syncTopbarOffset,{passive:true});
if('ResizeObserver' in window&&topbar)new ResizeObserver(syncTopbarOffset).observe(topbar);
