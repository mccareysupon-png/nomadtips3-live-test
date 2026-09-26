(()=>{
'use strict';
const VERSION='343-color-semantics-20260922a';
const HOME='b46-home',AWAY='b46-away',NEUTRAL='b46-neutral',LIVE='b46-live-time',CLOCK='b46-live-clock',SEP='b46-sep';
const SIDE_CLASSES=[HOME,AWAY,NEUTRAL];
const SCORE_RE=/(\d+)\s*([–—:\-])\s*(\d+)/;

function sideClass(side){return side==='home'?HOME:side==='away'?AWAY:NEUTRAL}
function mark(el,side){
  if(!el)return;
  el.classList.remove(...SIDE_CLASSES);
  el.classList.add(sideClass(side));
}
function markLive(el,on=true){
  if(!el)return;
  el.classList.toggle(LIVE,Boolean(on));
  el.classList.toggle(CLOCK,Boolean(on));
}
function text(el){return String(el?.textContent||'').trim()}
function makeSpan(value,cls){const s=document.createElement('span');s.className=cls;s.textContent=value;return s}
function pairFromText(raw){
  const value=String(raw||'').trim();
  let m=value.match(/^(.+?)\s+—\s+(.+)$/);
  if(!m)m=value.match(/^(.+?)\s+-\s+(.+)$/);
  if(!m)return null;
  const home=m[1].trim(),away=m[2].trim();
  return home&&away?{home,away}:null;
}
function paintTeamPair(el){
  if(!el)return null;
  const raw=text(el),p=pairFromText(raw);
  if(!p)return null;
  const sig=`${p.home}|${p.away}`;
  if(el.dataset.b46Pair===sig)return p;
  el.replaceChildren(makeSpan(p.home,HOME),makeSpan(' — ',SEP),makeSpan(p.away,AWAY));
  el.dataset.b46Pair=sig;
  return p;
}
function paintScore(el){
  if(!el)return;
  const raw=text(el),m=raw.match(SCORE_RE);
  if(!m)return;
  const sig=`${m[1]}|${m[3]}`;
  if(el.dataset.b46Score===sig)return;
  const before=raw.slice(0,m.index),after=raw.slice((m.index||0)+m[0].length),nodes=[];
  if(before)nodes.push(document.createTextNode(before));
  nodes.push(makeSpan(m[1],HOME),makeSpan(` ${m[2]} `,SEP),makeSpan(m[3],AWAY));
  if(after)nodes.push(document.createTextNode(after));
  el.replaceChildren(...nodes);
  el.dataset.b46Score=sig;
}
function liveClockText(value){
  const v=String(value||'').trim().toUpperCase();
  return v==='LIVE'||v==='HT'||/^\d{1,3}(?:\+\d{1,2})?[\'’]$/.test(v);
}
function inferSide(value,home='',away=''){
  const raw=String(value||'').trim(),upper=raw.toUpperCase();
  if(/\bHOME\b/.test(upper))return'home';
  if(/\bAWAY\b/.test(upper))return'away';
  if(home&&(raw===home||upper===home.toUpperCase()))return'home';
  if(away&&(raw===away||upper===away.toUpperCase()))return'away';
  if(/\bDRAW\b/.test(upper)||upper==='X')return'neutral';
  return'';
}
function paintInlineSignal(main,sub,home='',away=''){
  if(!main)return;
  const raw=text(main),side=inferSide(raw,home,away);
  if(!side||side==='neutral'){mark(main,'neutral');if(sub)mark(sub,'neutral');return}
  const upper=raw.toUpperCase(),needle=side==='home'?'HOME':'AWAY',idx=upper.indexOf(needle);
  if(idx>=0){
    const sig=`${side}|${raw}`;
    if(main.dataset.b46Signal!==sig){
      const nodes=[];
      if(idx)nodes.push(document.createTextNode(raw.slice(0,idx)));
      nodes.push(makeSpan(raw.slice(idx),sideClass(side)));
      main.replaceChildren(...nodes);
      main.dataset.b46Signal=sig;
    }
  }else mark(main,side);
  if(sub)mark(sub,side);
}
function paintSignalBlock(root,home='',away=''){
  if(!root)return;
  const pick=root.querySelector('.feature-signal-main b');
  const side=inferSide(text(pick),home,away);
  if(pick&&side)mark(pick,side);
  if(side==='home'||side==='away'){
    root.querySelectorAll('.feature-signal-meta span').forEach(el=>{
      const t=text(el);
      if(/^(LINE|ODDS)\b/i.test(t))mark(el,side);
      if(/\b(?:ENTRY|LIVE)\b/i.test(t)&&SCORE_RE.test(t))paintScore(el);
    });
  }else if(side==='neutral'&&pick)mark(pick,'neutral');
  paintInlineSignal(root.querySelector('.pred-main'),root.querySelector('.pred-sub'),home,away);
}
function processMatchRow(row){
  const teams=row.querySelectorAll('.teams-cell>b');
  mark(teams[0],'home');mark(teams[1],'away');
  const scores=row.querySelectorAll('.score-cell>strong');
  mark(scores[0],'home');mark(scores[1],'away');
  const status=row.querySelector('.score-cell>small:not(.half-score)');
  const live=row.closest('[data-status-section="live"]')!==null||liveClockText(text(status));
  markLive(status,live);
  const home=text(teams[0]),away=text(teams[1]);
  paintInlineSignal(row.querySelector('.signal-cell .pred-main'),row.querySelector('.signal-cell .pred-sub'),home,away);
}
function processFeatured(){
  const homeEl=document.querySelector('[data-featured-home]'),awayEl=document.querySelector('[data-featured-away]');
  mark(homeEl,'home');mark(awayEl,'away');
  paintScore(document.querySelector('[data-featured-score]'));
  const status=document.querySelector('[data-featured-status]');
  markLive(status,liveClockText(text(status)));
  const home=text(homeEl),away=text(awayEl);
  document.querySelectorAll('[data-featured-signal],[data-prediction-content]').forEach(el=>paintSignalBlock(el,home,away));
  document.querySelectorAll('[data-featured-stats] .stat-row').forEach(r=>{
    const vals=r.querySelectorAll('b');mark(vals[0],'home');mark(vals[vals.length-1],'away');
  });
}
function processWorkspaceStatsRow(row){
  const cells=row.children;if(!cells||cells.length<9)return;
  const pair=paintTeamPair(row.querySelector('.sp-match strong'));
  const home=pair?.home||'',away=pair?.away||'';
  const side=inferSide(text(cells[3]),home,away);
  mark(cells[3],side||'neutral');
  if(side==='home'||side==='away'){mark(cells[4],side);mark(cells[5],side)}else{mark(cells[4],'neutral');mark(cells[5],'neutral')}
  paintScore(cells[6]);paintScore(cells[7]);
}
function processLegacyStatsRow(row){
  const cells=row.children;if(!cells||cells.length<10)return;
  const match=row.querySelector('td:nth-child(2) .match-name'),pair=paintTeamPair(match);
  const home=pair?.home||'',away=pair?.away||'',side=inferSide(text(cells[4]),home,away);
  mark(cells[4],side||'neutral');
  if(side==='home'||side==='away'){mark(cells[5],side);mark(cells[6],side)}else{mark(cells[5],'neutral');mark(cells[6],'neutral')}
  paintScore(cells[8]);paintScore(cells[9]);
}
function processLegacySignalCard(card){
  const title=card.querySelector('.active-signal-title h3')||card.querySelector('.signal-live-section>header h3');
  const pair=paintTeamPair(title),home=pair?.home||card.dataset.teamHome||'',away=pair?.away||card.dataset.teamAway||'';
  if(pair){card.dataset.teamHome=home;card.dataset.teamAway=away}
  card.querySelectorAll('.signal-live-section>header h3').forEach(paintTeamPair);
  card.querySelectorAll('.signal-market-chip strong,.signal-entry-block>header small,.signal-entry-grid>div:nth-child(3) strong').forEach(el=>{
    const side=inferSide(text(el),home,away);if(side)mark(el,side);
  });
}
function processLegacyLiveCard(card){
  mark(card.querySelector('.home-slot .team-name'),'home');
  mark(card.querySelector('.away-slot .team-name'),'away');
}
function processFullMarket(){
  document.querySelectorAll('.fom-team-strip .home strong').forEach(el=>mark(el,'home'));
  document.querySelectorAll('.fom-team-strip .away strong').forEach(el=>mark(el,'away'));
}
function process(root=document){
  if(root.matches?.('.match-row'))processMatchRow(root);
  if(root.matches?.('.sp-table tbody tr'))processWorkspaceStatsRow(root);
  if(root.matches?.('[data-stat-body] tr'))processLegacyStatsRow(root);
  if(root.matches?.('.active-signal-card'))processLegacySignalCard(root);
  if(root.matches?.('.match-card'))processLegacyLiveCard(root);
  root.querySelectorAll?.('.match-row').forEach(processMatchRow);
  root.querySelectorAll?.('.sp-table tbody tr').forEach(processWorkspaceStatsRow);
  root.querySelectorAll?.('[data-stat-body] tr').forEach(processLegacyStatsRow);
  root.querySelectorAll?.('.active-signal-card').forEach(processLegacySignalCard);
  root.querySelectorAll?.('.match-card').forEach(processLegacyLiveCard);
  processFeatured();processFullMarket();
}
function boot(){
  process(document);
  let queued=false;
  const run=()=>{queued=false;process(document)};
  const observer=new MutationObserver(()=>{
    if(queued)return;queued=true;
    if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
  });
  observer.observe(document.body,{childList:true,subtree:true,characterData:true});
  window.BALL46_COLOR_SEMANTICS={version:VERSION,refresh:()=>process(document)};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
