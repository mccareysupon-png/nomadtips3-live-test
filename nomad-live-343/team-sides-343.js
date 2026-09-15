(()=>{
'use strict';
const VERSION='343-team-sides-v2';
const HOME_CLASS='team-home-name';
const AWAY_CLASS='team-away-name';
const SEP_CLASS='team-separator';

function span(text,cls){
  const el=document.createElement('span');
  el.className=cls;
  el.textContent=String(text??'');
  return el;
}
function setPair(el,home,away,separator=' - '){
  if(!el||el.dataset.teamSides==='1')return;
  el.replaceChildren(span(home,HOME_CLASS),span(separator,SEP_CLASS),span(away,AWAY_CLASS));
  el.dataset.teamSides='1';
}
function parsePair(el,separator=' - '){
  if(!el)return null;
  const text=String(el.textContent||'').trim();
  const at=text.indexOf(separator);
  if(at<1)return null;
  const home=text.slice(0,at).trim(),away=text.slice(at+separator.length).trim();
  return home&&away?{home,away}:null;
}
function colorValue(el,home,away){
  if(!el||el.dataset.teamSideValue==='1'||!home||!away)return;
  const raw=String(el.textContent||''),text=raw.trim();
  let side='',name='';
  if(text===home||text.startsWith(`${home} `)){side=HOME_CLASS;name=home}
  else if(text===away||text.startsWith(`${away} `)){side=AWAY_CLASS;name=away}
  else return;
  const start=raw.indexOf(name),before=start>0?raw.slice(0,start):'',after=raw.slice(start+name.length);
  const nodes=[];
  if(before)nodes.push(document.createTextNode(before));
  nodes.push(span(name,side));
  if(after)nodes.push(document.createTextNode(after));
  el.replaceChildren(...nodes);
  el.dataset.teamSideValue='1';
}
function colorStatCaption(el,home,away){
  if(!el||el.dataset.teamSides==='1')return;
  const text=String(el.textContent||'').trim();
  const marker=' ← MATCH STATISTICS → ';
  if(text!==`${home}${marker}${away}`)return;
  setPair(el,home,away,marker);
}
function processFullMarket(board){
  const homeEl=board.querySelector('.fom-team-strip .home strong');
  const awayEl=board.querySelector('.fom-team-strip .away strong');
  const home=String(homeEl?.textContent||'').trim(),away=String(awayEl?.textContent||'').trim();
  if(!home||!away)return;
  homeEl.classList.add(HOME_CLASS);
  awayEl.classList.add(AWAY_CLASS);
  const head=board.querySelector('.fom-head small');
  if(!head||head.dataset.teamSides==='1')return;
  const raw=String(head.textContent||''),prefix=`${home} vs ${away}`;
  if(!raw.trim().startsWith(prefix))return;
  const start=raw.indexOf(home),suffix=raw.slice(start+prefix.length),nodes=[];
  if(start>0)nodes.push(document.createTextNode(raw.slice(0,start)));
  nodes.push(span(home,HOME_CLASS),span(' vs ',SEP_CLASS),span(away,AWAY_CLASS));
  if(suffix)nodes.push(document.createTextNode(suffix));
  head.replaceChildren(...nodes);
  head.dataset.teamSides='1';
}
function processLiveCard(card){
  card.querySelector('.home-slot .team-name')?.classList.add(HOME_CLASS);
  card.querySelector('.away-slot .team-name')?.classList.add(AWAY_CLASS);
  card.querySelectorAll('.fom-board').forEach(processFullMarket);
}
function processSignalCard(card){
  const title=card.querySelector('.active-signal-title h3');
  let home=card.dataset.teamHome||'',away=card.dataset.teamAway||'';
  if(!home||!away){
    const pair=parsePair(title);
    if(pair){home=pair.home;away=pair.away;card.dataset.teamHome=home;card.dataset.teamAway=away}
  }
  if(!home||!away)return;
  setPair(title,home,away);
  card.querySelectorAll('.signal-live-section>header h3').forEach(el=>setPair(el,home,away));
  card.querySelectorAll('.signal-evidence-card>header small').forEach(el=>colorStatCaption(el,home,away));
  card.querySelectorAll('.signal-market-chip strong,.signal-entry-block>header small,.signal-entry-grid>div:nth-child(3) strong').forEach(el=>colorValue(el,home,away));
}
function processStatisticsRow(row){
  const match=row.querySelector('td:nth-child(2) .match-name');
  let home=row.dataset.teamHome||'',away=row.dataset.teamAway||'';
  if(!home||!away){
    const pair=parsePair(match);
    if(pair){home=pair.home;away=pair.away;row.dataset.teamHome=home;row.dataset.teamAway=away}
  }
  if(!home||!away)return;
  setPair(match,home,away);
  colorValue(row.querySelector('td:nth-child(5)'),home,away);
}
function process(root=document){
  if(root.matches?.('.match-card'))processLiveCard(root);
  if(root.matches?.('.active-signal-card'))processSignalCard(root);
  if(root.matches?.('[data-stat-body] tr'))processStatisticsRow(root);
  if(root.matches?.('.fom-board'))processFullMarket(root);
  root.querySelectorAll?.('.match-card').forEach(processLiveCard);
  root.querySelectorAll?.('.active-signal-card').forEach(processSignalCard);
  root.querySelectorAll?.('[data-stat-body] tr').forEach(processStatisticsRow);
  root.querySelectorAll?.('.fom-board').forEach(processFullMarket);
}
function boot(){
  process(document);
  const roots=[document.querySelector('.score-board'),document.querySelector('[data-signal-body]'),document.querySelector('[data-stat-body]')].filter(Boolean);
  if(!roots.length)return;
  let queued=false;
  const run=()=>{queued=false;for(const root of roots)process(root)};
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(run);
  });
  roots.forEach(root=>observer.observe(root,{childList:true,subtree:true}));
  window.NOMAD_TEAM_SIDES_343={version:VERSION,refresh:()=>process(document)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
