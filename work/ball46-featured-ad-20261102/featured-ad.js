/* BALL46 FEATURED AD 20261102 — isolated, non-API DOM decoration only */
(()=>{
 'use strict';
 const marker='b46-featured-affiliate-20261102';
 const destination='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';
 const path='/b46-featured-1xbet-20261102.webp';
 const selector='.featured-card[data-featured]';
 const labels=['SPORTS BETTING','CASINO GAMES','VARIETY OF GAMES','PLAY NOW'];
 let queued=false;
 function makeAd(){
  const wrapper=document.createElement('div');wrapper.className=marker;
  const a=document.createElement('a');a.className='b46-featured-affiliate-image';a.href=destination;a.target='_blank';a.rel='sponsored noopener noreferrer';a.setAttribute('aria-label','1XBET advertisement — opens in a new tab');
  const img=document.createElement('img');img.src=path;img.alt='1XBET football promotional image';img.width=1024;img.height=1536;img.loading='lazy';img.decoding='async';
  a.append(img);wrapper.append(a);
  const strip=document.createElement('div');strip.className='b46-featured-affiliate-strip';strip.setAttribute('aria-label','Sports betting, casino games, variety of games');
  const track=document.createElement('div');track.className='b46-featured-affiliate-track';track.setAttribute('aria-hidden','true');
  for(let i=0;i<2;i++)for(const label of labels){const item=document.createElement('span');item.textContent=label;track.append(item)}
  strip.append(track);wrapper.append(strip);return wrapper;
 }
 function mount(){
  queued=false;
  for(const card of document.querySelectorAll(selector)){
   if(card.querySelector('.'+marker))continue;
   const header=card.querySelector(':scope > .card-title');
   if(!header)continue;
   header.insertAdjacentElement('afterend',makeAd());
  }
 }
 function schedule(){if(queued)return;queued=true;requestAnimationFrame(mount)}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
 const watcher=new MutationObserver(schedule);
 watcher.observe(document.documentElement,{childList:true,subtree:true});
})();