const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const LIVE_REFRESH_MS = 15000;
const state = {
  market:'ALL',
  payload:null,
  expandedFixtureId:null,
  expandedSignalId:null,
  detailCache:new Map(),
  detailPromises:new Map()
};

const qs = s => document.querySelector(s);
const tabs = qs('#marketTabs');
const summary = qs('#dailySummary');
const rowsEl = qs('#signalRows');
const empty = qs('#emptyState');

function node(tag,cls,text){
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(text!==undefined) el.textContent=text;
  return el;
}
function fmtPct(v){return v==null?'—':Number(v).toFixed(1)+'%'}
function fmtPnl(v){
  const n=Number(v||0);
  return (n>0?'+':'')+n.toFixed(2)+'u';
}
// The 60-second alert is based on the immutable Engine signal timestamp,
// never the API refresh time or the moment the member page was opened.
const NEW_SIGNAL_WINDOW_MS = 60_000;
function freshSignalRemainingSeconds(createdAt,nowMs=Date.now()){
  const issued=Number(createdAt);
  if(!Number.isFinite(issued)||issued<1e12||!Number.isFinite(nowMs))return 0;
  const remaining=issued+NEW_SIGNAL_WINDOW_MS-nowMs;
  return remaining>0?Math.ceil(remaining/1000):0;
}
function newestSignalId(){
  const list=state.payload?.signals;
  if(!Array.isArray(list)||!list.length)return null;
  // Show the newest signal in the currently selected market tab.
  const visible=list.filter(row=>state.market==='ALL'||row.market===state.market);
  if(!visible.length)return null;
  const newest=visible.reduce((best,row)=>Number(row?.createdAt)>Number(best?.createdAt)?row:best);
  return String(newest?.id??'');
}
function freshNewestSignal(row){
  return row&&String(row.id)===newestSignalId()&&freshSignalRemainingSeconds(row.createdAt)>0;
}
function freshClockText(seconds){
  const s=Math.max(0,Math.min(60,Math.floor(Number(seconds)||0)));
  return '00:'+String(s).padStart(2,'0').replace(/^00:60$/,'01:00');
}
function makeFreshSignalTag(row){
  const remaining=freshSignalRemainingSeconds(row.createdAt);
  const tag=node('div','member-new-signal'+(remaining?'':' is-expired'));
  tag.setAttribute('aria-label',remaining?'New signal countdown':'Latest signal; 60-second alert ended');
  tag.title=remaining?'Signal alert only. Bookmaker odds may change.':'The 60-second signal alert has ended. Verify current bookmaker odds.';
  tag.append(node('strong','member-new-label',remaining?'NEW SIGNAL':'LATEST SIGNAL'),node('span','member-new-clock',freshClockText(remaining)));
  return tag;
}
function refreshFreshSignalClock(){
  const id=newestSignalId();
  const newest=(state.payload?.signals||[]).find(row=>String(row?.id)===id);
  const remaining=freshSignalRemainingSeconds(newest?.createdAt);
  document.querySelectorAll('.signal-row[data-signal-id]').forEach(tr=>{
    if(tr.dataset.signalId!==id){
      tr.classList.remove('is-fresh-signal');
      tr.querySelector('.member-new-signal')?.remove();
      return;
    }
    const active=remaining>0;
    tr.classList.toggle('is-fresh-signal',active);
    const tag=tr.querySelector('.member-new-signal');
    if(!tag)return;
    tag.classList.toggle('is-expired',!active);
    tag.setAttribute('aria-label',active?'New signal countdown':'Latest signal; 60-second alert ended');
    const label=tag.querySelector('.member-new-label');
    if(label)label.textContent=active?'NEW SIGNAL':'LATEST SIGNAL';
    const clock=tag.querySelector('.member-new-clock');
    if(clock)clock.textContent=freshClockText(remaining);
  });
}
function fmtOdds(v){
  const n=Number(v);
  return Number.isFinite(n)?'@'+n.toFixed(2):'—';
}
function fmtLine(row){
  if(row.line===null||row.line===undefined||row.line==='') return '';
  const n=Number(row.line);
  if(!Number.isFinite(n)) return String(row.line);
  const v=Number.isInteger(n)?String(n):String(Math.round(n*1000)/1000);
  return row.market==='AH'&&n>0?'+'+v:v;
}
function signalPeriod(row){
  // The signal's market period is not the current match half/minute.
  const declared=String(row?.period??'').trim().toUpperCase().replace(/[\s-]+/g,'_');
  const direct=declared==='FT'||declared==='FULL_TIME'?'FULL TIME':
    declared==='HT'||declared==='1H'||declared==='FIRST_HALF'||declared==='1ST_HALF'?'FIRST HALF':
    declared==='2H'||declared==='SECOND_HALF'?'SECOND HALF':null;
  const source=String(row?.sourceMarket??'').trim().toLowerCase();
  const keyPeriod=/^ft_/.test(source)?'FULL TIME':/^ht_/.test(source)?'FIRST HALF':/^2h_/.test(source)?'SECOND HALF':null;
  const label=String(row?.marketLabel??'').toUpperCase();
  const labelPeriod=/FIRST[\s-]*HALF|1ST[\s-]*HALF/.test(label)?'FIRST HALF':
    /SECOND[\s-]*HALF|2ND[\s-]*HALF/.test(label)?'SECOND HALF':
    /FULL[\s-]*TIME|90[\s-]*MIN/.test(label)?'FULL TIME':null;
  const known=[direct,keyPeriod,labelPeriod].filter(Boolean);
  return known.length&&known.some(x=>x!==known[0])?'PERIOD MISMATCH':
    known[0]||'PERIOD UNKNOWN';
}
function scoreText(v){
  if(typeof v==='string') return v||'—';
  if(!v||typeof v!=='object') return '—';
  const h=v.home, a=v.away;
  if(h===null||h===undefined||a===null||a===undefined) return '—';
  return String(h)+'-'+String(a);
}

