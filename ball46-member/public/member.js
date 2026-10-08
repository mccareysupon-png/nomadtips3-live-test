const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const state = {
  market:'ALL',
  status:'ALL',
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
function scoreText(v){
  if(typeof v==='string') return v||'—';
  if(!v||typeof v!=='object') return '—';
  const h=v.home, a=v.away;
  if(h===null||h===undefined||a===null||a===undefined) return '—';
  return String(h)+'-'+String(a);
}
function resultClass(result){
  if(result==='WIN'||result==='HALF_WIN') return 'win';
  if(result==='LOSS'||result==='HALF_LOSS') return 'loss';
  if(result==='PUSH') return 'push';
  return 'pending';
}
function statusClass(status){
  if(status==='LIVE') return 'live';
  if(status==='FINISHED') return 'win';
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
    const btn=node('button','market-tab'+(state.market===market?' active':''));
    btn.type='button';
    btn.append(document.createTextNode(market+' '+fmtPct(s.winRate)+' '));
    btn.append(node('span',s.pnl>=0?'profit':'loss',fmtPnl(s.pnl)));
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
  const items=[
    ['SIGNALS',s.signals],
    ['WIN',s.win],
    ['LOSS',s.loss],
    ['PUSH',s.push],
    ['HALF WIN',s.halfWin],
    ['HALF LOSS',s.halfLoss],
    ['PENDING',s.pending],
    ['WIN RATE',fmtPct(s.winRate)]
  ];
  summary.replaceChildren();
  for(const [label,value] of items){
    const box=node('div','stat');
    box.append(node('span','',label),node('b','',String(value)));
    summary.append(box);
  }
  const pnlBox=node('div','stat');
  pnlBox.append(node('span','','P/L TODAY'),node('b','pnl '+(s.pnl>=0?'pos':'neg'),fmtPnl(s.pnl)));
  summary.append(pnlBox);
}

function filteredRows(){
  return state.payload.signals.filter(row=>{
    if(state.market!=='ALL' && row.market!==state.market) return false;
    if(state.status!=='ALL' && row.state!==state.status) return false;
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
  tr.setAttribute('aria-expanded',state.expandedFixtureId===row.fixtureId?'true':'false');
  tr.title='Open Featured Match and Event Flow';

  const time=td(row.signalTime,'signal-time');
  time.append(node('span','expand-glyph',state.expandedFixtureId===row.fixtureId?'⌃':'⌄'));
  tr.append(time);

  const match=node('td','match');
  match.append(
    node('strong','',row.home+' - '+row.away),
    node('small','',row.league),
    node('small','detail-hint','Featured Match · Event Flow')
  );
  tr.append(match);

  const st=document.createElement('td');
  st.append(node('span','badge '+statusClass(row.state),row.state+(row.state==='LIVE'&&row.matchMinute!=null?' '+row.matchMinute+"'":'')));
  tr.append(st);

  tr.append(td(row.market));
  tr.append(td((row.selection||'')+(fmtLine(row)?' '+fmtLine(row):'')));
  tr.append(td(fmtOdds(row.odds),'odds-readonly'));
  tr.append(td(row.signalMinute==null?'—':row.signalMinute+"'"));
  tr.append(td(row.bookmaker));

  const result=document.createElement('td');
  result.append(node('span','badge '+resultClass(row.result),String(row.result||'PENDING').replaceAll('_',' ')));
  tr.append(result);

  const p=Number(row.pnl||0);
  tr.append(td(fmtPnl(p),'pnl '+(p>=0?'pos':'neg')));

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
    chip.textContent=`${s.signalMinute??'—'}' · ${s.market} · ${s.selection}${fmtLine(s)?' '+fmtLine(s):''} ${fmtOdds(s.odds)}`;
    chip.addEventListener('click',e=>{
      e.stopPropagation();
      state.expandedSignalId=s.id;
      renderRows();
    });
    wrap.append(chip);
  }
  return wrap;
}

function flowChart(pressure){
  const wrap=node('div','event-flow');
  const rows=Array.isArray(pressure)?pressure.slice(-48):[];
  if(!rows.length){
    wrap.append(node('div','insight-empty','Event Flow is not available for this match.'));
    return wrap;
  }
  const max=Math.max(1,...rows.flatMap(p=>[Number(p.home)||0,Number(p.away)||0]));
  const bars=node('div','flow-bars');
  for(const p of rows){
    const point=node('div','flow-point');
    point.title=`${p.minute??'—'}' · HOME ${p.home??'—'} · AWAY ${p.away??'—'}`;
    const h=node('i','flow-home');
    const a=node('i','flow-away');
    h.style.height=Math.max(3,Math.round(((Number(p.home)||0)/max)*42))+'px';
    a.style.height=Math.max(3,Math.round(((Number(p.away)||0)/max)*42))+'px';
    point.append(h,a);
    bars.append(point);
  }
  wrap.append(bars);
  const legend=node('div','flow-legend');
  legend.append(node('span','home','HOME PRESSURE'),node('span','away','AWAY PRESSURE'));
  wrap.append(legend);
  return wrap;
}

function recentEvents(events){
  const wrap=node('div','recent-events');
  const list=Array.isArray(events)?events.slice(0,8):[];
  if(!list.length){
    wrap.append(node('div','insight-empty','No recent match events in the current Ball46 snapshot.'));
    return wrap;
  }
  for(const e of list){
    const item=node('div','recent-event');
    item.append(
      node('time','',e.minute==null?'—':e.minute+"'"),
      node('strong','',e.type||'Match event'),
      node('span','',e.team||'')
    );
    wrap.append(item);
  }
  return wrap;
}

function renderInsight(host,fixtureId){
  host.replaceChildren();
  const selected=state.payload.signals.find(s=>s.id===state.expandedSignalId)
    ||state.payload.signals.find(s=>s.fixtureId===fixtureId);
  if(!selected) return;

  const detail=state.detailCache.get(fixtureId);
  const head=node('div','insight-head');
  const title=node('div','');
  title.append(node('span','eyebrow','FEATURED MATCH'),node('h3','',selected.home+' - '+selected.away));
  const status=node('span','badge '+statusClass(detail?.featured?.status?'LIVE':selected.state),detail?.featured?.status||selected.state);
  head.append(title,status);
  host.append(head,signalChips(fixtureId));

  const snapshot=node('section','insight-panel');
  const snapshotHead=node('div','insight-panel-head');
  snapshotHead.append(
    node('div','insight-label','SIGNAL SNAPSHOT'),
    node('strong','',`${selected.signalMinute??'—'}' · ${scoreText(selected.entryScore)} · ${selected.market} ${selected.selection}${fmtLine(selected)?' '+fmtLine(selected):''} ${fmtOdds(selected.odds)}`)
  );
  snapshot.append(snapshotHead,statGrid(selected.entryStats,selected.entryCorners,selected.entryCards));
  host.append(snapshot);

  if(!detail){
    host.append(node('div','insight-loading','Loading Featured Match and Event Flow from Ball46…'));
    return;
  }

  if(detail.featured){
    const f=detail.featured;
    const live=node('section','insight-panel live-context');
    const h=node('div','insight-panel-head');
    const minute=f.minute==null?'—':f.minute+"'";
    h.append(node('div','insight-label','LIVE / CURRENT MATCH'),node('strong','',`${minute} · ${scoreText(f.score)} · ${f.status||'—'}`));
    live.append(h,statGrid(f.statistics,f.corners,f.cards));
    host.append(live);
  }else{
    const note=node('div','insight-note','Current Featured Match is no longer on the live board. Signal-time snapshot remains available above.');
    host.append(note);
  }

  const flowPanel=node('section','insight-panel');
  const flowHead=node('div','insight-panel-head');
  flowHead.append(node('div','insight-label','EVENT FLOW'),node('strong','',detail.eventFlow?.pressureWindowMinutes?`Pressure · ${detail.eventFlow.pressureWindowMinutes} min window`:'Ball46 history'));
  flowPanel.append(flowHead,flowChart(detail.eventFlow?.pressure||[]));
  host.append(flowPanel);

  const eventsPanel=node('section','insight-panel');
  const eventsHead=node('div','insight-panel-head');
  eventsHead.append(node('div','insight-label','RECENT EVENTS'),node('strong','',detail.featured?'Current match snapshot':'No live-board snapshot'));
  eventsPanel.append(eventsHead,recentEvents(detail.featured?.events||[]));
  host.append(eventsPanel);
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
    if(!detailInserted && state.expandedFixtureId===row.fixtureId){
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
  qs('#memberStatus').textContent='MEMBER · '+session.member.status;
  const livePill=qs('.live-pill');
  if(livePill) livePill.textContent='TODAY · '+daily.signalCount+' SIGNALS';
  state.payload=daily;
  render();
}

qs('#statusFilter')?.addEventListener('change',e=>{
  state.status=e.target.value;
  state.expandedFixtureId=null;
  state.expandedSignalId=null;
  renderRows();
});

boot().catch(()=>{
  rowsEl.replaceChildren();
  empty.hidden=false;
  empty.textContent='Member Signal Center is temporarily unavailable.';
});
