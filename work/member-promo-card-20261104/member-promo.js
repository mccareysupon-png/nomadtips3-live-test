/* Presentation only: reads existing theme preference; no writes or data requests. */
(()=>{
'use strict';
const LINK='https://member.ball46.com/pricing',IMAGE='/member-football.png';
const THEME_KEY='nomad343_dashboard_theme_v1';
function selectedTheme(){
 try{return localStorage.getItem(THEME_KEY)==='dark'?'dark':'light';}
 catch{return document.documentElement.dataset.theme==='dark'?'dark':'light';}
}
function create(){
 const card=document.createElement('a');card.className='b46mp-card';card.href=LINK;card.target='_blank';card.rel='noopener noreferrer';
 card.dataset.b46mpTheme=selectedTheme();
 card.setAttribute('aria-label','Explore BALL46 membership (opens in a new tab)');
 card.innerHTML='<img class="b46mp-photo" src="'+IMAGE+'" alt="" width="1774" height="887" loading="lazy" decoding="async">'+
 '<div class="b46mp-content"><p class="b46mp-kicker">BALL46 MEMBER</p>'+
 '<h2 class="b46mp-title" aria-label="Matchday. Upgraded."><span>MATCHDAY.</span><span class="b46mp-accent" aria-hidden="true">'+
 [...'UPGRADED.'].map((letter,i)=>'<span class="b46mp-letter" style="--b46mp-i:'+i+'">'+letter+'</span>').join('')+'</span></h2>'+
 '<p class="b46mp-note">Go beyond the score.</p>'+
 '<span class="b46mp-cta">Explore membership<svg aria-hidden="true" viewBox="0 0 20 20"><path d="M5 15 15 5M5 5h10v10"/></svg></span></div>';
 return card;
}
function place(featured){
 if(!featured?.parentElement)return;
 if(featured.previousElementSibling?.classList.contains('b46mp-card'))return;
 featured.before(create());
}
let queued=false;
function mount(){queued=false;
 const desktop=document.querySelector('.workspace.singlepage .right-rail > .featured-card[data-featured]');
 if(desktop)place(desktop);
 const dialog=document.querySelector('#b46gn-detail');
 const mobile=dialog?.querySelector('#b46-suite-summary .featured-card[data-featured]')||
  [...(dialog?.querySelectorAll('.b46gn-featured > .featured-card[data-featured]')||[])].find(f=>!f.closest('#b46-suite-stats'));
 // The existing mobile adapter clones Featured Match for Summary and Stats.
 // Keep this promotion once, immediately before the Summary copy only.
 for(const card of dialog?.querySelectorAll('.b46mp-card')||[])if(card.nextElementSibling!==mobile)card.remove();
 if(mobile)place(mobile);
 const theme=selectedTheme();
 for(const card of document.querySelectorAll('.b46mp-card'))if(card.dataset.b46mpTheme!==theme)card.dataset.b46mpTheme=theme;
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(mount)}
function boot(){mount();const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});window.addEventListener('storage',e=>{if(e.key===THEME_KEY)schedule()});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