function pairTotal(v){
  const h=Number(v?.home),a=Number(v?.away);
  return Number.isFinite(h)&&Number.isFinite(a)?h+a:null;
}
function cardsTotal(cards){
  if(!cards?.home||!cards?.away) return null;
  const vals=[cards.home.yellow,cards.home.red,cards.away.yellow,cards.away.red].map(Number);
  return vals.every(Number.isFinite)?vals.reduce((a,b)=>a+b,0):null;
}
function matchClockLabel(row){
  if(row.state==='FINISHED') return 'FT';
  if(row.state==='LIVE') return row.matchMinute==null?'LIVE':`LIVE ${row.matchMinute}'`;
  return row.state==='WAITING'?'WAITING':String(row.state||'—');
}
function displayScore(row){
  if(row.state==='FINISHED') return row.finalScore??row.mirrorScore??row.entryScore;
  return row.mirrorScore??row.entryScore;
}
function marketEvidence(row){
  const finished=row.state==='FINISHED';
  const prefix=finished?'FT':'LIVE';
  if(row.market==='CORNERS'){
    const c=(finished?row.finalCorners:null)??row.mirrorCorners??row.entryCorners;
    if(c?.home!=null&&c?.away!=null) return `${prefix} CORNERS ${c.home}-${c.away} = ${pairTotal(c)}`;
  }
  if(row.market==='CARDS'){
    const c=(finished?row.finalCards:null)??row.mirrorCards??row.entryCards;
    if(c?.home&&c?.away) return `${prefix} CARDS ${cardsText(c)}`;
  }
  if(row.market==='O/U'){
    const s=displayScore(row);
    const t=pairTotal(s);
    if(t!=null) return `${prefix} GOALS ${t}`;
  }
  if(row.market==='BTTS' && finished){
    const s=displayScore(row);
    if(s?.home!=null&&s?.away!=null) return `FT BTTS ${s.home>0&&s.away>0?'YES':'NO'}`;
  }
  return '';
}
function entryEvidence(row){
  const parts=[];
  const sc=scoreText(row.entryScore);
  if(sc!=='—') parts.push('Score '+sc);
  if(row.market==='CORNERS'&&row.entryCorners?.home!=null&&row.entryCorners?.away!=null){
    parts.push(`Corners ${row.entryCorners.home}-${row.entryCorners.away}=${pairTotal(row.entryCorners)}`);
  }else if(row.market==='CARDS'&&row.entryCards?.home&&row.entryCards?.away){
    parts.push('Cards '+cardsText(row.entryCards));
  }
  return parts.join(' · ');
}
function resultClass(result){
  if(result==='WIN'||result==='HALF_WIN') return 'win';
  if(result==='LOSS'||result==='HALF_LOSS') return 'loss';
  if(result==='PUSH') return 'push';
  return 'pending';
}
function statusClass(status){
  if(status==='LIVE') return 'live';
  if(status==='FINISHED') return 'finished';
  return 'pending';
}
function currentStats(){
  return state.payload?.summary?.[state.market]||{
    signals:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,winRate:null,pnl:0
  };
}

function renderTabs(){
  tabs.replaceChildren();
  for(const market of MARKET_ORDER){
    const s=state.payload.summary[market];
    const rate=Number(s.winRate);
    const rateTone=!Number.isFinite(rate)?'neutral':rate>=55?'good':rate<45?'bad':'mid';
    const pnl=Number(s.pnl||0);
    const pnlTone=pnl>0?'profit':pnl<0?'loss':'neutral';
    const btn=node('button','market-tab'+(state.market===market?' active':''));
    btn.type='button';
    btn.setAttribute('aria-pressed',state.market===market?'true':'false');

    const top=node('span','market-tab-top');
    top.append(node('strong','market-tab-name',market),node('span','market-tab-rate '+rateTone,fmtPct(s.winRate)));

    const bottom=node('span','market-tab-bottom');
    bottom.append(node('span','market-tab-pnl-label','P/L'),node('b','market-tab-pnl '+pnlTone,fmtPnl(s.pnl)));

    btn.append(top,bottom);
    btn.addEventListener('click',()=>{
      state.market=market;
      state.expandedFixtureId=null;
      state.expandedSignalId=null;
      render();
    });
    tabs.append(btn);
  }
}

function renderSummary(){
  const s=currentStats();
  const rate=Number(s.winRate);
  const rateClass=!Number.isFinite(rate)?'neutral':rate>=55?'rate-good':rate<45?'rate-bad':'rate-mid';
  const items=[
    ['SIGNALS',s.signals,'signals'],
    ['WIN',s.win,'win'],
    ['LOSS',s.loss,'loss'],
    ['PUSH',s.push,'push'],
    ['HALF WIN',s.halfWin,'half-win'],
    ['HALF LOSS',s.halfLoss,'half-loss'],
    ['PENDING',s.pending,'pending'],
    ['WIN RATE',fmtPct(s.winRate),rateClass]
  ];
  summary.replaceChildren();
  for(const [label,value,kind] of items){
    const box=node('div','stat summary-stat '+kind);
    box.append(node('span','',label),node('b','',String(value)));
    summary.append(box);
  }
  const pnlKind=s.pnl>0?'pos':s.pnl<0?'neg':'neutral';
  const pnlBox=node('div','stat summary-stat pnl-card '+pnlKind);
  pnlBox.append(node('span','','P/L TODAY'),node('b','pnl '+pnlKind,fmtPnl(s.pnl)));
  summary.append(pnlBox);
}

function filteredRows(){
  return state.payload.signals.filter(row=>{
    if(state.market!=='ALL' && row.market!==state.market) return false;
    return true;
  });
}

function td(text,cls){
  const cell=node('td',cls||'');
  cell.textContent=text??'—';
  return cell;
}

function toggleDetail(row){
  if(state.expandedFixtureId===row.fixtureId && state.expandedSignalId===row.id){
    state.expandedFixtureId=null;
    state.expandedSignalId=null;
  }else{
    state.expandedFixtureId=row.fixtureId;
    state.expandedSignalId=row.id;
  }
  renderRows();
}

