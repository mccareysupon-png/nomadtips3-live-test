(()=>{
'use strict';
const VERSION='343-team-sides-v3-singlepage';
const HOME_CLASS='team-home-name';
const AWAY_CLASS='team-away-name';
const SEP_CLASS='team-separator';
const PAIR_SEPARATORS=[' — ',' – ',' - ',' vs ',' VS '];

function span(text,cls){const el=document.createElement('span');el.className=cls;el.textContent=String(text??'');return el}
function pairFromText(text){
  const raw=String(text||'').trim();
  for(const separator of PAIR_SEPARATORS){
    const at=raw.indexOf(separator);
    if(at<1)continue;
    const home=raw.slice(0,at).trim(),away=raw.slice(at+separator.length).trim();
    if(home&&away)return{home,away,separator};
  }
  return null;
}
function pairFromElement(el){return el?pairFromText(el.textContent):null}
function setPair(el,home,away,separator=' — '){
  if(!el||el.dataset.teamSides==='1'||!home||!away)return;
  el.replaceChildren(span(home,HOME_CLASS),span(separator,SEP_CLASS),span(away,AWAY_CLASS));
  el.dataset.teamSides='1';
}
function splitPair(el){const p=pairFromElement(el);if(p)setPair(el,p.home,p.away,p.separator);return p}
function colorValue(el,home,away){
  if(!el||el.dataset.teamSideValue==='1'||!home||!away)return;
  const raw=String(el.textContent||''),text=raw.trim();
  let side='',name='';
  if(text===home||text.startsWith(`${home} `)){side=HOME_CLASS;name=home}
  else if(text===away||text.startsWith(`${away} `)){side=AWAY_CLASS;name=away}
  else return;
  const start=raw.indexOf(name),before=start>0?raw.slice(0,start):'',after=raw.slice(start+name.length),nodes=[];
  if(before)nodes.push(document.createTextNode(before));
  nodes.push(span(name,side));
  if(after)nodes.push(document.createTextNode(after));
  el.replaceChildren(...nodes);el.dataset.teamSideValue='1';
}
function splitLeadingPairKeepTail(el){
  if(!el||el.dataset.teamSides==='1')return null;
  const textNode=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&String(n.textContent||'').trim());
  if(!textNode)return null;
  const p=pairFromText(textNode.textContent);if(!p)return null;
  const marker=document.createDocumentFragment();
  marker.append(span(p.home,HOME_CLASS),span(p.separator,SEP_CLASS),span(p.away,AWAY_CLASS));
  el.insertBefore(marker,textNode);textNode.remove();el.dataset.teamSides='1';return p;
}

/* Page 1 live board. */
function processLiveRow(row){
  const names=row.querySelectorAll('.teams-cell>b');
  names[0]?.classList.add(HOME_CLASS);names[1]?.classList.add(AWAY_CLASS);
}
function processFeatured(root){
  root.querySelector?.('[data-featured-home]')?.classList.add(HOME_CLASS);
  root.querySelector?.('[data-featured-away]')?.classList.add(AWAY_CLASS);
}
function processLegacyLiveCard(card){
  card.querySelector('.home-slot .team-name')?.classList.add(HOME_CLASS);
  card.querySelector('.away-slot .team-name')?.classList.add(AWAY_CLASS);
  card.querySelectorAll('.fom-board').forEach(processFullMarket);
}

/* Page 2 Signal. */
function processNextSignalCard(card){
  const title=card.querySelector('.next-teams');
  const p=splitPair(title);if(!p)return;
  card.dataset.teamHome=p.home;card.dataset.teamAway=p.away;
  card.querySelectorAll('.next-pick').forEach(el=>colorValue(el,p.home,p.away));
}
function processLegacySignalCard(card){
  const title=card.querySelector('.active-signal-title h3');let p=pairFromElement(title);
  if(!p){const home=card.dataset.teamHome||'',away=card.dataset.teamAway||'';if(home&&away)p={home,away,separator:' - '}}
  if(!p)return;
  setPair(title,p.home,p.away,p.separator);
  card.querySelectorAll('.signal-live-section>header h3').forEach(el=>{const q=pairFromElement(el);if(q)setPair(el,q.home,q.away,q.separator)});
  card.querySelectorAll('.signal-market-chip strong,.signal-entry-block>header small,.signal-entry-grid>div:nth-child(3) strong').forEach(el=>colorValue(el,p.home,p.away));
}

/* Page 3 Statistics: current single-page table + standalone preview table. */
function processSpStatRow(row){
  const match=row.querySelector('.sp-match strong');const p=splitPair(match);if(!p)return;
  row.dataset.teamHome=p.home;row.dataset.teamAway=p.away;colorValue(row.querySelector('td:nth-child(4)'),p.home,p.away);
}
function processNextStatRow(row){
  const match=row.querySelector('td:nth-child(2) .match-primary');const p=splitPair(match);if(!p)return;
  row.dataset.teamHome=p.home;row.dataset.teamAway=p.away;colorValue(row.querySelector('td:nth-child(5)'),p.home,p.away);
}
function processLegacyStatisticsRow(row){
  const match=row.querySelector('td:nth-child(2) .match-name');const p=splitPair(match);if(!p)return;
  row.dataset.teamHome=p.home;row.dataset.teamAway=p.away;colorValue(row.querySelector('td:nth-child(5)'),p.home,p.away);
}
function processNextLiveRow(row){
  const teams=row.querySelector('.teams');const p=splitLeadingPairKeepTail(teams);if(!p)return;
  row.dataset.teamHome=p.home;row.dataset.teamAway=p.away;
}

function processFullMarket(board){
  const homeEl=board.querySelector('.fom-team-strip .home strong'),awayEl=board.querySelector('.fom-team-strip .away strong');
  const home=String(homeEl?.textContent||'').trim(),away=String(awayEl?.textContent||'').trim();if(!home||!away)return;
  homeEl.classList.add(HOME_CLASS);awayEl.classList.add(AWAY_CLASS);
  const head=board.querySelector('.fom-head small');if(!head||head.dataset.teamSides==='1')return;
  const raw=String(head.textContent||''),prefix=`${home} vs ${away}`;if(!raw.trim().startsWith(prefix))return;
  const start=raw.indexOf(home),suffix=raw.slice(start+prefix.length),nodes=[];
  if(start>0)nodes.push(document.createTextNode(raw.slice(0,start)));
  nodes.push(span(home,HOME_CLASS),span(' vs ',SEP_CLASS),span(away,AWAY_CLASS));if(suffix)nodes.push(document.createTextNode(suffix));
  head.replaceChildren(...nodes);head.dataset.teamSides='1';
}

function process(root=document){
  if(root.matches?.('.match-row'))processLiveRow(root);
  if(root.matches?.('.match-card'))processLegacyLiveCard(root);
  if(root.matches?.('.next-signal-card'))processNextSignalCard(root);
  if(root.matches?.('.active-signal-card'))processLegacySignalCard(root);
  if(root.matches?.('[data-sp-table-body] tr'))processSpStatRow(root);
  if(root.matches?.('[data-next-stat-body] tr'))processNextStatRow(root);
  if(root.matches?.('[data-stat-body] tr'))processLegacyStatisticsRow(root);
  if(root.matches?.('.next-live-row'))processNextLiveRow(root);
  if(root.matches?.('.fom-board'))processFullMarket(root);
  root.querySelectorAll?.('.match-row').forEach(processLiveRow);
  root.querySelectorAll?.('.match-card').forEach(processLegacyLiveCard);
  root.querySelectorAll?.('.next-signal-card').forEach(processNextSignalCard);
  root.querySelectorAll?.('.active-signal-card').forEach(processLegacySignalCard);
  root.querySelectorAll?.('[data-sp-table-body] tr').forEach(processSpStatRow);
  root.querySelectorAll?.('[data-next-stat-body] tr').forEach(processNextStatRow);
  root.querySelectorAll?.('[data-stat-body] tr').forEach(processLegacyStatisticsRow);
  root.querySelectorAll?.('.next-live-row').forEach(processNextLiveRow);
  root.querySelectorAll?.('.fom-board').forEach(processFullMarket);
  processFeatured(root);
}
function boot(){
  process(document);
  const roots=[
    document.querySelector('[data-board-sections]'),
    document.querySelector('[data-featured]'),
    document.querySelector('[data-next-signal-list]'),
    document.querySelector('[data-sp-table-body]'),
    document.querySelector('[data-next-stat-body]'),
    document.querySelector('[data-next-live-tracker]'),
    document.querySelector('.score-board'),
    document.querySelector('[data-signal-body]'),
    document.querySelector('[data-stat-body]')
  ].filter(Boolean);
  let queued=false;
  const run=()=>{queued=false;for(const root of roots)process(root)};
  const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(run)});
  roots.forEach(root=>observer.observe(root,{childList:true,subtree:true,characterData:true}));
  window.NOMAD_TEAM_SIDES_343={version:VERSION,refresh:()=>process(document)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
