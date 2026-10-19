
/* EVENT FLOW Mobile V2: presentation only, <=767px. */
const mobileFlowSelection = new Map();
const mobileFlowQuery = window.matchMedia('(max-width: 767px)');
const mobileEsc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mobileSignalEntries(rows,current) {
  const used=new Map();
  return rows.filter(s=>{const m=signalMinute(s);return m!==null&&m>=0&&m<=current+.75}).map((s,i)=>{
    const base=JSON.stringify([s.id??s.signalId??s.signalKey??null,s.fixtureId,signalMinute(s),s.createdAt??s.timestamp??null,s.market,s.selection,s.line,s.odds,s.bookmaker]);
    const n=used.get(base)||0;used.set(base,n+1);
    return {s,minute:signalMinute(s),key:base+'#'+n,number:i+1};
  });
}
function mobileFlowStyle(){
  if(document.getElementById('b46-mobile-eventflow-v2-style'))return;
  const style=document.createElement('style');style.id='b46-mobile-eventflow-v2-style';
  style.textContent='@media(max-width:767px){.expand-flow-card .b46-mf-chart{width:100%!important;max-width:100%!important;height:300px!important;min-height:300px!important;padding:0!important;overflow:hidden!important;box-sizing:border-box}.expand-flow-card .b46-mf-chart svg{display:block!important;width:100%!important;height:300px!important;min-height:300px!important;max-height:300px!important}.b46-mf-chart .expand-flow-axis{font:11px system-ui,sans-serif!important}.b46-mf-legend{display:flex!important;flex-wrap:wrap!important;gap:7px 12px!important;padding:8px!important;font-size:12px!important;min-width:0}.b46-mf-legend span{max-width:100%;white-space:normal!important;overflow-wrap:anywhere}.b46-mf-legend small{flex-basis:100%;font-size:11px!important}.b46-mf-marker{cursor:pointer;touch-action:manipulation;outline:none}.b46-mf-marker:focus .b46-mf-disc{stroke:#fff;stroke-width:3}.b46-mf-panel{margin:8px;padding:12px;border-radius:10px;background:rgba(10,168,110,.10);font:12px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;min-width:0}.b46-mf-panel strong{display:block;color:#22c55e;font-size:14px;margin-bottom:6px}.b46-mf-details{display:grid;grid-template-columns:68px minmax(0,1fr);gap:5px 8px;margin:0}.b46-mf-details dt{opacity:.65}.b46-mf-details dd{margin:0;min-width:0;overflow-wrap:anywhere}.b46-mf-nav{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;margin-bottom:6px}.b46-mf-nav button{flex:0 0 38px;min-height:38px;border:1px solid #0aa86e;border-radius:8px;background:transparent;color:inherit;font:700 13px system-ui;cursor:pointer;touch-action:manipulation}.b46-mf-nav button[aria-pressed=true]{background:#0aa86e;color:#fff}.expand-flow-card:has(.b46-mf-chart){min-width:0!important;max-width:100%!important;overflow-x:hidden!important}.expand-flow-card:has(.b46-mf-chart) .expand-card-head{flex-wrap:wrap;gap:4px;font-size:12px!important}.expand-flow-card:has(.b46-mf-chart) .expand-card-head small{font-size:10px!important}}';
  document.head.appendChild(style);
}
function mobileFlowGrid(w,h,pad,current){
  const ys=[100,50,1].map(v=>{const y=yFor(v,h,pad);return '<line x1="'+pad.left+'" y1="'+y+'" x2="'+(w-pad.right)+'" y2="'+y+'" class="expand-flow-grid"/><text x="'+(pad.left-5)+'" y="'+(y+4)+'" text-anchor="end" class="expand-flow-axis">'+v+'%</text>'}).join('');
  const marks=[0,current/2,current];
  return ys+marks.map(m=>{const x=xFor(m,w,pad,current);return '<line x1="'+x+'" y1="'+pad.top+'" x2="'+x+'" y2="'+(h-pad.bottom)+'" class="expand-flow-grid v"/><text x="'+x+'" y="'+(h-8)+'" text-anchor="middle" class="expand-flow-axis">'+Math.round(m)+"'</text>"}).join('');
}
function mobileFlowMarkers(entries,points,current,w,h,pad,selected){
  const placed=[];
  return entries.map(e=>{
    const p=pressureAt(points,e.minute),side=signalSide(e.s),x=xFor(e.minute,w,pad,current),y=yFor(side?p[side]:(p.home+p.away)/2,h,pad);
    let best=null;
    for(let cy=pad.top;cy<=h-pad.bottom;cy+=42)for(let cx=pad.left;cx<=w-pad.right;cx+=42){
      if(placed.some(v=>Math.hypot(v.x-cx,v.y-cy)<41))continue;
      const distance=(cx-x)**2+(cy-y)**2;
      if(!best||distance<best.distance)best={x:cx,y:cy,distance};
    }
    // Each signal also has a separate accessible button below the graph.
    if(!best)return '';
    placed.push(best);
    const label='Signal '+e.number+' · '+signalTitle(e.s),active=e.key===selected;
    return '<g class="b46-mf-marker" role="button" tabindex="0" data-mf-signal="'+mobileEsc(e.key)+'" aria-label="'+mobileEsc(label)+'" aria-pressed="'+active+'"><title>'+mobileEsc(label)+'</title><line x1="'+x+'" y1="'+y+'" x2="'+best.x+'" y2="'+best.y+'" stroke="#0aa86e" stroke-width="1" opacity=".7"/><circle cx="'+x+'" cy="'+y+'" r="3" fill="#0aa86e"/><circle cx="'+best.x+'" cy="'+best.y+'" r="20" fill="transparent"/><circle class="b46-mf-disc" cx="'+best.x+'" cy="'+best.y+'" r="14" fill="'+(active?'#0aa86e':'#071b16')+'" stroke="#22c55e" stroke-width="2"/><text x="'+best.x+'" y="'+(best.y+4)+'" text-anchor="middle" fill="#fff" font-size="12" font-family="system-ui" font-weight="750" pointer-events="none">'+e.number+'</text></g>';
  }).join('');
}
function mobileFlowPanel(entries,selected){
  if(!entries.length)return '';
  const entry=entries.find(e=>e.key===selected);
  const nav='<nav class="b46-mf-nav" aria-label="Event Flow signals">'+entries.map(e=>'<button type="button" data-mf-signal="'+mobileEsc(e.key)+'" aria-label="Signal '+e.number+' · '+mobileEsc(signalTitle(e.s))+'" aria-pressed="'+(e.key===selected)+'">'+e.number+'</button>').join('')+'</nav>';
  if(!entry)return '<section class="b46-mf-panel">'+nav+'Select a signal to view details.</section>';
  const s=entry.s,odds=num(s.odds),choice=[String(s.selection||s.providerLineSide||'').trim().toUpperCase(),signalLineText(s)].filter(Boolean).join(' ')||'—';
  const pairs=[['Minute',String(s.matchTime??s.entryClock??s.entryMinute??s.minute??'—')],['Market',signalMarket(s)],['Selection',choice],['Odds',odds===null?'—':odds.toFixed(2)],['Bookmaker',String(s.bookmaker||'—')]];
  return '<section class="b46-mf-panel" aria-label="Selected signal details">'+nav+'<div aria-live="polite"><strong>Signal '+entry.number+'</strong><dl class="b46-mf-details">'+pairs.map(([k,v])=>'<dt>'+k+'</dt><dd>'+mobileEsc(v)+'</dd>').join('')+'</dl></div></section>';
}
function renderMobileFlow(f,history,signals){
  mobileFlowStyle();
  const current=currentMinute(f,history),points=flowPoints(history,current),id=fixtureId(f),entries=mobileSignalEntries(signals,current);
  let selected=mobileFlowSelection.get(id);
  if(!entries.some(e=>e.key===selected)){selected=entries[0]?.key; if(selected)mobileFlowSelection.set(id,selected);else mobileFlowSelection.delete(id);}
  const gh=num(f?.goals?.home),ga=num(f?.goals?.away),score=gh===null||ga===null?'':' · '+Math.max(0,Math.trunc(gh))+'–'+Math.max(0,Math.trunc(ga));
  const head='<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0′ → '+current+'′'+score+'</b></div><small>Attack pressure · 1–100%</small></div>';
  if(!points.length)return head+'<div class="expand-empty">Collecting Event Flow history…</div>'+mobileFlowPanel(entries,selected);
  const card=expandedEl?.querySelector('.expand-flow-card'),w=Math.max(180,Math.round((card?.getBoundingClientRect().width||window.innerWidth-24)-16)),h=300,pad={left:36,right:20,top:22,bottom:30},last=points[points.length-1],safe='mf-'+norm(id);
  const legend='<div class="expand-flow-legend b46-mf-legend"><span class="home"><i></i>'+mobileEsc(f?.home?.name||'HOME')+' <b>'+Math.round(last.home)+'%</b></span><span class="away"><i></i>'+mobileEsc(f?.away?.name||'AWAY')+' <b>'+Math.round(last.away)+'%</b></span><small>'+points.length+' points · '+entries.length+' signals</small></div>';
  const defs='<defs><linearGradient id="eh-'+safe+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#31b878" stop-opacity=".22"/><stop offset="100%" stop-color="#31b878" stop-opacity="0"/></linearGradient><linearGradient id="ea-'+safe+'" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e2c94c" stop-opacity=".20"/><stop offset="100%" stop-color="#e2c94c" stop-opacity="0"/></linearGradient></defs>';
  const paths=['home','away'].map((key,i)=>'<path d="'+areaLine(points,key,w,h,pad,current)+'" fill="url(#e'+(i?'a':'h')+'-'+safe+')" class="expand-flow-area"/><path d="'+pathLine(points,key,w,h,pad,current)+'" class="expand-flow-line '+key+'"/>').join('');
  return head+legend+'<div class="expand-flow-chart b46-mf-chart"><svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="xMidYMid meet" role="group" aria-label="Event flow from minute zero to current minute">'+defs+mobileFlowGrid(w,h,pad,current)+paths+mobileFlowMarkers(entries,points,current,w,h,pad,selected)+'</svg></div>'+mobileFlowPanel(entries,selected);
}
function handleMobileFlowSelect(e){
  if(!mobileFlowQuery.matches)return false;
  const target=e.target.closest?.('[data-mf-signal]');
  if(!target||!expandedEl?.contains(target)||!expandedId)return false;
  if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return false;
  const fixture=boardCache.data?findFixture(boardCache.data,expandedId):null,history=historyCache.get(expandedId)?.data;
  if(!fixture||!history)return false;
  const key=target.getAttribute('data-mf-signal'),entries=mobileSignalEntries(signalsForFixture(expandedId),currentMinute(fixture,history));
  if(!entries.some(entry=>entry.key===key))return false;
  e.preventDefault();e.stopPropagation();mobileFlowSelection.set(expandedId,key);rerenderSignalEntries();
  return true;
}
