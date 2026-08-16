const topbar=document.querySelector('.topbar');
const shell=document.querySelector('.shell,.settings-shell');

function statisticsHrefForCurrentPage(){
  const path=String(window.location.pathname||'').replace(/\\/g,'/').toLowerCase();
  if(path.includes('/car3-1-hybrid-live-engine/monitor/'))return './history.html';
  return './statistics.html';
}

function lockCanonicalStatisticsRoute(){
  const href=statisticsHrefForCurrentPage();
  document.querySelectorAll('.nav a').forEach(link=>{
    if(String(link.textContent||'').trim().toUpperCase()==='STATISTICS')link.setAttribute('href',href);
  });
}

function syncTopbarOffset(){
  if(!topbar||!shell)return;
  const height=Math.ceil(topbar.getBoundingClientRect().height);
  shell.style.setProperty('--topbar-offset',`${height+10}px`);
}

lockCanonicalStatisticsRoute();
syncTopbarOffset();
window.addEventListener('resize',syncTopbarOffset,{passive:true});
window.addEventListener('orientationchange',syncTopbarOffset,{passive:true});
if('ResizeObserver' in window&&topbar)new ResizeObserver(syncTopbarOffset).observe(topbar);
