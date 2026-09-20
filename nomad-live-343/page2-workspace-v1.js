(()=>{
'use strict';
const REVISION='343-page2-workspace-v1-20260920';
const ROOT_CLASS='b46-signal-page-v2';
const WORKSPACE_ATTR='data-b46-page2-workspace';
let selectedId='';
let marketFilter='all';
let leagueFilter='all';
let observer=null;
let reconcileFrame=0;

const qs=(s,r=document)=>r.querySelector(s);
const qsa=(s,r=document)=>[...r.querySelectorAll(s)];
const text=(s,r=document)=>(qs(s,r)?.textContent||'').trim();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function isSignalPage(){
  return Boolean(qs('[data-next-signal-list]')&&qs('.next-panel')&&qs('.next-market-strip'));
}
function cardId(card){return String(card?.getAttribute('data-next-card')||'')}
function cardLeague(card){
  const spans=qsa('.next-league span',card);
  return (spans.at(-1)?.textContent||'Live match').trim()||'Live match';
}
function cardMarket(card){return text('.next-market-name',card).toUpperCase()}
function marketBucket(label){
  const s=String(label||'').toUpperCase();
  if(/ASIAN|HANDICAP|(^|\W)AH(\W|$)/.test(s))return'ah';
  if(/OVER|UNDER|O\s*\/\s*U|TOTAL/.test(s))return'ou';
  if(/1X2|MONEYLINE|MATCH WINNER|THREE WAY|3-WAY/.test(s))return'1x2';
  return'other';
}

function buildWorkspace(){
  if(!isSignalPage())return false;
  if(qs(`[${WORKSPACE_ATTR}]`))return true;
  const shell=qs('main.next-shell');
  const market=qs('.next-market-strip',shell);
  const panel=qs('.next-panel',shell);
  const note=qs('.next-note',shell);
  if(!shell||!market||!panel)return false;

  document.body.classList.add(ROOT_CLASS);
  document.body.dataset.b46Page2Revision=REVISION;

  const workspace=document.createElement('section');
  workspace.className='b46-page2-workspace';
  workspace.setAttribute(WORKSPACE_ATTR,'');
  workspace.innerHTML=`
    <aside class="b46-page2-left" aria-label="Signal filters">
      <section class="b46-page2-rail-card">
        <div class="b46-page2-rail-title">SIGNAL MARKET</div>
        <button type="button" class="b46-page2-filter active" data-b46-market="all"><span>All signals</span><b data-b46-market-count="all">0</b></button>
        <button type="button" class="b46-page2-filter" data-b46-market="ah"><span><i class="b46-page2-dot live"></i>Asian Handicap</span><b data-b46-market-count="ah">0</b></button>
        <button type="button" class="b46-page2-filter" data-b46-market="ou"><span><i class="b46-page2-dot goals"></i>Goals O/U</span><b data-b46-market-count="ou">0</b></button>
        <button type="button" class="b46-page2-filter" data-b46-market="1x2"><span><i class="b46-page2-dot one-x-two"></i>1X2</span><b data-b46-market-count="1x2">0</b></button>
      </section>
      <section class="b46-page2-rail-card b46-page2-leagues-card">
        <div class="b46-page2-rail-title">LEAGUES</div>
        <div class="b46-page2-league-list" data-b46-leagues><div class="b46-page2-rail-empty">Waiting for leagues</div></div>
      </section>
    </aside>
    <section class="b46-page2-center" data-b46-page2-center></section>
    <aside class="b46-page2-right" aria-live="polite">
      <section class="b46-page2-intel" data-b46-intel></section>
    </aside>`;

  shell.insertBefore(workspace,market);
  const center=qs('[data-b46-page2-center]',workspace);
  center.append(market,panel);
  if(note&&note.parentElement===shell)shell.insertBefore(note,workspace.nextSibling);
  bindWorkspaceEvents(workspace);
  return true;
}

function bindWorkspaceEvents(workspace){
  workspace.addEventListener('click',e=>{
    const marketBtn=e.target.closest('[data-b46-market]');
    if(marketBtn){
      marketFilter=marketBtn.dataset.b46Market||'all';
      qsa('[data-b46-market]',workspace).forEach(btn=>btn.classList.toggle('active',btn===marketBtn));
      applyFilters();
      return;
    }
    const leagueBtn=e.target.closest('[data-b46-league]');
    if(leagueBtn){
      leagueFilter=leagueBtn.dataset.b46League||'all';
      qsa('[data-b46-league]',workspace).forEach(btn=>btn.classList.toggle('active',btn===leagueBtn));
      applyFilters();
      return;
    }
    const main=e.target.closest('.next-signal-main');
    if(!main)return;
    const card=main.closest('.next-signal-card[data-next-card]');
    if(!card)return;
    selectedId=cardId(card);
    markSelected();
    renderIntel(card);
    if(e.target.closest('[data-next-toggle]'))return;
    const toggle=qs('[data-next-toggle]',main);
    if(toggle){
      card.classList.add('b46-page2-pending-toggle');
      toggle.click();
    }
  });
}

function cards(){return qsa('.next-signal-card[data-next-card]',qs('[data-next-signal-list]')||document)}
function setCount(key,value){const el=qs(`[data-b46-market-count="${key}"]`);if(el)el.textContent=String(value)}
function updateMarketCounts(list){
  const counts={all:list.length,ah:0,ou:0,'1x2':0};
  list.forEach(card=>{const k=marketBucket(cardMarket(card));if(k in counts&&k!=='all')counts[k]++});
  Object.entries(counts).forEach(([k,v])=>setCount(k,v));
}
function updateLeagues(list){
  const host=qs('[data-b46-leagues]');
  if(!host)return;
  const map=new Map();
  list.forEach(card=>{const label=cardLeague(card);map.set(label,(map.get(label)||0)+1)});
  const names=[...map.keys()].sort((a,b)=>a.localeCompare(b));
  if(leagueFilter!=='all'&&!map.has(leagueFilter))leagueFilter='all';
  const signature=JSON.stringify({names,counts:names.map(n=>map.get(n)),selected:leagueFilter});
  if(host.dataset.signature===signature)return;
  host.dataset.signature=signature;
  const rows=[`<button type="button" class="b46-page2-league-filter${leagueFilter==='all'?' active':''}" data-b46-league="all"><span>All leagues</span><b>${list.length}</b></button>`];
  names.forEach(name=>rows.push(`<button type="button" class="b46-page2-league-filter${leagueFilter===name?' active':''}" data-b46-league="${esc(name)}"><span>${esc(name)}</span><b>${map.get(name)}</b></button>`));
  host.innerHTML=rows.join('')||'<div class="b46-page2-rail-empty">No active leagues</div>';
}
function applyFilters(){
  const list=cards();
  let visible=0;
  list.forEach(card=>{
    const marketOk=marketFilter==='all'||marketBucket(cardMarket(card))===marketFilter;
    const leagueOk=leagueFilter==='all'||cardLeague(card)===leagueFilter;
    const show=marketOk&&leagueOk;
    card.hidden=!show;
    if(show)visible++;
  });
  const host=qs('[data-next-signal-list]');
  let empty=qs('.b46-page2-filter-empty',host||document);
  if(host&&list.length&&visible===0){
    if(!empty){empty=document.createElement('div');empty.className='next-empty b46-page2-filter-empty';empty.textContent='No active signals match this filter.';host.appendChild(empty)}
  }else empty?.remove();
  const selected=list.find(card=>cardId(card)===selectedId);
  if(selected&&selected.hidden){selectedId='';renderOverview()}else if(selected)renderIntel(selected);else if(selectedId){selectedId='';renderOverview()}
  markSelected();
}
function markSelected(){
  cards().forEach(card=>card.classList.toggle('b46-page2-selected',Boolean(selectedId)&&cardId(card)===selectedId));
}

function matchSignalCount(card){
  const primary=text('.next-market small',card);
  const m=primary.match(/\+(\d+)/);
  return 1+(m?Number(m[1]):0);
}
function statPair(card,label){
  const row=qsa('.next-stat-row',card).find(r=>text('span',r).toUpperCase()===label);
  if(!row)return null;
  const b=qsa('b',row).map(x=>(x.textContent||'').trim());
  return b.length>=2?`${b[0]} – ${b[1]}`:null;
}
function goalOutlook(card){
  const market=cardMarket(card),pick=text('.next-pick',card);
  return marketBucket(market)==='ou'?(pick||market):'No active O/U signal';
}
function pressureText(card){
  const danger=statPair(card,'DANGEROUS');
  if(danger)return`Dangerous attacks ${danger}`;
  const sot=statPair(card,'SOT');
  if(sot)return`Shots on target ${sot}`;
  return card.classList.contains('open')?'Live pressure data unavailable':'Open the match card for live pressure data';
}
function renderIntel(card){
  const host=qs('[data-b46-intel]');if(!host||!card)return;
  const teams=text('.next-teams',card)||'Selected match';
  const score=text('.next-score strong',card)||'—';
  const minute=text('.next-score small',card)||'—';
  const league=cardLeague(card);
  const market=cardMarket(card)||'Signal';
  const pick=text('.next-pick',card)||'—';
  const price=text('.next-price',card)||'—';
  const book=text('.next-book',card)||'—';
  const count=matchSignalCount(card);
  host.innerHTML=`
    <div class="b46-page2-intel-head"><div><span>MATCH INTELLIGENCE</span><h2>${esc(league)}</h2></div><b>LIVE</b></div>
    <div class="b46-page2-intel-score"><span>${esc(teams)}</span><strong>${esc(score)}</strong><em>${esc(minute)}</em></div>
    <div class="b46-page2-intel-section"><span>LIVE PREDICTION</span><strong>${esc(pick)}</strong><small>${esc(market)} · ${esc(price)}</small></div>
    <div class="b46-page2-intel-section"><span>GOAL OUTLOOK</span><strong>${esc(goalOutlook(card))}</strong><small>Uses active signal data only</small></div>
    <div class="b46-page2-intel-grid"><div><span>ACTIVE SIGNALS</span><strong>${count}</strong></div><div><span>BOOK / PRICE</span><strong>${esc(book)}</strong></div></div>
    <div class="b46-page2-intel-section"><span>MATCH PRESSURE</span><strong>${esc(pressureText(card))}</strong><small>No extra data request</small></div>
    <div class="b46-page2-intel-foot">Click the match score bar again to open or close the full evidence.</div>`;
}
function renderOverview(){
  const host=qs('[data-b46-intel]');if(!host)return;
  const active=text('[data-next-active-matches]')||'—';
  const signals=text('[data-next-active-signals]')||'—';
  const markets=text('[data-next-markets]')||'—';
  host.innerHTML=`
    <div class="b46-page2-intel-head"><div><span>LIVE OVERVIEW</span><h2>Signal Center</h2></div><b>LIVE</b></div>
    <div class="b46-page2-overview"><div><strong>${esc(active)}</strong><span>Active matches</span></div><div><strong>${esc(signals)}</strong><span>Active signals</span></div><div><strong>${esc(markets)}</strong><span>Markets</span></div></div>
    <div class="b46-page2-intel-empty">Select a match to pin its score, active pick, goal outlook and live pressure here.</div>`;
}
function decorateCards(list){
  list.forEach(card=>{
    card.classList.remove('b46-page2-pending-toggle');
    const main=qs('.next-signal-main',card);
    if(main){main.setAttribute('role','button');main.setAttribute('tabindex','0');main.setAttribute('aria-label','Open or close match signal details')}
  });
}
function reconcile(){
  reconcileFrame=0;
  if(!buildWorkspace())return;
  const list=cards();
  decorateCards(list);
  updateMarketCounts(list);
  updateLeagues(list);
  applyFilters();
  const selected=list.find(card=>cardId(card)===selectedId);
  if(selected)renderIntel(selected);else renderOverview();
}
function scheduleReconcile(){
  if(reconcileFrame)return;
  reconcileFrame=requestAnimationFrame(reconcile);
}
function init(){
  if(!isSignalPage())return;
  buildWorkspace();
  const list=qs('[data-next-signal-list]');
  if(list){
    observer=new MutationObserver(scheduleReconcile);
    observer.observe(list,{childList:true});
  }
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    const main=e.target.closest?.('.next-signal-main');
    if(!main||!document.body.classList.contains(ROOT_CLASS))return;
    if(e.target.closest('[data-next-toggle]'))return;
    e.preventDefault();
    main.click();
  });
  reconcile();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
window.BALL46_PAGE2_WORKSPACE={revision:REVISION,reconcile:scheduleReconcile};
})();