function makeSignalRow(row){
  const tr=document.createElement('tr');
  tr.className='signal-row'+(state.expandedSignalId===row.id?' expanded':'');
  tr.tabIndex=0;
  tr.setAttribute('role','button');
  tr.setAttribute('aria-expanded',state.expandedSignalId===row.id?'true':'false');
  tr.title='Open Featured Match and Event Flow';
  const isLatest=String(row.id)===newestSignalId();
  if(isLatest){
    tr.dataset.signalId=String(row.id);
    if(freshNewestSignal(row))tr.classList.add('is-fresh-signal');
  }

  const time=td(row.signalTime,'signal-time');
  time.append(node('span','expand-glyph',state.expandedSignalId===row.id?'⌃':'⌄'));
  if(isLatest)time.append(makeFreshSignalTag(row));
  tr.append(time);

  const match=node('td','match');
  match.append(
    node('strong','',row.home+' - '+row.away),
    node('small','',row.league),
    node('small','detail-hint','Featured Match · Event Flow')
  );
  tr.append(match);

  const live=document.createElement('td');
  live.className='live-score-cell';
  live.append(node('span','badge '+statusClass(row.state),matchClockLabel(row)));
  live.append(node('strong','live-score-value',scoreText(displayScore(row))));
  const evidence=marketEvidence(row);
  if(evidence) live.append(node('small','market-evidence '+(row.state==='LIVE'?'live-evidence':row.state==='FINISHED'?'ft-evidence':''),evidence));
  tr.append(live);

  tr.append(td(row.market));
  const choice=td(undefined,'signal-pick');
  const lineText=fmtLine(row);
  choice.append(node('strong','signal-choice',String(row.selection||'—')+(lineText?' '+lineText:'')));
  const marketPeriod=signalPeriod(row);
  choice.append(node('small','signal-market-period'+(marketPeriod.startsWith('PERIOD ')?' period-warning':''),marketPeriod));
  tr.append(choice);
  tr.append(td(fmtOdds(row.odds),'odds-readonly'));

  const entry=document.createElement('td');
  entry.className='entry-cell';
  entry.append(node('strong','',row.signalMinute==null?'—':row.signalMinute+"'"));
  const entryInfo=entryEvidence(row);
  if(entryInfo) entry.append(node('small','',entryInfo));
  tr.append(entry);

  tr.append(td(row.bookmaker));

  const result=document.createElement('td');
  result.className='result-cell';
  result.append(node('span','badge '+resultClass(row.result),String(row.result||'PENDING').replaceAll('_',' ')));
  tr.append(result);

  const p=Number(row.pnl||0);
  const pnlState=row.result==='PENDING'||row.result==='PUSH'||row.result==='VOID'?'neutral':(p>0?'pos':p<0?'neg':'neutral');
  tr.append(td(fmtPnl(p),'pnl '+pnlState));

  tr.addEventListener('click',()=>toggleDetail(row));
  tr.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleDetail(row);}
  });
  return tr;
}

function metricValue(pair){
  const h=pair?.home, a=pair?.away;
  const hs=h===null||h===undefined?'—':String(h);
  const as=a===null||a===undefined?'—':String(a);
  return hs+' - '+as;
}

function statGrid(stats,corners,cards){
  const grid=node('div','insight-stats');
  const metrics=[
    ['ATTACKS',stats?.attacks],
    ['DANGEROUS',stats?.dangerousAttacks],
    ['SOT',stats?.shotsOnTarget],
    ['SHOT OFF',stats?.shotsOffTarget],
    ['CORNERS',corners],
    ['POSSESSION',stats?.possession]
  ];
  for(const [label,value] of metrics){
    const item=node('div','insight-stat');
    item.append(node('span','',label),node('b','',metricValue(value)));
    grid.append(item);
  }
  const card=node('div','insight-stat');
  const home=cards?.home,away=cards?.away;
  const cardText=home&&away
    ? `${home.yellow??0}Y/${home.red??0}R - ${away.yellow??0}Y/${away.red??0}R`
    : '—';
  card.append(node('span','','CARDS H - A'),node('b','',cardText));
  grid.append(card);
  return grid;
}

