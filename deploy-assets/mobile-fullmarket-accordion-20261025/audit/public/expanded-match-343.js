(()=>{
'use strict';
const VERSION='343-expanded-match-v4-stable-lifecycle-signal-entry-20261002';
const B46_EVENTFLOW_SIGNAL_ENTRY_20261002=true;
const B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004=true;
const B46_EVENTFLOW_EXPAND_MODE_20261004=true;
const B46_EVENTFLOW_LIVE_SCORE_HEADER_20261004=true;
const B46_EVENTFLOW_DARK_SURFACE_20261004=true;
const ODDS_RENDER_OWNER='full-market-bookmaker-only';
const BOARD_API='/api/engine/board';
const HISTORY_API='/api/engine/history';
const BOARD_CACHE_MS=15000;
const HISTORY_CACHE_MS=20000;
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const norm=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');
let expandedId=null;
let expandedEl=null;
let boardCache={at:0,data:null,promise:null};
const historyCache=new Map();
let refreshSeq=0;
let refreshTimer=0;
let placementQueued=false;
let lastAnchorTop=null;
let signalRows=[];
let eventFlowViewportExpanded=false;
let eventFlowSavedScrollY=null;

async function fetchJson(url){
  const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j?.ok===false)throw new Error(j?.error||`HTTP_${r.status}`);
  return j;
}
async function getBoard(force=false){
  const now=Date.now();
  if(!force&&boardCache.data&&now-boardCache.at<BOARD_CACHE_MS)return boardCache.data;
  if(boardCache.promise)return boardCache.promise;
  boardCache.promise=fetchJson(BOARD_API).then(j=>{boardCache={at:Date.now(),data:j,promise:null};return j}).catch(e=>{boardCache.promise=null;throw e});
  return boardCache.promise;
}
async function getHistory(id,force=false){
  const now=Date.now(),hit=historyCache.get(id);
  if(!force&&hit?.data&&now-hit.at<HISTORY_CACHE_MS)return hit.data;
  if(hit?.promise)return hit.promise;
  const promise=fetchJson(`${HISTORY_API}?fixtureId=${encodeURIComponent(id)}&window=10`).then(j=>{historyCache.set(id,{at:Date.now(),data:j,promise:null});return j}).catch(e=>{historyCache.delete(id);throw e});
  historyCache.set(id,{at:now,data:null,promise});
  return promise;
}
function fixtureId(f){return String(f?.fixtureId??f?.id??'')}
function findFixture(board,id){return (Array.isArray(board?.fixtures)?board.fixtures:[]).find(f=>fixtureId(f)===String(id))||null}
function currentMinute(f,history){
  const fm=num(f?.minute),pts=Array.isArray(history?.pressure)?history.pressure:[],hm=pts.reduce((m,p)=>Math.max(m,num(p?.minute)??0),0);
  return Math.max(1,Math.round(Math.max(fm??0,hm)));
}
function flowPoints(history,current){
  const src=Array.isArray(history?.pressure)?history.pressure:[];
  const out=[];
  for(const p of src){
    const minute=num(p?.minute),home=num(p?.home),away=num(p?.away);
    if(minute===null||home===null||away===null||minute<0||minute>current+3)continue;
    const row={minute,home:clamp(home,1,100),away:clamp(away,1,100)};
    const last=out[out.length-1];
    if(last&&Math.abs(last.minute-minute)<.001)out[out.length-1]=row;else out.push(row);
  }
  return out.sort((a,b)=>a.minute-b.minute);
}
function pathLine(points,key,w,h,pad,current){return points.map((p,i)=>`${i?'L':'M'} ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ')}
function areaLine(points,key,w,h,pad,current){
  if(!points.length)return'';
  const base=yFor(1,h,pad),body=points.map(p=>`L ${xFor(p.minute,w,pad,current).toFixed(1)} ${yFor(p[key],h,pad).toFixed(1)}`).join(' ');
  const first=xFor(points[0].minute,w,pad,current),last=xFor(points[points.length-1].minute,w,pad,current);
  return `M ${first.toFixed(1)} ${base.toFixed(1)} ${body} L ${last.toFixed(1)} ${base.toFixed(1)} Z`;
}
function xFor(minute,w,pad,current){return pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right)}
function yFor(value,h,pad){const v=clamp(value,1,100);return pad.top+((100-v)/99)*(h-pad.top-pad.bottom)}
function flowGrid(w,h,pad,current){
  const ys=[100,75,50,25,1].map(v=>{const y=yFor(v,h,pad);return `<line x1="${pad.left}" y1="${y}" x2="${w-pad.right}" y2="${y}" class="expand-flow-grid${v===50?' mid':''}"/><text x="${pad.left-7}" y="${y+3}" text-anchor="end" class="expand-flow-axis">${v}%</text>`}).join('');
  const step=current<=30?5:current<=60?10:15,marks=[0];for(let m=step;m<current;m+=step)marks.push(m);if(!marks.includes(current))marks.push(current);
  const xs=marks.map(m=>{const x=xFor(m,w,pad,current);return `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${h-pad.bottom}" class="expand-flow-grid v"/><text x="${x}" y="${h-7}" text-anchor="middle" class="expand-flow-axis">${m}'</text>`}).join('');
  return ys+xs;
}
function matchMinute(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const t=String(v).trim();
  let m=t.match(/^(\d{1,3})\s*\+\s*(\d{1,2})(?::(\d{1,2}))?$/);if(m)return Number(m[1])+Number(m[2])+(Number(m[3]||0)/60);
  m=t.match(/^(\d{1,3}):(\d{1,2})$/);if(m)return Number(m[1])+(Number(m[2])/60);
  const n=Number(t.replace(/['’]/g,''));return Number.isFinite(n)?n:null;
}
function signalMinute(s){return matchMinute(s?.matchTime??s?.entryClock??s?.entryMinute??s?.minute)}
function signalMarket(s){const x=String(s?.marketLabel||s?.market||s?.providerMarket||'SIGNAL').toLowerCase();if(/corner/.test(x))return'CORNERS';if(/card/.test(x))return'CARDS';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1X2';if(/asian|handicap|(^|[^a-z])ah([^a-z]|$)/.test(x))return'AH';if(/over|under|o\/u|goal[_ -]?line|total/.test(x))return'O/U';return'SIGNAL'}
function signalLineText(s){const line=num(s?.line??s?.selectionLine??s?.providerLine);return line===null?'':(line>0?'+':'')+(Number.isInteger(line)?String(line):line.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))}
function signalTitle(s){const m=signalMinute(s),market=signalMarket(s),pick=String(s?.selection||s?.providerLineSide||'').trim().toUpperCase(),line=signalLineText(s),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();return [(m===null?'—':m.toFixed(m%1?1:0))+"'",market,[pick,line].filter(Boolean).join(' '),odds===null?'':'@'+odds.toFixed(2),book].filter(Boolean).join(' · ')}
function signalsForFixture(id){const key=String(id||'');return signalRows.filter(s=>String(s?.fixtureId??'')===key&&signalMinute(s)!==null).sort((a,b)=>(signalMinute(a)??0)-(signalMinute(b)??0)||Number(a?.createdAt||0)-Number(b?.createdAt||0))}
function pressureAt(points,minute){if(!points.length)return{home:50,away:50};let a=points[0],b=points[points.length-1];for(let i=0;i<points.length;i++){if(points[i].minute<=minute)a=points[i];if(points[i].minute>=minute){b=points[i];break}}if(a===b||Math.abs(b.minute-a.minute)<.001)return{home:a.home,away:a.away};const t=clamp((minute-a.minute)/(b.minute-a.minute),0,1);return{home:a.home+(b.home-a.home)*t,away:a.away+(b.away-a.away)*t}}
function signalSide(s){const x=String(s?.selection??s?.providerLineSide??'').trim().toLowerCase();if(x==='home'||x.includes('home'))return'home';if(x==='away'||x.includes('away'))return'away';return null}
function signalAnnotationLines(s){
  const market=signalMarket(s),pick=String(s?.selection||s?.providerLineSide||'').trim().toUpperCase(),line=signalLineText(s),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();
  const choice=[pick,line].filter(Boolean).join(' '),primary=[market,choice].filter(Boolean).join(' · '),secondary=[odds===null?'':'@'+odds.toFixed(2),book].filter(Boolean).join(' · ');
  return [primary||'SIGNAL',secondary].filter(Boolean)
}
function signalMarkers(rows,points,current,w,h,pad){
  const grouped=new Map();for(const s of Array.isArray(rows)?rows:[]){const m=signalMinute(s);if(m===null||m<0||m>current+.75)continue;const key=(Math.round(m*10)/10).toFixed(1);if(!grouped.has(key))grouped.set(key,{minute:m,rows:[]});grouped.get(key).rows.push(s)}
  const placed=[];let i=0,out='';for(const g of grouped.values()){
    const x=xFor(g.minute,w,pad,current),p=pressureAt(points,g.minute),ys=g.rows.map(s=>{const side=signalSide(s);return yFor(side?p[side]:(p.home+p.away)/2,h,pad)}),y=ys.reduce((a,v)=>a+v,0)/Math.max(1,ys.length),count=g.rows.length,label=count>1?'SIGNAL ×'+count:'SIGNAL',details=g.rows.map(signalTitle).join(' | '),fresh=g.rows.some(s=>{const t=num(s?.createdAt);return t!==null&&Date.now()-t>=0&&Date.now()-t<12000});
    let detailLines=[];for(const row of g.rows)detailLines.push(...signalAnnotationLines(row));
    if(detailLines.length>8){const hidden=detailLines.length-7;detailLines=detailLines.slice(0,7).concat('+'+hidden+' more detail line'+(hidden===1?'':'s'))}
    const header=label+' '+Math.round(g.minute)+"'",maxChars=Math.max(header.length,...detailLines.map(v=>String(v).length),12),boxW=clamp(26+maxChars*6.15,174,306),rawH=32+detailLines.length*14,boxH=Math.min(rawH,h-pad.top-pad.bottom-8),gap=18,plotLeft=pad.left+4,plotRight=w-pad.right-4;
    const preferLeft=x>w*.58||x+gap+boxW>plotRight,boxX=clamp(preferLeft?x-gap-boxW:x+gap,plotLeft,plotRight-boxW);
    let boxY=y-boxH-18;if(boxY<pad.top+4)boxY=y+18;boxY=clamp(boxY,pad.top+4,h-pad.bottom-boxH-4);
    for(let attempt=0;attempt<8;attempt++){
      const clash=placed.find(r=>boxX<r.x+r.w+7&&boxX+boxW+7>r.x&&boxY<r.y+r.h+7&&boxY+boxH+7>r.y);
      if(!clash)break;
      const down=clash.y+clash.h+8,up=clash.y-boxH-8,maxY=h-pad.bottom-boxH-4,minY=pad.top+4;
      if(down<=maxY)boxY=down;else if(up>=minY)boxY=up;else boxY=clamp(boxY+(i%2?-(boxH+8):(boxH+8)),minY,maxY)
    }
    placed.push({x:boxX,y:boxY,w:boxW,h:boxH});
    const edgeX=preferLeft?boxX+boxW:boxX,edgeY=clamp(y,boxY+10,boxY+boxH-10),elbowX=x+(edgeX>x?9:-9),textX=boxX+12,headerY=boxY+17;
    const lineText=detailLines.map((line,n)=>'<text x="'+textX.toFixed(1)+'" y="'+(headerY+16+n*14).toFixed(1)+'" font-size="10.5" font-weight="650" fill="#d9f8ea">'+esc(line)+'</text>').join('');
    out+='<g class="b46-eventflow-signal-entry b46-eventflow-signal-annotation" data-signal-minute="'+g.minute.toFixed(2)+'" data-annotation-side="'+(preferLeft?'left':'right')+'" role="group" aria-label="'+esc(details)+'"><title>'+esc(details)+'</title><line x1="'+x.toFixed(1)+'" y1="'+pad.top+'" x2="'+x.toFixed(1)+'" y2="'+(h-pad.bottom)+'" stroke="#0aa86e" stroke-width="1" stroke-dasharray="4 5" opacity=".30" vector-effect="non-scaling-stroke"/><polyline points="'+x.toFixed(1)+','+y.toFixed(1)+' '+elbowX.toFixed(1)+','+y.toFixed(1)+' '+edgeX.toFixed(1)+','+edgeY.toFixed(1)+'" fill="none" stroke="#0acb7c" stroke-width="1.6" opacity=".82" vector-effect="non-scaling-stroke"/><rect x="'+boxX.toFixed(1)+'" y="'+boxY.toFixed(1)+'" width="'+boxW.toFixed(1)+'" height="'+boxH.toFixed(1)+'" rx="7" fill="#071b16" fill-opacity=".93" stroke="#0acb7c" stroke-width="1.2" vector-effect="non-scaling-stroke"/><text x="'+textX.toFixed(1)+'" y="'+headerY.toFixed(1)+'" font-size="11.5" font-weight="850" fill="#61f2b3">'+esc(header)+'</text>'+lineText+'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="5.4" fill="#0acb7c" stroke="#ffffff" stroke-width="2.2" vector-effect="non-scaling-stroke"/>'+(fresh?'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="7" fill="none" stroke="#0acb7c" stroke-width="1.5" opacity=".65" vector-effect="non-scaling-stroke"><animate attributeName="r" values="7;12;7" dur="1.2s" repeatCount="4"/><animate attributeName="opacity" values=".65;.08;.65" dur="1.2s" repeatCount="4"/></circle>':'')+'</g>';i++
  }return out
}

/* EVENT FLOW Mobile V2: presentation only, <=767px. */
const mobileFlowSelection = new Map();
const mobileFlowQuery = window.matchMedia('(max-width: 767px)');
const mobileEsc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mobileSignalEntries(rows,current) {
  const used=new Map();
  return rows.filter(s=>{const m=signalMinute(s);return m!==null&&m>=0&&m<=current+.75}).map((s,i)=>{
    const identity=s.id??s.signalId??s.signalKey;
    const base=identity!=null?JSON.stringify([s.fixtureId,identity]):JSON.stringify([s.fixtureId,signalMinute(s),s.createdAt??s.timestamp??null,s.market,s.selection,s.line,s.odds,s.bookmaker]);
    const n=used.get(base)||0;used.set(base,n+1);
    return {s,minute:signalMinute(s),key:base+'#'+n,number:i+1};
  });
}
function mobileFlowStyle(){
  if(document.getElementById('b46-mobile-eventflow-v2-style'))return;
  const style=document.createElement('style');style.id='b46-mobile-eventflow-v2-style';
  style.textContent='@media(max-width:767px){.expand-flow-card .expand-flow-chart.b46-mf-chart{width:100%!important;max-width:100%!important;height:300px!important;min-height:300px!important;padding:0!important;overflow:hidden!important;box-sizing:border-box}.expand-flow-card .expand-flow-chart.b46-mf-chart svg{display:block!important;width:100%!important;height:300px!important;min-height:300px!important;max-height:300px!important}.b46-mf-chart .expand-flow-axis{font:11px system-ui,sans-serif!important}.b46-mf-legend{display:flex!important;flex-wrap:wrap!important;gap:7px 12px!important;padding:8px!important;font-size:12px!important;min-width:0}.b46-mf-legend span{max-width:100%;white-space:normal!important;overflow-wrap:anywhere}.b46-mf-legend small{flex-basis:100%;font-size:11px!important}.b46-mf-marker{cursor:pointer;touch-action:manipulation;outline:none}.b46-mf-marker:focus .b46-mf-disc{stroke:#fff;stroke-width:3}.b46-mf-panel{margin:8px;padding:12px;border-radius:10px;background:rgba(10,168,110,.10);font:12px/1.5 system-ui,sans-serif;overflow-wrap:anywhere;min-width:0}.b46-mf-panel strong{display:block;color:#22c55e;font-size:14px;margin-bottom:6px}.b46-mf-details{display:grid;grid-template-columns:68px minmax(0,1fr);gap:5px 8px;margin:0}.b46-mf-details dt{opacity:.65}.b46-mf-details dd{margin:0;min-width:0;overflow-wrap:anywhere}.b46-mf-nav{display:flex;gap:8px;overflow-x:auto;padding:2px 0 8px;margin-bottom:6px}.b46-mf-nav button{flex:0 0 38px;min-height:38px;border:1px solid #0aa86e;border-radius:8px;background:transparent;color:inherit;font:700 13px system-ui;cursor:pointer;touch-action:manipulation}.b46-mf-nav button[aria-pressed=true]{background:#0aa86e;color:#fff}.expand-flow-card:has(.b46-mf-chart){min-width:0!important;max-width:100%!important;overflow-x:hidden!important}.expand-flow-card:has(.b46-mf-chart) .expand-card-head{flex-wrap:wrap;gap:4px;font-size:12px!important;background:transparent!important;background-image:none!important;border-color:transparent!important;box-shadow:none!important}.expand-flow-card:has(.b46-mf-chart) .expand-card-head small{font-size:10px!important}}';
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
    let best=placed.some(v=>Math.hypot(v.x-x,v.y-y)<42)?null:{x,y,distance:0};
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

function renderFlow(f,history,signals=[]){
  if(mobileFlowQuery.matches)return renderMobileFlow(f,history,signals);
  const current=currentMinute(f,history),points=flowPoints(history,current),home=esc(f?.home?.name||'HOME'),away=esc(f?.away?.name||'AWAY'),gh=num(f?.goals?.home),ga=num(f?.goals?.away),scoreText=gh===null||ga===null?'':` · ${Math.max(0,Math.trunc(gh))}–${Math.max(0,Math.trunc(ga))}`;
  if(!points.length)return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'${scoreText}</b></div><small>1–100% · Engine history</small></div><div class="expand-empty">กำลังสะสม Event Flow ของคู่นี้</div>`;
  const viewportW=window.innerWidth||1000,viewportH=window.innerHeight||700,w=eventFlowViewportExpanded?clamp(Math.round(viewportW-24),360,1440):1000,h=eventFlowViewportExpanded?clamp(Math.round(viewportH-142),320,780):232,pad={left:42,right:18,top:14,bottom:30},last=points[points.length-1],hx=xFor(last.minute,w,pad,current),hy=yFor(last.home,h,pad),ay=yFor(last.away,h,pad),safe=norm(fixtureId(f))||'flow';
  const signalMarks=signalMarkers(signals,points,current,w,h,pad),signalCount=Array.isArray(signals)?signals.filter(x=>{const m=signalMinute(x);return m!==null&&m<=current+.75}).length:0;
  return `<div class="expand-card-head"><div><span>EVENT FLOW</span><b>0' → ${current}'${scoreText}</b></div><small>Attack pressure · 1–100%</small></div><div class="expand-flow-legend"><span class="home"><i></i>${home} <b>${Math.round(last.home)}%</b></span><span class="away"><i></i>${away} <b>${Math.round(last.away)}%</b></span><small>${points.length} points · missing early history stays blank${signalCount?` · ${signalCount} signal entr${signalCount===1?'y':'ies'}`:''}</small></div><div class="expand-flow-chart" data-b46-flow="${mobileEsc(JSON.stringify({fixtureId:fixtureId(f),current,points,home:f?.home?.name||'HOME',away:f?.away?.name||'AWAY',events:Array.isArray(f?.events)?f.events:[],plot:{left:pad.left,right:w-pad.right,top:pad.top,bottom:h-pad.bottom,width:w,height:h}}))}"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Event flow from minute zero to current minute"><defs><linearGradient id="eh-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#31b878" stop-opacity=".22"/><stop offset="100%" stop-color="#31b878" stop-opacity="0"/></linearGradient><linearGradient id="ea-${safe}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#e2c94c" stop-opacity=".20"/><stop offset="100%" stop-color="#e2c94c" stop-opacity="0"/></linearGradient></defs>${flowGrid(w,h,pad,current)}<path d="${areaLine(points,'home',w,h,pad,current)}" fill="url(#eh-${safe})" class="expand-flow-area"/><path d="${areaLine(points,'away',w,h,pad,current)}" fill="url(#ea-${safe})" class="expand-flow-area"/><path d="${pathLine(points,'home',w,h,pad,current)}" class="expand-flow-line home"/><path d="${pathLine(points,'away',w,h,pad,current)}" class="expand-flow-line away"/><circle cx="${hx}" cy="${hy}" r="2.4" class="expand-flow-end home"/><circle cx="${hx}" cy="${ay}" r="2.4" class="expand-flow-end away"/>${signalMarks}</svg></div>`;
}
function shell(id){
  const el=document.createElement('section');el.className='match-expanded';el.dataset.expandedMatch=id;el.dataset.oddsRenderOwner=ODDS_RENDER_OWNER;
  el.innerHTML=`<div class="match-expanded-inner"><section class="expand-card expand-flow-card"><div class="expand-loading">Loading Event Flow…</div></section><section class="expand-card expand-full-market-card" data-full-market-card><div class="expand-loading">Loading Full Market from Bulk Snapshot…</div></section></div>`;
  return el;
}
function ensureEventFlowExpandStyle(){
  if(document.getElementById('b46-eventflow-expand-style-20261004'))return;
  const style=document.createElement('style');style.id='b46-eventflow-expand-style-20261004';
  style.textContent=`html.b46-eventflow-viewport-lock,body.b46-eventflow-viewport-lock{overflow:hidden!important;overscroll-behavior:none!important}.expand-flow-card .expand-card-head{position:relative;padding-right:48px!important}.b46-eventflow-expand-toggle{position:absolute;right:9px;top:50%;transform:translateY(-50%);display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(97,242,179,.38);border-radius:8px;background:rgba(6,26,20,.88);color:#61f2b3;font:700 18px/1 system-ui,sans-serif;cursor:pointer;z-index:3;box-shadow:0 4px 14px rgba(0,0,0,.18)}.b46-eventflow-expand-toggle:hover,.b46-eventflow-expand-toggle:focus-visible{border-color:#61f2b3;background:rgba(10,46,34,.98);outline:none}.expand-flow-card.b46-eventflow-viewport-expanded{position:fixed!important;inset:10px!important;z-index:2147483000!important;width:auto!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;isolation:isolate;background:#06120f!important;border:1px solid rgba(97,242,179,.42)!important;border-radius:14px!important;box-shadow:0 24px 80px rgba(0,0,0,.62)!important;animation:none!important;transition:none!important}.b46-eventflow-viewport-expanded .expand-card-head,.b46-eventflow-viewport-expanded .expand-flow-legend{flex:0 0 auto}.b46-eventflow-viewport-expanded .expand-flow-chart{flex:1 1 auto!important;min-height:0!important;height:auto!important;max-height:none!important;overflow:hidden!important;padding-bottom:8px!important}.b46-eventflow-viewport-expanded .expand-flow-chart svg{display:block!important;width:100%!important;height:100%!important;min-height:0!important;max-height:none!important}.b46-eventflow-viewport-expanded .b46-eventflow-expand-toggle{width:34px;height:34px;font-size:20px}@media(max-width:700px){.expand-flow-card.b46-eventflow-viewport-expanded{inset:0!important;border-radius:0!important;border-left:0!important;border-right:0!important}.b46-eventflow-viewport-expanded .expand-card-head{padding-right:52px!important}.b46-eventflow-viewport-expanded .expand-flow-chart{padding-left:2px!important;padding-right:2px!important}.b46-eventflow-viewport-expanded .b46-eventflow-expand-toggle{right:8px}}@media(prefers-reduced-motion:reduce){.expand-flow-card.b46-eventflow-viewport-expanded,.b46-eventflow-expand-toggle{animation:none!important;transition:none!important}}`;
  document.head.appendChild(style)
}
function ensureEventFlowToggleButton(){
  const flow=expandedEl?.querySelector('.expand-flow-card'),head=flow?.querySelector('.expand-card-head');if(!flow||!head)return null;
  let button=head.querySelector('[data-eventflow-expand-toggle]');
  if(!button){button=document.createElement('button');button.type='button';button.className='b46-eventflow-expand-toggle';button.dataset.eventflowExpandToggle='1';head.appendChild(button)}
  button.textContent=eventFlowViewportExpanded?'⤡':'⤢';
  button.setAttribute('aria-label',eventFlowViewportExpanded?'Collapse Event Flow':'Expand Event Flow');
  button.setAttribute('aria-pressed',String(eventFlowViewportExpanded));
  button.title=eventFlowViewportExpanded?'Collapse Event Flow':'Expand Event Flow';
  return button
}
function applyEventFlowViewportState(){
  ensureEventFlowExpandStyle();
  document.documentElement.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  document.body?.classList.toggle('b46-eventflow-viewport-lock',eventFlowViewportExpanded);
  const flow=expandedEl?.querySelector('.expand-flow-card');if(!flow)return;
  flow.classList.toggle('b46-eventflow-viewport-expanded',eventFlowViewportExpanded);
  flow.dataset.eventflowViewport=eventFlowViewportExpanded?'expanded':'normal';
  ensureEventFlowToggleButton()
}
function setEventFlowViewportExpanded(next){
  const target=Boolean(next);if(target===eventFlowViewportExpanded){applyEventFlowViewportState();return}
  if(target)eventFlowSavedScrollY=window.scrollY;
  eventFlowViewportExpanded=target;applyEventFlowViewportState();
  const fixture=boardCache.data&&expandedId?findFixture(boardCache.data,expandedId):null,history=expandedId?historyCache.get(expandedId)?.data:null;
  if(fixture&&history)rerenderSignalEntries();else if(expandedId)scheduleRefresh(false);
  if(!target&&eventFlowSavedScrollY!==null){const top=eventFlowSavedScrollY;eventFlowSavedScrollY=null;requestAnimationFrame(()=>window.scrollTo({top,left:window.scrollX,behavior:'auto'}))}
}
function setHtmlIfChanged(node,html){
  if(!node)return;
  const flow=Boolean(node.classList?.contains('expand-flow-card')),previous=flow?node._b46EventFlowRenderHtml:node.innerHTML;
  if(previous!==html){node.innerHTML=html;if(flow)node._b46EventFlowRenderHtml=html}
  if(flow)applyEventFlowViewportState()
}
function rerenderSignalEntries(){if(!expandedId||!expandedEl)return;const fixture=boardCache.data?findFixture(boardCache.data,expandedId):null,history=historyCache.get(expandedId)?.data,flow=expandedEl.querySelector('.expand-flow-card');if(fixture&&history&&flow)setHtmlIfChanged(flow,renderFlow(fixture,history,signalsForFixture(expandedId)))}
function takeSignalRows(rows){signalRows=Array.isArray(rows)?rows.slice():[];requestAnimationFrame(rerenderSignalEntries)}
window.addEventListener('ball46:signals-snapshot',e=>takeSignalRows(e.detail?.signals));
function publishFixture(el,fixture){
  if(!fixture||!el)return;
  el._nomadFixture=fixture;
  el.dispatchEvent(new CustomEvent('nomad343:fixture-ready',{bubbles:true,detail:{fixtureId:fixtureId(fixture),fixture}}));
}
function currentRow(id=expandedId){return id?document.querySelector(`.match-row[data-match-id="${CSS.escape(String(id))}"]`):null}
function captureAnchor(){const row=currentRow();if(!row)return;const top=row.getBoundingClientRect().top;if(Number.isFinite(top))lastAnchorTop=top}
function ensurePlacement(){
  placementQueued=false;if(!expandedId||!expandedEl)return;
  const row=currentRow();if(!row)return;
  if(expandedEl.previousElementSibling!==row)row.insertAdjacentElement('afterend',expandedEl);
  row.setAttribute('aria-expanded','true');
  const top=row.getBoundingClientRect().top;
  if(!eventFlowViewportExpanded&&lastAnchorTop!==null&&Number.isFinite(top)){const delta=top-lastAnchorTop;if(Math.abs(delta)>1&&document.visibilityState==='visible')window.scrollBy(0,delta)}
  if(Number.isFinite(top))lastAnchorTop=row.getBoundingClientRect().top;
}
function queuePlacement(){if(placementQueued)return;placementQueued=true;queueMicrotask(ensurePlacement)}
async function refreshExpanded(force=false){
  const id=expandedId,el=expandedEl;if(!id||!el)return;const seq=++refreshSeq;
  try{
    const [boardRes,histRes]=await Promise.allSettled([getBoard(force),getHistory(id,force)]);if(seq!==refreshSeq||expandedId!==id||expandedEl!==el)return;
    const board=boardRes.status==='fulfilled'?boardRes.value:null,fixture=board?findFixture(board,id):null,flow=el.querySelector('.expand-flow-card'),full=el.querySelector('[data-full-market-card]');
    if(fixture&&histRes.status==='fulfilled')setHtmlIfChanged(flow,renderFlow(fixture,histRes.value,signalsForFixture(id)));
    else if(flow)setHtmlIfChanged(flow,`<div class="expand-card-head"><div><span>EVENT FLOW</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(histRes.status==='rejected'?histRes.reason?.message:'Fixture not found')}</div>`);
    if(fixture)publishFixture(el,fixture);else if(full&&!full.querySelector('.fmb-head'))setHtmlIfChanged(full,`<div class="expand-card-head"><div><span>FULL MARKET</span><b>Unavailable</b></div></div><div class="expand-empty">${esc(boardRes.status==='rejected'?boardRes.reason?.message:'Fixture not found')}</div>`);
  }catch(err){console.warn('Expanded refresh failed',err)}
}
function scheduleRefresh(force=false){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(expandedId){queuePlacement();refreshExpanded(force)}},60)}
function openExpanded(id){
  const sid=String(id||'');if(!sid)return;
  if(expandedId===sid){closeExpanded();return}
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
  expandedId=sid;refreshSeq++;lastAnchorTop=null;
  if(expandedEl)expandedEl.remove();expandedEl=shell(sid);
  setTimeout(()=>{const row=currentRow(sid);if(!row||expandedId!==sid)return;row.insertAdjacentElement('afterend',expandedEl);row.setAttribute('aria-expanded','true');captureAnchor();refreshExpanded(true)},0);
}
function closeExpanded(){
  if(eventFlowViewportExpanded){eventFlowViewportExpanded=false;applyEventFlowViewportState()}eventFlowSavedScrollY=null;
  expandedId=null;refreshSeq++;clearTimeout(refreshTimer);if(expandedEl)expandedEl.remove();expandedEl=null;lastAnchorTop=null;
  document.querySelectorAll('.match-row[aria-expanded="true"]').forEach(x=>x.setAttribute('aria-expanded','false'));
}
function ensureEventFlowDarkSurfaceStyle(){
  if(document.getElementById('b46-eventflow-dark-surface-20261004'))return;
  const style=document.createElement('style');style.id='b46-eventflow-dark-surface-20261004';
  style.textContent='html[data-theme="dark"] body .workspace.singlepage .expand-flow-card{background:#030605!important}html[data-theme="dark"] body .workspace.singlepage .expand-flow-chart{background:#030605!important}html[data-theme="dark"] body .workspace.singlepage .expand-flow-card.b46-eventflow-viewport-expanded{background:#030605!important}';
  document.head.appendChild(style)
}
function init(){
  ensureEventFlowDarkSurfaceStyle();
  try{takeSignalRows(window.NOMAD343_DASHBOARD_V2?.getSignals?.())}catch{}
  const board=$('[data-board-sections]');if(!board)return;
  document.addEventListener('click',e=>{if(handleMobileFlowSelect(e))return;const toggle=e.target.closest?.('[data-eventflow-expand-toggle]');if(toggle){e.preventDefault();e.stopPropagation();setEventFlowViewportExpanded(!eventFlowViewportExpanded);return}if(e.target.closest?.('[data-fmb-book]'))return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);
  document.addEventListener('keydown',e=>{if(handleMobileFlowSelect(e))return;if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest?.('.match-row[data-match-id]');if(!row)return;openExpanded(row.dataset.matchId)},true);
  new MutationObserver(records=>{
    if(!expandedId||!expandedEl)return;
    const external=records.some(record=>!expandedEl.contains(record.target));
    if(!external)return;
    queuePlacement();scheduleRefresh(false);
  }).observe(board,{childList:true,subtree:true});
  const recapture=()=>{if(expandedId&&expandedEl?.isConnected)captureAnchor()};
  const recaptureAndResize=()=>{recapture();if(eventFlowViewportExpanded||mobileFlowQuery.matches||expandedEl?.querySelector(".b46-mf-chart"))rerenderSignalEntries()};
  window.addEventListener('scroll',recapture,{passive:true});window.addEventListener('resize',recaptureAndResize,{passive:true});setInterval(recapture,500);
  window.NOMAD343_EXPANDED_MATCH={version:VERSION,oddsRenderOwner:ODDS_RENDER_OWNER,open:openExpanded,close:closeExpanded,reload:()=>expandedId&&refreshExpanded(true),expandFlow:()=>expandedId&&setEventFlowViewportExpanded(true),collapseFlow:()=>setEventFlowViewportExpanded(false),isFlowExpanded:()=>eventFlowViewportExpanded,getFixture:id=>{const b=boardCache.data;return b?findFixture(b,id):null}};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
