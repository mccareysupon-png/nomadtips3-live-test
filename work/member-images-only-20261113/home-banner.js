/* PC artwork only. Keep Monitor/vote DOM adjacency and their scripts intact. */
(()=>{'use strict';if(window.__B46_HOME_MEMBER_PROMO_20261112)return;window.__B46_HOME_MEMBER_PROMO_20261112=true;
const desktop=matchMedia('(min-width:1024px)'),saved=new Map();let queued=false;
function restore(){for(const [node,old]of saved){if(old.value)node.style.setProperty('order',old.value,old.priority);else node.style.removeProperty('order')}saved.clear()}
function artwork(image){const light=document.documentElement.dataset.theme==='light',src=light?'/home-membership-light-v2.png':'/home-membership-dark-v2.png';if(image.getAttribute('src')!==src)image.src=src;image.alt='BALL46 Member. Daily signals, market filters, performance and match insights. Join now.'}
function sync(){queued=false;const existing=document.querySelector('.b46-home-member-promo');
if(!desktop.matches||document.body.dataset.workspaceView!=='live'){existing?.remove();restore();return}
const monitor=document.querySelector('.right-rail>.b46-match-monitor'),rail=monitor?.parentElement;if(!monitor)return;
let promo=existing;if(!promo){promo=document.createElement('aside');promo.className='b46-home-member-promo';promo.setAttribute('aria-label','BALL46 membership');const a=document.createElement('a');a.href='https://member.ball46.com/pricing';a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label','Join BALL46 membership (opens in a new tab)');const image=document.createElement('img');image.width=724;image.height=2172;image.decoding='async';artwork(image);a.append(image);promo.append(a);rail.append(promo)}
artwork(promo.querySelector('img'));if(rail.lastElementChild!==promo)rail.append(promo);
// Grid/flex order adds one visual slot without moving the original cards.
let index=0;for(const node of rail.children){if(node===promo)continue;if(!saved.has(node))saved.set(node,{value:node.style.getPropertyValue('order'),priority:node.style.getPropertyPriority('order')});const order=String(index*2);if(node.style.order!==order)node.style.order=order;if(node===monitor){const slot=String(index*2+1);if(promo.style.order!==slot)promo.style.order=slot}index++}
for(const node of saved.keys())if(!node.isConnected)saved.delete(node);
}
function schedule(){if(!queued){queued=true;requestAnimationFrame(sync)}}
function boot(){new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-workspace-view']});new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});desktop.addEventListener('change',schedule);sync()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();})();