function signalChips(fixtureId){
  const wrap=node('div','signal-chips');
  const signals=state.payload.signals.filter(s=>s.fixtureId===fixtureId).sort((a,b)=>b.createdAt-a.createdAt);
  for(const s of signals){
    const chip=node('button','signal-chip'+(s.id===state.expandedSignalId?' active':''));
    chip.type='button';
    chip.textContent=`${s.signalMinute??'—'}' · ${s.market} · ${signalPeriod(s)} · ${s.selection}${fmtLine(s)?' '+fmtLine(s):''} ${fmtOdds(s.odds)}`;
    chip.addEventListener('click',e=>{
      e.stopPropagation();
      state.expandedSignalId=s.id;
      renderRows();
    });
    wrap.append(chip);
  }
  return wrap;
}

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function svgNode(tag,attrs={}){
  const el=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,String(v));
  return el;
}
function pressurePoints(pressure,current){
  const out=[];
  for(const p of Array.isArray(pressure)?pressure:[]){
    const minute=Number(p?.minute),home=Number(p?.home),away=Number(p?.away);
    if(!Number.isFinite(minute)||!Number.isFinite(home)||!Number.isFinite(away)||minute<0||minute>current+3) continue;
    const row={minute,home:clamp(home,1,100),away:clamp(away,1,100)};
    const last=out[out.length-1];
    if(last&&Math.abs(last.minute-minute)<.001) out[out.length-1]=row;
    else out.push(row);
  }
  return out.sort((a,b)=>a.minute-b.minute);
}
function pressureAt(points,minute){
  if(!points.length) return {home:50,away:50};
  let a=points[0],b=points[points.length-1];
  for(let i=0;i<points.length;i++){
    if(points[i].minute<=minute) a=points[i];
    if(points[i].minute>=minute){b=points[i];break}
  }
  if(a===b||Math.abs(b.minute-a.minute)<.001) return {home:a.home,away:a.away};
  const t=clamp((minute-a.minute)/(b.minute-a.minute),0,1);
  return {home:a.home+(b.home-a.home)*t,away:a.away+(b.away-a.away)*t};
}
function eventShortType(type){
  const x=String(type||'').toLowerCase();
  if(x.includes('goal')) return 'G';
  if(x.includes('red')) return 'R';
  if(x.includes('yellow')) return 'Y';
  if(x.includes('corner')) return 'C';
  if(x.includes('penalty')) return 'P';
  if(x.includes('sub')) return 'S';
  return '•';
}
function eventSide(e,featured){
  if(e?.side==='home'||e?.side==='away') return e.side;
  const team=String(e?.team||'').trim().toLowerCase();
  if(team&&team===String(featured?.home||'').trim().toLowerCase()) return 'home';
  if(team&&team===String(featured?.away||'').trim().toLowerCase()) return 'away';
  return null;
}
function historyDerivedEvents(rows){
  const src=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>(Number(a?.minute)||0)-(Number(b?.minute)||0)||(Number(a?.at)||0)-(Number(b?.at)||0));
  const out=[];
  let prev=null;
  const val=(o,k)=>Number(o?.[k])||0;
  const card=(o,side,k)=>Number(o?.[side]?.[k])||0;
  for(const row of src){
    if(!prev){prev=row;continue}
    const minute=Number(row?.minute);
    if(!Number.isFinite(minute)){prev=row;continue}
    for(const side of ['home','away']){
      const goalDiff=val(row?.goals,side)-val(prev?.goals,side);
      const cornerDiff=val(row?.corners,side)-val(prev?.corners,side);
      const yellowDiff=card(row?.cards,side,'yellow')-card(prev?.cards,side,'yellow');
      const redDiff=card(row?.cards,side,'red')-card(prev?.cards,side,'red');
      for(let i=0;i<Math.max(0,goalDiff);i++) out.push({minute,type:'Goal',side});
      for(let i=0;i<Math.max(0,cornerDiff);i++) out.push({minute,type:'Corner',side});
      for(let i=0;i<Math.max(0,yellowDiff);i++) out.push({minute,type:'Yellow card',side});
      for(let i=0;i<Math.max(0,redDiff);i++) out.push({minute,type:'Red card',side});
    }
    prev=row;
  }
  return out;
}
function eventFlowChart(detail,fixtureId){
  const wrap=node('div','member-flow');
  const pressure=detail?.eventFlow?.pressure||[];
  const featured=detail?.featured||null;
  const signals=state.payload.signals.filter(s=>s.fixtureId===fixtureId);
  const maxPressureMinute=pressure.reduce((m,p)=>Math.max(m,Number(p?.minute)||0),0);
  const maxSignalMinute=signals.reduce((m,s)=>Math.max(m,Number(s?.signalMinute)||0),0);
  const historyEvents=historyDerivedEvents(detail?.eventFlow?.rows||[]);
  const liveEvents=Array.isArray(featured?.events)?featured.events:[];
  const iconLib=globalThis.Ball46EventIcons;
  const events=iconLib
    ? iconLib.merge(historyEvents,liveEvents,e=>eventSide(e,featured))
    : [...historyEvents,...liveEvents].filter(e=>Number.isFinite(Number(e?.minute)));
  const maxEventMinute=events.reduce((m,e)=>Math.max(m,Number(e?.minute)||0),0);
  const current=Math.max(1,Math.round(Math.max(Number(featured?.minute)||0,maxPressureMinute,maxSignalMinute,maxEventMinute)));
  const points=pressurePoints(pressure,current);

  const head=node('div','expand-card-head member-flow-head');
  const left=node('div','');
  left.append(node('span','','EVENT FLOW'),node('b','',`0' → ${current}' · ${scoreText(featured?.score)}`));
  head.append(left,node('small','','Attack pressure · 1–100% · Mirrored'));
  wrap.append(head);

  if(!points.length){
    wrap.append(node('div','insight-empty',
      events.length?'Attack pressure is unavailable. Available match events are listed below.':'Event Flow is not available for this match.'));
    if(events.length&&iconLib){
      const timeline=node('div','member-flow-fallback-events');
      for(const e of events.slice(0,30)){
        const label=iconLib.label(e,featured?.home||'HOME',featured?.away||'AWAY');
        const item=node('span','member-flow-fallback-event',iconLib.icon(iconLib.kind(e))+' '+label);
        item.title=label;timeline.append(item);
      }
      wrap.append(timeline);
    }
    return wrap;
  }

  const last=points[points.length-1];
  const legend=node('div','expand-flow-legend');
  const homeLeg=node('span','home'); homeLeg.append(node('i',''),document.createTextNode((featured?.home||'HOME')+' '),node('b','',Math.round(last.home)+'%'));
  const awayLeg=node('span','away'); awayLeg.append(node('i',''),document.createTextNode((featured?.away||'AWAY')+' '),node('b','',Math.round(last.away)+'%'));
  legend.append(homeLeg,awayLeg,node('small','',points.length+' points · Ball46 mirror'));
  wrap.append(legend);

  const chart=node('div','expand-flow-chart member-flow-chart');
  const w=1000,h=232,pad={left:42,right:18,top:14,bottom:30};
  const xFor=minute=>pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right);
  const yFor=value=>pad.top+((100-clamp(value,1,100))/99)*(h-pad.top-pad.bottom);
  const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none',role:'img','aria-label':'Ball46 mirrored Event Flow'});

  const defs=svgNode('defs');
  const gh=svgNode('linearGradient',{id:'member-home-'+fixtureId,x1:'0',y1:'0',x2:'0',y2:'1'});
  gh.append(svgNode('stop',{offset:'0%','stop-color':'#59C7FF','stop-opacity':'.22'}),svgNode('stop',{offset:'100%','stop-color':'#59C7FF','stop-opacity':'0'}));
  const ga=svgNode('linearGradient',{id:'member-away-'+fixtureId,x1:'0',y1:'0',x2:'0',y2:'1'});
  ga.append(svgNode('stop',{offset:'0%','stop-color':'#A78BFA','stop-opacity':'.20'}),svgNode('stop',{offset:'100%','stop-color':'#A78BFA','stop-opacity':'0'}));
  defs.append(gh,ga); svg.append(defs);

  for(const v of [100,75,50,25,1]){
    const y=yFor(v);
    svg.append(svgNode('line',{x1:pad.left,y1:y,x2:w-pad.right,y2:y,class:'expand-flow-grid'+(v===50?' mid':'')}));
    const t=svgNode('text',{x:pad.left-7,y:y+3,'text-anchor':'end',class:'expand-flow-axis'});t.textContent=v+'%';svg.append(t);
  }
  const step=current<=30?5:current<=60?10:15;
  const marks=[0];for(let m=step;m<current;m+=step)marks.push(m);if(!marks.includes(current))marks.push(current);
  for(const m of marks){
    const x=xFor(m);
    svg.append(svgNode('line',{x1:x,y1:pad.top,x2:x,y2:h-pad.bottom,class:'expand-flow-grid v'}));
    const t=svgNode('text',{x,y:h-7,'text-anchor':'middle',class:'expand-flow-axis'});t.textContent=m+"'";svg.append(t);
  }

  const path=(key)=>points.map((p,i)=>(i?'L':'M')+' '+xFor(p.minute).toFixed(1)+' '+yFor(p[key]).toFixed(1)).join(' ');
  const area=(key)=>{
    const base=yFor(1),first=xFor(points[0].minute),lastX=xFor(points[points.length-1].minute);
    return 'M '+first.toFixed(1)+' '+base.toFixed(1)+' '+points.map(p=>'L '+xFor(p.minute).toFixed(1)+' '+yFor(p[key]).toFixed(1)).join(' ')+' L '+lastX.toFixed(1)+' '+base.toFixed(1)+' Z';
  };
  svg.append(
    svgNode('path',{d:area('home'),fill:'url(#member-home-'+fixtureId+')',class:'expand-flow-area'}),
    svgNode('path',{d:area('away'),fill:'url(#member-away-'+fixtureId+')',class:'expand-flow-area'}),
    svgNode('path',{d:path('home'),class:'expand-flow-line home'}),
    svgNode('path',{d:path('away'),class:'expand-flow-line away'})
  );

  svg.append(
    svgNode('circle',{cx:xFor(last.minute),cy:yFor(last.home),r:'2.4',class:'expand-flow-end home'}),
    svgNode('circle',{cx:xFor(last.minute),cy:yFor(last.away),r:'2.4',class:'expand-flow-end away'})
  );

  for(const s of signals){
    const minute=Number(s.signalMinute);
    if(!Number.isFinite(minute)||minute<0||minute>current+.75) continue;
    const p=pressureAt(points,minute);
    const pick=String(s.selection||'').toLowerCase();
    const side=pick.includes('home')?'home':pick.includes('away')?'away':null;
    const y=yFor(side?p[side]:(p.home+p.away)/2),x=xFor(minute);
    const title=[minute+"'",s.market,signalPeriod(s),s.selection,fmtLine(s),fmtOdds(s.odds),s.bookmaker].filter(Boolean).join(' · ');
    const g=svgNode('g',{class:'member-flow-signal'});
    const tt=svgNode('title');tt.textContent=title;g.append(tt);
    g.append(svgNode('line',{x1:x,y1:pad.top,x2:x,y2:h-pad.bottom,class:'member-flow-signal-line'}));
    g.append(svgNode('circle',{cx:x,cy:y,r:'6.1',class:'member-flow-signal-ring'}));
    g.append(svgNode('circle',{cx:x,cy:y,r:'3.1',class:'member-flow-signal-dot'}));

    const tagW=92,tagH=19,cut=6;
    const tagX=clamp(x+9,pad.left+5,w-pad.right-tagW-2);
    const tagY=clamp(y-22,pad.top+2,h-pad.bottom-tagH-2);
    const tag=svgNode('g',{class:'member-flow-signal-tag'});
    const plate=svgNode('path',{
      d:[
        'M',tagX+cut,tagY,
        'H',tagX+tagW,
        'V',tagY+tagH-cut,
        'L',tagX+tagW-cut,tagY+tagH,
        'H',tagX,
        'V',tagY+cut,
        'Z'
      ].join(' '),
      class:'member-flow-signal-plate'
    });
    const accent=svgNode('rect',{x:tagX+5,y:tagY+5,width:'2.4',height:tagH-10,rx:'1.2',class:'member-flow-signal-accent'});
    const label=svgNode('text',{x:tagX+12,y:tagY+12.6,class:'member-flow-signal-label'});
    label.textContent='SIGNAL // '+minute+"'";
    tag.append(plate,accent,label);
    g.append(tag);
    svg.append(g);
  }

  // HTML overlay keeps icons circular and tap targets usable on mobile:
  // unlike SVG markers, its glyphs do not stretch with preserveAspectRatio=none.
  const plot=node('div','member-flow-plot');
  plot.append(svg);
  const readout=node('div','member-flow-event-readout','Select an event icon for minute, team and details.');
  if(iconLib){
    const mobile=globalThis.matchMedia?.('(max-width:680px)')?.matches||false;
    const markers=iconLib.group(events,current,mobile);
    for(const marker of markers){
      const e=marker.primary,minute=Number(e.minute),side=marker.side;
      const p=pressureAt(points,minute);
      const y=yFor(side==='home'?p.home:side==='away'?p.away:(p.home+p.away)/2);
      const x=xFor(minute);
      const yOffset=side==='home'?-15:side==='away'?15:-14;
      const pin=node('button','member-flow-pin '+marker.kind+' '+side);
      pin.type='button';
      pin.style.left=clamp(x/w*100,4.4,97)+'%';
      pin.style.top=clamp((y+yOffset)/h*100,7,88)+'%';
      const descriptions=marker.events.map(item=>iconLib.label(item,featured?.home||'HOME',featured?.away||'AWAY'));
      const description=descriptions.join(' | ');
      pin.setAttribute('aria-label',description);
      pin.title=description;
      pin.dataset.tooltip=iconLib.label(e,featured?.home||'HOME',featured?.away||'AWAY')+
        (marker.events.length>1?' · +'+(marker.events.length-1)+' more':'');
      const glyph=node('span','member-flow-pin-glyph');
      if(marker.kind==='yellow'||marker.kind==='red'){
        glyph.append(node('span','member-flow-card-icon '+marker.kind));
      }else glyph.textContent=iconLib.icon(marker.kind);
      pin.append(glyph);
      if(marker.events.length>1)pin.append(node('span','member-flow-pin-count','+'+(marker.events.length-1)));
      pin.addEventListener('click',()=>{
        plot.querySelectorAll('.member-flow-pin.selected').forEach(n=>n.classList.remove('selected'));
        pin.classList.add('selected');
        readout.textContent=description;
        readout.classList.add('visible');
      });
      plot.append(pin);
    }
  }else{
    // If the optional icon asset fails to load, preserve the original letter markers.
    for(const e of events){
      const minute=Number(e?.minute);
      if(!Number.isFinite(minute)||minute<0||minute>current+.75)continue;
      const p=pressureAt(points,minute),side=eventSide(e,featured);
      const x=xFor(minute),y=yFor(side?p[side]:(p.home+p.away)/2);
      const label=svgNode('text',{x,y:y-7,'text-anchor':'middle',class:'member-flow-event-label'});
      label.textContent=eventShortType(e.type);svg.append(label);
    }
  }

  chart.append(plot);wrap.append(chart);
  if(iconLib&&events.length)wrap.append(readout);

  const key=node('div','member-flow-key');
  key.append(node('span','signal','● SIGNAL'),
    node('span','event','⚽ Goal'),
    node('span','event','🚩 Corner'),
    node('span','event','🟨 Yellow'),
    node('span','event','🟥 Red'),
    node('span','event','◎ Penalty'));
  if(events.some(e=>e.approximate))key.append(node('span','history','* Snapshot events have approximate minutes'));
  wrap.append(key);
  return wrap;
}

