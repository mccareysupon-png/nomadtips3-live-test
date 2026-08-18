import './live-fetch-guard.js';
import './visual-tron-v1.js';

const topbar=document.querySelector('.topbar');
const shell=document.querySelector('.shell,.settings-shell');

function installStylesheet(id,file){
  if(document.querySelector(`link[data-car31-layer="${id}"]`))return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=new URL(file,import.meta.url).href;
  link.dataset.car31Layer=id;
  document.head.appendChild(link);
}

function installVisualLayer(){
  installStylesheet('tron-v1','./visual-tron-v1.css?v=20260816-car33-family-v1');
  installStylesheet('topbar-edge-v1','./topbar-edge-v1.css?v=20260816-fullbleed-r1');
}

function statisticsHrefForCurrentPage(){
  const path=String(window.location.pathname||'').replace(/\\/g,'/').toLowerCase();
  if(path.includes('/car3-1-hybrid-live-engine/monitor/'))return '../web/statistics.html';
  return './statistics.html';
}

function paymentHrefForCurrentPage(){
  const path=String(window.location.pathname||'').replace(/\\/g,'/').toLowerCase();
  if(path.includes('/car3-1-hybrid-live-engine/monitor/'))return '../web/payment.html';
  return './payment.html';
}

function lockCanonicalStatisticsRoute(){
  const href=statisticsHrefForCurrentPage();
  document.querySelectorAll('.nav a').forEach(link=>{
    const label=String(link.textContent||'').trim();
    if(label.toUpperCase()==='STATISTICS'||label.toLowerCase()==='statistics')link.setAttribute('href',href);
  });
}

function ensurePaymentRoute(){
  const nav=document.querySelector('.nav');
  if(!nav)return;
  let link=[...nav.querySelectorAll('a')].find(a=>String(a.textContent||'').trim().toUpperCase()==='PAYMENT');
  if(!link){
    link=document.createElement('a');
    link.textContent='PAYMENT';
    nav.appendChild(link);
  }
  link.setAttribute('href',paymentHrefForCurrentPage());
}

function syncTopbarOffset(){
  if(!topbar||!shell)return;
  const height=Math.ceil(topbar.getBoundingClientRect().height);
  shell.style.setProperty('--topbar-offset',`${height+10}px`);
}

installVisualLayer();
lockCanonicalStatisticsRoute();
ensurePaymentRoute();
syncTopbarOffset();
window.addEventListener('resize',syncTopbarOffset,{passive:true});
window.addEventListener('orientationchange',syncTopbarOffset,{passive:true});
if('ResizeObserver' in window&&topbar)new ResizeObserver(syncTopbarOffset).observe(topbar);
