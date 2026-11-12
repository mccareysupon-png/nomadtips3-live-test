/* Presentation only. Theme-specific membership artwork; no API, score or monitor changes. */
(()=>{'use strict';if(window.__B46_HOME_MEMBER_PROMO_20261112)return;window.__B46_HOME_MEMBER_PROMO_20261112=true;const desktop=matchMedia('(min-width:1024px)');let queued=false;
function artwork(image){const light=document.documentElement.dataset.theme==='light',src=light?'/home-membership-light-v2.png':'/home-membership-dark-v2.png';if(image.getAttribute('src')!==src)image.src=src;image.alt='BALL46 Member. Daily signals, one screen. All daily signals; filter by market; today\'s Win Rate and P/L; Event Flow and match stats. Join now.'}
function sync(){queued=false;const monitor=document.querySelector('.right-rail>.b46-match-monitor');
const existing=document.querySelector('.b46-home-member-promo');
if(!desktop.matches||document.body.dataset.workspaceView!=='live'){existing?.remove();return}
if(!monitor)return;if(existing){artwork(existing.querySelector('img'));return}
const promo=document.createElement('aside');promo.className='b46-home-member-promo';promo.setAttribute('aria-label','BALL46 membership');
const link=document.createElement('a');link.href='https://member.ball46.com/pricing';link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','Join BALL46 membership (opens in a new tab)');
const image=document.createElement('img');image.width=724;image.height=2172;image.decoding='async';artwork(image);
link.append(image);promo.append(link);monitor.after(promo)}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(sync)}
function boot(){const rail=document.querySelector('.right-rail');if(rail)new MutationObserver(schedule).observe(rail,{childList:true});new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-workspace-view']});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});desktop.addEventListener('change',schedule);sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();})();