function halfScoreText(score){
  if(!score||typeof score!=='object'||score.halfHome==null||score.halfAway==null) return '—';
  return String(score.halfHome)+'-'+String(score.halfAway);
}
function cardsText(cards){
  if(!cards?.home||!cards?.away) return '—';
  return `${cards.home.yellow??0}Y/${cards.home.red??0}R · ${cards.away.yellow??0}Y/${cards.away.red??0}R`;
}

// Self-contained SVG match icons; no asset requests or new API connections.
function premiumFactIcon(kind){
  const svg=svgNode('svg',{viewBox:'0 0 64 64',width:42,height:42,'aria-hidden':'true',class:'premium-fact-icon'});
  const add=(tag,attrs,parent=svg)=>{const el=svgNode(tag,attrs);parent.append(el);return el;};
  if(kind==='clock'){
    add('circle',{cx:32,cy:34,r:25,fill:'#132B44',stroke:'#59C7FF','stroke-width':3});
    add('circle',{cx:32,cy:34,r:20,fill:'#0B1A2A',stroke:'#93B7CF','stroke-width':1});
    for(let i=0;i<12;i++){const a=i*Math.PI/6;add('line',{x1:32+16*Math.sin(a),y1:34-16*Math.cos(a),x2:32+19*Math.sin(a),y2:34-19*Math.cos(a),stroke:'#D9ECF6','stroke-width':i%3===0?2:1});}
    add('path',{d:'M32 19V34L43 40',fill:'none',stroke:'#59C7FF','stroke-width':3,'stroke-linecap':'round'});
    add('circle',{cx:32,cy:34,r:2.5,fill:'#fff'});
    add('rect',{x:26,y:4,width:12,height:5,rx:2,fill:'#D9ECF6'});
  }else if(kind==='corner'){
    add('path',{d:'M9 54H56M9 54V7',fill:'none',stroke:'#DFEAF2','stroke-width':2.8,'stroke-linecap':'round'});
    add('path',{d:'M12 10L48 17L12 31Z',fill:'#FF5265',stroke:'#FFA2A9','stroke-width':1});
    add('path',{d:'M9 40Q23 40 23 54',fill:'none',stroke:'#F2F7FA','stroke-width':2});
    add('path',{d:'M23 54H56',stroke:'#6AAB78','stroke-width':3});
  }else if(kind==='cards'){
    add('rect',{x:8,y:13,width:30,height:42,rx:3,fill:'#FFD735',stroke:'#FFF3A0','stroke-width':1.5,transform:'rotate(-9 23 34)'});
    add('rect',{x:29,y:9,width:27,height:42,rx:3,fill:'#F04455',stroke:'#FF9BA6','stroke-width':1.5,transform:'rotate(9 43 30)'});
  }else if(kind==='goal'){
    add('path',{d:'M7 53V12L13 8H57V53Z',fill:'none',stroke:'#E5F3F8','stroke-width':3,'stroke-linejoin':'round'});
    for(let p=20;p<57;p+=9)add('line',{x1:p,y1:12,x2:p,y2:52,stroke:'#819AAE','stroke-width':.9});
    for(let p=20;p<53;p+=9)add('line',{x1:8,y1:p,x2:57,y2:p,stroke:'#819AAE','stroke-width':.9});
    add('circle',{cx:32,cy:45,r:9,fill:'#F7FAFC',stroke:'#9CB1C4','stroke-width':1});
    add('path',{d:'M32 39L37 43L35 49H29L27 43Z',fill:'#182432'});
  }else if(kind==='ball'){
    // Compact orange football icon, preserving the original layout and size.
    add('circle',{cx:32,cy:32,r:24,fill:'#FF9F2E',stroke:'#E07A00','stroke-width':1.8});
    add('path',{d:'M32 22L39 27L36.5 35L27.5 35L25 27Z',fill:'#FFF4E6',stroke:'#FFF4E6','stroke-width':1,'stroke-linejoin':'round'});
    add('path',{d:'M32 22L28 15M32 22L36 15M25 27L17 25M39 27L47 25M27.5 35L22 43M36.5 35L42 43',fill:'none',stroke:'#FFF4E6','stroke-width':1.6,'stroke-linecap':'round'});
    add('path',{d:'M22 18C19 20 17 23 16.5 27',fill:'none',stroke:'#FFD7A3','stroke-width':2,'stroke-linecap':'round',opacity:.8});
  }else{
    add('rect',{x:6,y:14,width:52,height:39,rx:5,fill:'#1B533C',stroke:'#D5E8DF','stroke-width':2});
    add('path',{d:'M32 14V53M6 33.5H58M6 25H18V42H6M58 25H46V42H58',stroke:'#DCEFE5','stroke-width':1.4,fill:'none'});
    add('circle',{cx:32,cy:33.5,r:9,stroke:'#DCEFE5','stroke-width':1.4,fill:'none'});
    add('circle',{cx:53,cy:11,r:6,fill:'#FF4A64',stroke:'#FF9AA9','stroke-width':1.2});
  }
  return svg;
}

