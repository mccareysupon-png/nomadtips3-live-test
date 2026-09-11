(()=>{'use strict';
const target=new URLSearchParams(location.search).get('fixture');
if(!target)return;
let done=false,timer=null;
function focus(){if(done)return;const card=[...document.querySelectorAll('[data-match-toggle][data-match-id]')].find(el=>String(el.dataset.matchId||'')===String(target));if(!card)return;done=true;if(card.getAttribute('aria-expanded')!=='true')card.click();timer=setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),90)}
const board=document.querySelector('[data-signal-body]');if(board)new MutationObserver(focus).observe(board,{childList:true,subtree:true});focus();setTimeout(focus,500);setTimeout(focus,1500);window.addEventListener('pagehide',()=>{if(timer)clearTimeout(timer)},{once:true});
})();