/* TEST: empty Recent Events artwork only. No event/signal generation or requests. */
(()=>{'use strict';let queued=false;
const message='No recent events in the current snapshot.';
function render(){queued=false;for(const empty of document.querySelectorAll('[data-featured-events]>.feature-empty')){
 if(empty.querySelector('.ew-content')||empty.textContent.trim()!==message)continue;
 empty.classList.add('b46-event-watch');
 empty.innerHTML='<span class="ew-original" aria-hidden="true">'+message+'</span><div class="ew-content"><span class="ew-emblem" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="17" stroke="currentColor" opacity=".13"/><circle cx="20" cy="20" r="12" stroke="currentColor" opacity=".13"/><path d="M20 1v4M20 35v4M1 20h4M35 20h4" stroke="currentColor" opacity=".25"/><g class="ew-orbit"><path d="M20 3a17 17 0 0 1 17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m20 20 13-8a15 15 0 0 0-13-7Z" fill="currentColor" opacity=".08"/></g><circle class="ew-dot" cx="20" cy="20" r="2.5" fill="currentColor"/><circle cx="20" cy="20" r="5.5" stroke="currentColor" opacity=".2"/></svg></span><div class="ew-copy"><div class="ew-top"><strong>EVENT WATCH</strong><small>STANDBY</small></div><p>Waiting for match events</p></div><span class="ew-track" aria-hidden="true"></span></div>';
 }}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render)}}
new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.ew-content')))schedule()}).observe(document.body,{childList:true,subtree:true});schedule();
})();

/* TEST ONLY: presentation driven by the existing Signal host state. No requests or engine changes. */
(()=>{'use strict';let queued=false;
const markup='<div class="ew-content"><span class="ew-emblem" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="17" stroke="currentColor" opacity=".13"/><circle cx="20" cy="20" r="12" stroke="currentColor" opacity=".13"/><path d="M20 1v4M20 35v4M1 20h4M35 20h4" stroke="currentColor" opacity=".25"/><g class="ew-orbit"><path d="M20 3a17 17 0 0 1 17 17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="m20 20 13-8a15 15 0 0 0-13-7Z" fill="currentColor" opacity=".08"/></g><circle class="ew-dot" cx="20" cy="20" r="2.5" fill="currentColor"/><circle cx="20" cy="20" r="5.5" stroke="currentColor" opacity=".2"/></svg></span><div class="ew-copy"><div class="ew-top"><strong>SIGNAL WATCH</strong><small>STANDBY</small></div><p>Waiting for signal conditions</p></div><span class="ew-track" aria-hidden="true"></span></div>';
function render(){queued=false;for(const root of document.querySelectorAll('.featured-card[data-featured]')){
 const host=root.querySelector('[data-featured-signal]');if(!host)continue;
 let radar=root.querySelector(':scope > .b46-signal-watch');if(!radar){radar=document.createElement('div');radar.className='b46-signal-watch';radar.setAttribute('aria-label','Signal Watch: waiting for signal conditions');radar.innerHTML=markup;host.after(radar)}
 const count=Number(host.dataset.v11Count),known=host.hasAttribute('data-v11-count'),realContent=!!host.querySelector('[data-b46-feature-signal-key],.feature-signal-main'),selected=(root.querySelector('[data-featured-home]')?.textContent||'').trim();
 const hide=!known||!selected||selected==='—'||count>0||realContent||host.classList.contains('locked');
 if(radar.hidden!==hide)radar.hidden=hide;
 }}
function schedule(){if(!queued){queued=true;requestAnimationFrame(render)}}
new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.b46-signal-watch')))schedule()}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-v11-count','data-b46-stable-signal-state','class','data-pv8-fixture']});schedule();
})();