function featuredHorizontal(detail,selected){
  const f=detail?.featured;
  const card=node('section','featured-horizontal');
  const finished=selected.state==='FINISHED';
  const shownScore=finished
    ? (selected.finalScore??selected.mirrorScore??selected.entryScore)
    : (f?.score??selected.mirrorScore??selected.entryScore);
  const shownMinute=finished
    ? 'FT'
    : (f?.minute!=null?`LIVE ${f.minute}'`:matchClockLabel(selected));
  const shownCorners=finished
    ? (selected.finalCorners??selected.mirrorCorners??selected.entryCorners)
    : (f?.corners??selected.mirrorCorners??selected.entryCorners);
  const shownCards=finished
    ? (selected.finalCards??selected.mirrorCards??selected.entryCards)
    : (f?.cards??selected.mirrorCards??selected.entryCards);

  const meta=node('div','featured-h-meta');
  meta.append(node('span','eyebrow','FEATURED MATCH'),node('strong','',f?.league||selected.league));
  meta.append(node('span','badge '+statusClass(selected.state),shownMinute));

  const score=node('div','featured-h-score');
  const home=node('div','team home');home.append(node('span','','HOME'),node('b','',f?.home||selected.home));
  const center=node('div','score-center');
  center.append(node('strong','',scoreText(shownScore)),node('small','',shownMinute));
  const away=node('div','team away');away.append(node('span','','AWAY'),node('b','',f?.away||selected.away));
  score.append(home,center,away);

  const signal=node('div','featured-h-signal');
  const entryContext=[`Entry score ${scoreText(selected.entryScore)}`];
  if(selected.market==='CORNERS'&&selected.entryCorners?.home!=null&&selected.entryCorners?.away!=null){
    entryContext.push(`Entry corners ${selected.entryCorners.home}-${selected.entryCorners.away}`);
    const total=pairTotal(selected.entryCorners);
    if(total!=null) entryContext.push(`Total ${total}`);
  }
  signal.append(
    node('span','','ENTRY'),
    node('b','',`${selected.signalMinute??'—'}' · ${selected.market} · ${signalPeriod(selected)} · ${selected.selection}${fmtLine(selected)?' '+fmtLine(selected):''} · ${fmtOdds(selected.odds)} · ${selected.bookmaker} · ${entryContext.join(' · ')}`)
  );

  const stats=f?.statistics||selected.entryStats;
  const statRow=node('div','featured-h-stats premium-match-stats');
  statRow.setAttribute('aria-label','Live match statistics: Home versus Away');
  const heading=node('div','premium-stats-heading');
  heading.append(node('strong','','LIVE MATCH STATISTICS'));
  const legend=node('div','premium-stats-legend');
  legend.append(node('span','home','HOME'),node('span','away','AWAY'));
  heading.append(legend);statRow.append(heading);
  for(const [label,value,percent] of [
    ['Shots on Target',stats?.shotsOnTarget,false],
    ['Shots off Target',stats?.shotsOffTarget,false],
    ['Total Attacks',stats?.attacks,false],
    ['Dangerous Attacks',stats?.dangerousAttacks,false],
    ['Ball Possession',stats?.possession,true]
  ]){
    const home=Number(value?.home),away=Number(value?.away);
    const valid=value?.home!=null&&value?.away!=null&&Number.isFinite(home)&&Number.isFinite(away)&&home>=0&&away>=0;
    const total=valid?home+away:0;
    const homeWidth=valid?(total?home/total*100:50):0;
    const awayWidth=valid?(total?away/total*100:50):0;
    const row=node('div','premium-stat-row');
    row.append(node('span','premium-stat-title',label));
    const comparison=node('div','premium-stat-comparison');
    const left=node('b','premium-stat-value home',valid?String(home)+(percent?'%':''):'—');
    const right=node('b','premium-stat-value away',valid?String(away)+(percent?'%':''):'—');
    const tracks=node('div','premium-stat-tracks');
    const homeTrack=node('div','premium-stat-track home');
    const awayTrack=node('div','premium-stat-track away');
    const homeBar=node('i','premium-stat-bar');
    const awayBar=node('i','premium-stat-bar');
    homeBar.style.width=homeWidth+'%';awayBar.style.width=awayWidth+'%';
    homeTrack.append(homeBar);awayTrack.append(awayBar);tracks.append(homeTrack,awayTrack);
    comparison.append(left,tracks,right);row.append(comparison);statRow.append(row);
  }

  const sideFacts=node('div','premium-side-facts-panel');
  sideFacts.setAttribute('aria-label','Match facts');
  const scored=shownScore&&typeof shownScore==='object'&&shownScore.home!=null&&shownScore.away!=null
    ? Number(shownScore.home)+Number(shownScore.away):null;
  const goals=Number.isFinite(scored)?String(scored):'—';
  const matchState=finished?'FINISHED':selected.state==='LIVE'?shownMinute:matchClockLabel(selected);
  const factsData=[
    ['HALF-TIME',halfScoreText(shownScore),'clock','First-half result'],
    ['CORNERS',metricValue(shownCorners),'corner','Corner kicks'],
    ['CARDS',cardsText(shownCards),'cards','Home · Away'],
    ['MARKET',marketEvidence(selected)||'—','goal','Signal market'],
    ['TOTAL GOALS',goals,'ball','Goals scored'],
    ['MATCH STATUS',matchState,'stadium',finished?'Full time':'Match status']
  ];
  for(const [label,value,kind,sub] of factsData){
    const item=node('div','premium-side-fact premium-fact-'+kind);
    const top=node('div','premium-fact-top');
    top.append(node('span','premium-side-fact-label',label),premiumFactIcon(kind));
    item.append(top,node('b','premium-side-fact-value',value),node('small','premium-fact-sub',sub));
    sideFacts.append(item);
  }
  const lower=node('div','featured-h-lower');
  lower.append(statRow,sideFacts);
  card.append(meta,score,signal,lower);
  return card;
}

