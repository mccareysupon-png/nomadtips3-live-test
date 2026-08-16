const topbar=document.querySelector('.topbar');
const shell=document.querySelector('.shell,.settings-shell');

function syncTopbarOffset(){
  if(!topbar||!shell)return;
  const height=Math.ceil(topbar.getBoundingClientRect().height);
  shell.style.setProperty('--topbar-offset',`${height+10}px`);
}

syncTopbarOffset();
window.addEventListener('resize',syncTopbarOffset,{passive:true});
window.addEventListener('orientationchange',syncTopbarOffset,{passive:true});
if('ResizeObserver' in window&&topbar)new ResizeObserver(syncTopbarOffset).observe(topbar);
