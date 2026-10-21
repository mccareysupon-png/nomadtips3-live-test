/* BALL46 Expanded Match Mobile V4 — only when an existing row is opened.
   Never alters match-row, Event Flow, or Full Market. */
(()=>{
 'use strict';
 if(window.__b46ExpandedOnlyV4)return;
 window.__b46ExpandedOnlyV4=1;
 const q=(s,r=document)=>r?.querySelector(s)||null;
 const txt=(s,r)=>q(s,r)?.textContent?.trim()||'';
 const norm=s=>String(s||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,'');
 const missing='—';
 const template=[
  '<div class="b46x-title"><span>MATCH DETAILS · LIVE</span><span class="b46x-live" data-b46x-live>LIVE</span></div>',
  '<div class="b46x-league" data-b46x-league>—</div>',
  '<div class="b46x-score">',
  '<div class="b46x-side"><small>HOME</small><strong data-b46x-home>—</strong></div>',
  '<strong class="b46x-score-number" data-b46x-score>—</strong>',
  '<div class="b46x-side"><small>AWAY</small><strong data-b46x-away>—</strong></div></div>',
  '<div class="b46x-section-head"><b>MATCH FACTS</b><span>Home · Away</span></div>',
  '<div class="b46x-facts">',
  '<div class="b46x-fact"><small>HALF-TIME</small><strong data-b46x-fact="0">—</strong></div>',
  '<div class="b46x-fact"><small>CORNERS</small><strong data-b46x-fact="1">—</strong></div>',
  '<div class="b46x-fact"><small>CARDS · H / A</small><strong data-b46x-fact="2">—</strong></div>',
  '<div class="b46x-fact"><small>ODDS AGE</small><strong data-b46x-fact="3">—</strong></div></div>',
  '<div class="b46x-section-head"><b>ACTIVE SIGNALS</b><span>Live feed</span></div>',
  '<div class="b46x-live-group" data-b46x-signals><div class="b46x-empty">No active signals available.</div></div>',
  '<div class="b46x-section-head"><b>MATCH COMPARISON</b><span>Home · Away</span></div>',
  '<div class="b46x-comparison" data-b46x-comparison><div class="b46x-empty">Waiting for match statistics.</div></div>',
  '<div class="b46x-section-head"><b>RECENT EVENTS</b><span>Latest feed</span></div>',
  '<div class="b46x-events" data-b46x-events><div class="b46x-empty">No event data available.</div></div>'
 ].join('');
 function create(inner) {
  const panel=document.createElement('section');
  panel.className='b46x-live-detail';
  panel.setAttribute('aria-label','Expanded live match details');
  panel.innerHTML=template;
  inner.appendChild(panel); // Event Flow and Full Market stay first and unchanged.
  return panel;
 }
 function show(panel,key,value) {
  const el=panel.querySelector('[data-b46x-'+key+']');
  if(!el)return;
  const v=String(value||missing);
  if(el.textContent!==v)el.textContent=v;
 }
 function mirror(panel,selector,original,hasFeed,fallback) {
  const dst=q('[data-b46x-'+selector+']',panel);
  if(!dst)return;
  const markup=hasFeed&&original?original.innerHTML:'';
  const stamp='b46Mirror'+selector;
  if(dst.dataset[stamp]===markup)return;
  dst.dataset[stamp]=markup;
  if(hasFeed&&original&&original.children.length) {
   const cloned=original.cloneNode(true);
   cloned.removeAttribute('id');
   dst.replaceChildren(cloned);
  }else{
   const p=document.createElement('div');
   p.className='b46x-empty';p.textContent=fallback;
   dst.replaceChildren(p);
  }
 }
 function pick(row) {
  const home=txt('.teams-cell > b:nth-of-type(1)',row);
  const away=txt('.teams-cell > b:nth-of-type(2)',row);
  const scoreNodes=[...row.querySelectorAll('.desktop-team-score')];
  const score=scoreNodes.length>=2?scoreNodes[0].textContent.trim()+'–'+scoreNodes[1].textContent.trim():missing;
  const ht=(row.innerText||'').match(/\bHT\s*(\d+\s*[-–]\s*\d+)/i);
  const league=txt('.league-head strong',row.closest('.league-block'));
  const clock=(row.innerText||'').match(/\bLIVE\s*[·:]?\s*(HT|\d+['′’]?)/i);
  return {home,away,score,ht:ht?'HT '+ht[1]:missing,league,clock:clock?clock[1]:'LIVE'};
 }
 function update(expanded) {
  const inner=q('.match-expanded-inner',expanded);
  const row=expanded.previousElementSibling;
  if(!inner||!row?.matches('article.match-row[data-match-id]')||
    expanded.getAttribute('data-expanded-match')!==row.getAttribute('data-match-id')||
    row.getAttribute('aria-expanded')!=='true')return;
  const match=pick(row);
  if(!match.home||!match.away)return;
  const panel=q(':scope > .b46x-live-detail',inner)||create(inner);
  const source=q('.featured-card[data-featured]');
  const same=!!source&&norm(txt('[data-featured-home]',source))===norm(match.home)&&
    norm(txt('[data-featured-away]',source))===norm(match.away);
  const facts=same?[...source.querySelectorAll('.feature-facts > div')]:[];
  const fact=i=>facts[i]?.querySelector('b')?.textContent?.trim()||missing;
  show(panel,'home',match.home);show(panel,'away',match.away);
  show(panel,'score',match.score===missing&&same?txt('[data-featured-score]',source):match.score);
  show(panel,'league',match.league||(same?txt('[data-featured-league]',source):missing));
  show(panel,'live',match.clock);
  const values=[fact(0)!==missing?fact(0):match.ht,fact(1),fact(2),fact(3)];
  const nodes=[...panel.querySelectorAll('[data-b46x-fact]')];
  nodes.forEach((el,i)=>{const v=values[i]||missing;if(el.textContent!==v)el.textContent=v;});
  const signals=same?q('.feature-signal',source):null;
  mirror(panel,'signals',signals,!!signals?.textContent?.trim(),'No active signals available.');
  const stats=same?q('.feature-stats',source):null;
  mirror(panel,'comparison',stats,!!(stats?.children.length&&!q('.feature-empty',stats)),'Waiting for match statistics.');
  const events=same?q('.feature-events',source):null;
  mirror(panel,'events',events,!!events?.children.length,'No event data available.');
 }
 function tick(){
  if(window.innerWidth>767)return;
  try{document.querySelectorAll('section.match-expanded[data-expanded-match]').forEach(update);}
  catch(err){console.warn('B46_EXPANDED_DETAILS_UPDATE_SKIPPED',String(err).slice(0,120));}
 }
 const start=()=>{tick();setInterval(tick,1400);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();