function renderInsight(host,fixtureId){
  host.replaceChildren();
  const selected=state.payload.signals.find(s=>s.id===state.expandedSignalId)
    ||state.payload.signals.find(s=>s.fixtureId===fixtureId);
  if(!selected) return;

  const detail=state.detailCache.get(fixtureId);
  host.append(signalChips(fixtureId));

  if(!detail){
    host.append(featuredHorizontal(null,selected));
    host.append(node('div','insight-loading','Loading Featured Match and Event Flow from Ball46 Mirror…'));
    return;
  }

  host.append(featuredHorizontal(detail,selected));
  host.append(eventFlowChart(detail,fixtureId));

  if(!detail.featured){
    host.append(node('div','insight-note','Match is no longer on the current live board. Featured Match falls back to the recorded Signal snapshot; Event Flow remains mirrored from Ball46 history when available.'));
  }
}

async function ensureDetail(fixtureId){
  const host=document.querySelector('[data-insight-fixture="'+CSS.escape(fixtureId)+'"]');
  if(!host) return;
  renderInsight(host,fixtureId);
  if(state.detailCache.has(fixtureId)) return;
  if(state.detailPromises.has(fixtureId)) return state.detailPromises.get(fixtureId);

  const promise=fetch('/api/member/match?fixtureId='+encodeURIComponent(fixtureId),{cache:'no-store'})
    .then(async r=>{
      const data=await r.json();
      if(!r.ok||data?.ok!==true) throw new Error(data?.error||'MATCH_DETAIL_UNAVAILABLE');
      state.detailCache.set(fixtureId,data);
      const currentHost=document.querySelector('[data-insight-fixture="'+CSS.escape(fixtureId)+'"]');
      if(currentHost) renderInsight(currentHost,fixtureId);
      return data;
    })
    .catch(()=>{
      const currentHost=document.querySelector('[data-insight-fixture="'+CSS.escape(fixtureId)+'"]');
      if(currentHost){
        const msg=node('div','insight-note','Featured Match / Event Flow is temporarily unavailable. Signal snapshot remains accurate.');
        currentHost.append(msg);
      }
    })
    .finally(()=>state.detailPromises.delete(fixtureId));
  state.detailPromises.set(fixtureId,promise);
  return promise;
}

function renderRows(){
  const rows=filteredRows();
  rowsEl.replaceChildren();
  empty.hidden=rows.length>0;
  let detailInserted=false;

  for(const row of rows){
    rowsEl.append(makeSignalRow(row));
    if(!detailInserted && state.expandedSignalId===row.id){
      detailInserted=true;
      const detailTr=document.createElement('tr');
      detailTr.className='signal-detail-row';
      const cell=document.createElement('td');
      cell.colSpan=10;
      const host=node('div','match-insight');
      host.dataset.insightFixture=row.fixtureId;
      cell.append(host);
      detailTr.append(cell);
      rowsEl.append(detailTr);
    }
  }

  if(detailInserted && state.expandedFixtureId) ensureDetail(state.expandedFixtureId);
}

function render(){renderTabs();renderSummary();renderRows();}

async function refreshExpandedDetail(){
  const fixtureId=state.expandedFixtureId;
  if(!fixtureId || document.hidden) return;
  try{
    const r=await fetch('/api/member/match?fixtureId='+encodeURIComponent(fixtureId)+'&live=1',{cache:'no-store'});
    const data=await r.json();
    if(!r.ok||data?.ok!==true) return;
    state.detailCache.set(fixtureId,data);
    const host=document.querySelector('[data-insight-fixture="'+CSS.escape(fixtureId)+'"]');
    if(host) renderInsight(host,fixtureId);
  }catch{}
}

async function refreshLiveMirror(){
  if(document.hidden || !state.payload) return;
  try{
    const r=await fetch('/api/member/daily?live=1',{cache:'no-store'});
    const daily=await r.json();
    if(!r.ok||daily?.ok!==true) return;
    state.payload=daily;
    const livePill=qs('.live-pill');
    if(livePill) livePill.textContent='TODAY · '+daily.signalCount+' SIGNALS';
    render();
    await refreshExpandedDetail();
  }catch{}
}

function formatAccessDate(value){
  if(value===null||value===undefined||value==='') return '';
  let d;
  if(typeof value==='number'){
    d=new Date(value<1e12?value*1000:value);
  }else if(/^\d+$/.test(String(value))){
    const n=Number(value); d=new Date(n<1e12?n*1000:n);
  }else{
    d=new Date(value);
  }
  if(Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'})
    .format(d).replace(/ /g,' ').toUpperCase();
}

function memberAccessLabel(member){
  const status=String(member?.status||'').toUpperCase();
  const role=String(member?.role||'').toUpperCase();
  const accessType=String(member?.accessType||'').toUpperCase();
  const periodEnd=member?.currentPeriodEnd??member?.expiresAt??member?.expiryAt??null;
  const date=formatAccessDate(periodEnd);

  if(role==='OWNER' && accessType==='LIFETIME') return 'OWNER · LIFETIME';
  if(accessType==='LIFETIME') return (status||'ACTIVE')+' · LIFETIME';
  if(['PAST_DUE','UNPAID','PAYMENT_DUE'].includes(status)) return 'PAYMENT DUE';
  if(['CANCELED','CANCELLED','EXPIRED'].includes(status)) return date?'EXPIRED · '+date:'EXPIRED';
  if(status==='ACTIVE' && member?.cancelAtPeriodEnd===true) return date?'ACTIVE · EXPIRES '+date:'ACTIVE · EXPIRES';
  if(status==='ACTIVE' && date) return 'ACTIVE · RENEWS '+date;
  return 'MEMBER · '+(status||'ACTIVE');
}

async function boot(){
  const [sessionRes,dailyRes]=await Promise.all([
    fetch('/api/member/session',{cache:'no-store'}),
    fetch('/api/member/daily',{cache:'no-store'})
  ]);
  const session=await sessionRes.json();
  if(!sessionRes.ok || !session?.authenticated || session?.member?.status!=='ACTIVE'){
    location.replace('/pricing');
    return;
  }
  const daily=await dailyRes.json();
  if(!dailyRes.ok || daily?.ok!==true) throw new Error('DAILY_FEED_UNAVAILABLE');

  qs('#memberName').textContent=session.member.displayName;
  qs('#memberAvatar').textContent=session.member.displayName.slice(0,1).toUpperCase();
  qs('#memberStatus').textContent=memberAccessLabel(session.member);
  const livePill=qs('.live-pill');
  if(livePill) livePill.textContent='TODAY · '+daily.signalCount+' SIGNALS';
  state.payload=daily;
  render();
  setInterval(refreshFreshSignalClock,1000);
  setInterval(refreshLiveMirror,LIVE_REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden) refreshLiveMirror();
  });
}

boot().catch(()=>{
  rowsEl.replaceChildren();
  empty.hidden=false;
  empty.textContent='Member Signal Center is temporarily unavailable.';
});
