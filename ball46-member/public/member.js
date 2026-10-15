const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const LIVE_REFRESH_MS = 15000;
const SIGNALS_PER_PAGE = 20;
const state = {
  market:'ALL',
  page:1,
  payload:null,
  expandedFixtureId:null,
  expandedSignalId:null,
  detailCache:new Map(),
  detailPromises:new Map(),
  favoritesView:false,
  favoriteSignals:new Set(),
  favoriteStorageKey:null
};
function favoriteSignalKey(row){return String(row?.id??'').trim();}
function favoriteStorageInit(member){
  const identity=String(member?.id||member?.email||member?.displayName||'').trim().toLowerCase();
  state.favoriteStorageKey='b46-member1-favorites-cards-v2:'+identity;
  try{
    const saved=JSON.parse(localStorage.getItem(state.favoriteStorageKey)||'{}');
    state.favoriteSignals=new Set(Array.isArray(saved.signals)?saved.signals.map(String):[]);
  }catch{state.favoriteSignals=new Set();}
}
function persistFavorites(){
  try{localStorage.setItem(state.favoriteStorageKey,JSON.stringify({signals:[...state.favoriteSignals]}));}catch{}
}
function isFavoriteRow(row){return state.favoriteSignals.has(favoriteSignalKey(row));}
function toggleFavorite(row){
  const id=favoriteSignalKey(row);
  if(!id)return;
  if(state.favoriteSignals.has(id))state.favoriteSignals.delete(id);
  else state.favoriteSignals.add(id);
  persistFavorites();
  render();
}
function favoritesCount(){return state.favoriteSignals.size;}
function renderFavoritesNav(){
  const host=qs('#memberFavoriteNav');
  if(!host)return;
  const on=state.favoritesView;
  host.replaceChildren();
  const b=node('button','favorite-nav-button'+(on?' active':''),'★ FAVORITES ('+favoritesCount()+')');
  b.type='button';b.setAttribute('aria-pressed',String(on));
  b.addEventListener('click',()=>{
    state.favoritesView=!state.favoritesView;
    state.page=1;
    state.expandedFixtureId=null;
    state.expandedSignalId=null;
    render();
  });
  host.append(b);
  const note=qs('#memberFavoriteDescription');
  if(note)note.textContent=on?'WATCHLIST · '+favoritesCount()+' SAVED SIGNAL CARDS · THIS DEVICE':'★ Save individual signal cards';
}
function makeFavoriteButton(row){
  const selected=isFavoriteRow(row);
  const button=node('button','favorite-star'+(selected?' selected':''),selected?'★':'☆');
  button.type='button';
  button.title=selected?'Remove this signal card from favorites':'Save this signal card to favorites';
  button.setAttribute('aria-label',button.title);
  button.setAttribute('aria-pressed',String(selected));
  button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggleFavorite(row);});
  button.addEventListener('keydown',e=>e.stopPropagation());
  return button;
}

const qs = s => document.querySelector(s);
const tabs = qs('#marketTabs');
const summary = qs('#dailySummary');
const rowsEl = qs('#signalRows');
const pagerEl = qs('#signalPagination');
const empty = qs('#emptyState');
const cornerAuditEl = qs('#cornerMarketAudit');

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
function cornerRuleName(row){
  if(row?.market!=='CORNERS')return String(row?.market||'—');
  const rule=row.cornerRule;
  if(rule?.family==='CORNER_HANDICAP')return 'CORNER AH';
  if(rule?.family==='TOTAL_OU')return 'CORNER TOTAL';
  return 'CORNERS / UNVERIFIED';
}
function cornerRuleCard(row){
  const rule=row.cornerRule||{key:row.sourceMarket,family:'UNVERIFIED',title:'CORNERS · RULE UNVERIFIED',scope:'Missing source rule metadata'};
  const market=row.cornerMarket||{type:'UNVERIFIED',label:'UNVERIFIED',reason:'Provider market category was not recorded'};
  const isTotal=rule.family==='TOTAL_OU';
  const isHandicap=rule.family==='CORNER_HANDICAP';
  const section=node('section','corner-conditions-card '+(isHandicap?'is-handicap':isTotal?'is-total':'is-unknown'));
  const header=node('header','corner-conditions-header');
  header.append(node('strong','','CORNER MARKET · SIGNAL CONDITIONS'));
  header.append(node('span','corner-contract-label',rule.title||'CORNERS · UNVERIFIED'));
  section.append(header);
  const selection=String(row.selection||'—').toUpperCase();
  const line=fmtLine(row)||'—';
  const betSide=isHandicap?(selection==='HOME'?row.home:selection==='AWAY'?row.away:'SIDE UNVERIFIED'):'HOME + AWAY';
  const entry=row.entryCorners;
  const hasEntry=entry?.home!=null&&entry?.away!=null;
  const cornersAtEntry=hasEntry?entry.home+' - '+entry.away:'—';
  const cornerTotal=hasEntry?pairTotal(entry):null;
  const period=signalPeriod(row);
  const data=[
    ['ENGINE RULE',rule.key||'UNRECORDED'],
    ['BET CATEGORY',market.label||'UNVERIFIED'],
    ['PERIOD',period],
    ['CONDITION',rule.scope||'UNVERIFIED'],
    [isHandicap?'TEAM / PICK':'PICK',isHandicap?betSide+' · '+selection:selection],
    ['ENTRY LINE',line],
    ['ENTRY ODDS',fmtOdds(row.odds)],
    ['BOOKMAKER',row.bookmaker||'—'],
    ['PROVIDER MARKET',row.providerMarket||'UNRECORDED'],
    ['CONFIGURED ROUTE',rule.marketRoute||'UNVERIFIED'],
    ['PRICE STAGE',row.priceStage||'UNRECORDED'],
    ['PRICE ORIGIN',row.priceSource||'UNRECORDED'],
    ['SIGNAL MINUTE',row.signalMinute==null?'—':row.signalMinute+"'"],
    ['CORNERS AT ENTRY',cornersAtEntry],
    ['COMBINED AT ENTRY',cornerTotal==null?'—':String(cornerTotal)]
  ];
  if(isTotal&&row.lineGap!=null)data.push(['RECORDED LINE GAP',String(row.lineGap)]);
  const grid=node('div','corner-conditions-grid');
  for(const [label,value] of data){
    const tone=({
      'ENGINE RULE':'rule','BET CATEGORY':'category','PERIOD':'period','CONDITION':'condition',
      'TEAM / PICK':'pick','PICK':'pick','ENTRY LINE':'line','ENTRY ODDS':'odds',
      'BOOKMAKER':'bookmaker','PROVIDER MARKET':'provider','CONFIGURED ROUTE':'route',
      'PRICE STAGE':'stage','PRICE ORIGIN':'origin','SIGNAL MINUTE':'minute',
      'CORNERS AT ENTRY':'corners','COMBINED AT ENTRY':'combined',
      'RECORDED LINE GAP':'gap'
    })[label]||'other';
    const item=node('div','corner-conditions-item corner-tone-'+tone);
    item.append(node('small','',label),node('b','',String(value)));
    grid.append(item);
  }
  section.append(grid);
  const notice=isHandicap
    ? 'CORNER AH = team versus team corner difference. Never compare this price with Asian TOTAL Corners.'
    : isTotal
      ? 'TOTAL CORNERS = both teams combined. Provider market/route do NOT prove the Bet365 menu is Asian Total or Standard Total.'
      : 'Source market rule cannot be confirmed. Do not infer market category from .5 or .75 lines.';
  section.append(node('p','corner-conditions-notice',notice));
  if(market.reason)section.append(node('p','corner-conditions-source-note',market.reason));
  section.append(node('p','corner-conditions-snapshot-note','These are recorded signal-entry conditions, not a live bookmaker quote. Configured route is a rule alias list, not proof of the exact upstream field used.'));
  return section;
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
  if(result==='LIVE') return 'live';
  if(result==='VOID') return 'void';
  if(result==='UNRESOLVED') return 'unresolved';
  return 'pending';
}
function statusClass(status){
  if(status==='LIVE') return 'live';
  if(status==='FINISHED') return 'finished';
  return 'pending';
}
function currentStats(){
  return state.payload?.summary?.[state.market]||{
    signals:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,live:0,void:0,unresolved:0,winRate:null,pnl:0
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
      state.favoritesView=false; // Market tabs always show their complete market, not the saved-only subset.
      state.page=1;
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
    ['LIVE',s.live||0,'live'],
    ...(s.unresolved?[['UNRESOLVED',s.unresolved,'unresolved']]:[]),
    ...(s.void?[['VOID',s.void,'void']]:[]),
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
  const signals=Array.isArray(state.payload?.signals)?state.payload.signals:[];
  // Favorites is a separate all-market watchlist; a previous market tab must not hide saved rows.
  if(state.favoritesView)return signals.filter(isFavoriteRow);
  return signals.filter(row=>state.market==='ALL'||row.market===state.market);
}

// Show twenty signal cards at a time, without changing the complete daily feed.
function paginateSignals(rows,page,size=SIGNALS_PER_PAGE){
  const total=Array.isArray(rows)?rows.length:0;
  const pageCount=Math.max(1,Math.ceil(total/size));
  const safePage=Math.min(pageCount,Math.max(1,Math.floor(Number(page)||1)));
  const start=(safePage-1)*size;
  return {page:safePage,pageCount,total,from:total?start+1:0,to:Math.min(total,start+size),
    items:total?rows.slice(start,start+size):[]};
}
function pageNumbers(current,total){
  if(total<=5)return Array.from({length:total},(_,i)=>i+1);
  const choices=[...new Set([1,total,current,current-1,current+1])].filter(n=>n>=1&&n<=total).sort((a,b)=>a-b);
  const slots=[];
  for(const n of choices){
    if(slots.length&&n-slots[slots.length-1]>1)slots.push('…');
    slots.push(n);
  }
  return slots;
}
function changeSignalPage(next){
  const old=paginateSignals(filteredRows(),state.page);
  const desired=paginateSignals(filteredRows(),next);
  if(old.page===desired.page)return;
  state.page=desired.page;
  state.expandedFixtureId=null;
  state.expandedSignalId=null;
  renderRows();
  renderPagination();
  qs('#signalBoard')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderPagination(){
  if(!pagerEl)return;
  const data=paginateSignals(filteredRows(),state.page);
  state.page=data.page;
  pagerEl.replaceChildren();
  pagerEl.hidden=data.total<=SIGNALS_PER_PAGE;
  if(pagerEl.hidden)return;
  const meta=node('div','member-pagination-meta');
  meta.append(node('strong','','SHOWING '+data.from+'–'+data.to+' OF '+data.total));
  meta.append(node('span','','20 SIGNALS PER PAGE · NEWEST FIRST'));
  const actions=node('div','member-pagination-actions');
  function button(label,target,disabled=false,active=false){
    const b=node('button','member-page-button'+(active?' active':''),label);
    b.type='button';b.disabled=disabled;
    if(active)b.setAttribute('aria-current','page');
    b.setAttribute('aria-label',label==='PREV'?'Previous signal page':label==='NEXT'?'Next signal page':'Signal page '+label);
    b.addEventListener('click',()=>changeSignalPage(target));
    return b;
  }
  actions.append(button('PREV',data.page-1,data.page===1));
  for(const n of pageNumbers(data.page,data.pageCount)){
    if(n==='…')actions.append(node('span','member-page-ellipsis','…'));
    else actions.append(button(String(n),n,false,n===data.page));
  }
  actions.append(button('NEXT',data.page+1,data.page===data.pageCount));
  pagerEl.append(meta,actions);
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
  const teams=node('div','favorite-teams');
  const teamNames=node('div','favorite-team-names');
  const home=node('div','favorite-team-line');
  home.append(node('span','favorite-side-label','HOME'),node('span','favorite-team-home',row.home));
  const away=node('div','favorite-team-line');
  away.append(node('span','favorite-side-label','AWAY'),node('span','favorite-team-away',row.away));
  teamNames.append(home,away);
  teams.append(makeFavoriteButton(row),teamNames);
  match.append(teams);
  tr.append(match);

  const live=document.createElement('td');
  live.className='live-score-cell';
  const score=displayScore(row);
  const textScore=scoreText(score);
  const scoreParts=score&&typeof score==='object'
    ?[score.home,score.away]
    :(typeof textScore==='string'&&/^\\d+\\s*[-–:]\\s*\\d+$/.test(textScore)?textScore.split(/\\s*[-–:]\\s*/):[null,null]);
  const scores=node('div','live-score-pair');
  scores.append(
    node('strong','live-score-team home',scoreParts[0]==null?'—':String(scoreParts[0])),
    node('strong','live-score-team away',scoreParts[1]==null?'—':String(scoreParts[1]))
  );
  live.append(scores);
  const evidence=marketEvidence(row);
  if(evidence) live.append(node('small','market-evidence '+(row.state==='LIVE'?'live-evidence':row.state==='FINISHED'?'ft-evidence':''),evidence));
  tr.append(live);

  if(row.market==='CORNERS'){
    const cell=td(undefined,'corner-market-cell');
    const detail=row.cornerMarket||{type:'UNVERIFIED',label:'UNVERIFIED',reason:'No source label available'};
    cell.append(node('strong','',cornerRuleName(row)));
    cell.title='Rule: '+String(row.cornerRule?.key||row.sourceMarket||'UNVERIFIED');
    const tag=node('small','corner-market-type '+String(detail.type||'UNVERIFIED').toLowerCase(),detail.label||'UNVERIFIED');
    tag.title=[detail.reason,detail.source?'Source: '+detail.source:''].filter(Boolean).join(' · ');
    cell.title=[cell.title,tag.title].filter(Boolean).join(' · ');
    cell.append(tag);tr.append(cell);
  }else tr.append(td(row.market));
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
  // Presentation only: show the verified live match clock, never change settlement.
  const liveResult=String(row.result||'').toUpperCase()==='LIVE';
  const clockStatus=String(row.mirrorStatus||'').trim();
  const rawMinute=String(row.matchMinute??'').trim();
  const parsedMinute=Number(rawMinute);
  const minuteText=/^\\d{1,3}\\+\\d{1,2}$/.test(rawMinute)
    ? rawMinute+"′"
    : rawMinute!==''&&Number.isFinite(parsedMinute)&&parsedMinute>0?Math.floor(parsedMinute)+"′":null;
  const halfTime=/^(HT|HALF[ -]?TIME)$/i.test(clockStatus);
  const liveLabel=halfTime?'HT':minuteText||'LIVE';
  const rawResult=String(row.result??'').trim().toUpperCase();
  const missingResult=row.resultMissing===true||!rawResult;
  const displayNoData=missingResult;
  const resultLabel=displayNoData?'NO DATA':rawResult.replaceAll('_',' ');
  const resultStyle=displayNoData?'no-data':resultClass(rawResult);
  const compactResult=/^HALF_(?:WIN|LOSS)$/.test(rawResult);
  const clockBadge=node('span',liveResult?'result-minute-card':'badge '+resultStyle+(compactResult?' compact-result':''),liveResult?liveLabel:resultLabel);
  // Blink only the trailing prime on an actual LIVE minute; keep the numeric minute steady.
  if(liveResult&&minuteText&&liveLabel.endsWith('′')){
    clockBadge.replaceChildren(node('span','live-minute-number',liveLabel.slice(0,-1)),node('span','live-minute-prime','′'));
  }
  result.append(clockBadge);
  tr.append(result);

  const p=Number(row.pnl||0);
  const pnlState=['PENDING','LIVE','UNRESOLVED','PUSH','VOID'].includes(row.result)?'neutral':(p>0?'pos':p<0?'neg':'neutral');
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
  const signals=state.payload.signals.filter(s=>s.fixtureId===fixtureId && s.id!==state.expandedSignalId).sort((a,b)=>b.createdAt-a.createdAt);
  for(const s of signals){
    const chip=node('button','signal-chip'+(s.id===state.expandedSignalId?' active':''));
    chip.type='button';
    chip.textContent=`${s.signalMinute??'—'}' · ${cornerRuleName(s)} · ${signalPeriod(s)} · ${s.selection}${fmtLine(s)?' '+fmtLine(s):''} ${fmtOdds(s.odds)}`;
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
  const src=(Array.isArray(rows)?rows:[]).slice().sort((a,b)=>
    (Number(a?.minute)||0)-(Number(b?.minute)||0)||
    (Number(a?.at)||0)-(Number(b?.at)||0));
  const out=[];
  // Running highest cumulative counters prevent a missing snapshot (null)
  // or a delayed correction from manufacturing the same goal a second time.
  const high=new Map();
  const fields=[
    ['goals','Goal','goal'],
    ['corners','Corner','corner'],
    ['cards','Yellow card','yellow'],
    ['cards','Red card','red']
  ];
  for(const row of src){
    const minute=row?.minute==null?NaN:Number(row.minute);
    if(!Number.isFinite(minute)||minute<0||minute>135)continue;
    for(const side of ['home','away']){
      for(const [field,type,subtype] of fields){
        const raw=field==='cards'?row?.cards?.[side]?.[subtype]:row?.[field]?.[side];
        if(raw==null||raw==='')continue;
        const value=Number(raw);
        if(!Number.isInteger(value)||value<0)continue;
        const key=side+'|'+type;
        const earlier=high.get(key);
        if(earlier!==undefined&&value>earlier){
          for(let i=earlier;i<value;i++)out.push({minute,type,side});
        }
        high.set(key,Math.max(earlier??value,value));
      }
    }
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
    ? iconLib.merge(historyEvents,liveEvents,e=>eventSide(e,featured),featured?.score)
    : liveEvents.length?liveEvents:historyEvents;
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
  const w=1000,plotH=232,laneH=72,h=plotH+laneH*2,pad={left:42,right:18,top:14,bottom:30};
  const plotBottom=laneH+plotH-pad.bottom;
  const xFor=minute=>pad.left+(clamp(minute,0,current)/Math.max(1,current))*(w-pad.left-pad.right);
  const yFor=value=>laneH+pad.top+((100-clamp(value,1,100))/99)*(plotH-pad.top-pad.bottom);
  const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none',role:'img','aria-label':'Ball46 mirrored Event Flow'});

  const defs=svgNode('defs');
  const gh=svgNode('linearGradient',{id:'member-home-'+fixtureId,x1:'0',y1:'0',x2:'0',y2:'1'});
  gh.append(svgNode('stop',{offset:'0%','stop-color':'#43E6A2','stop-opacity':'.22'}),svgNode('stop',{offset:'100%','stop-color':'#43E6A2','stop-opacity':'0'}));
  const ga=svgNode('linearGradient',{id:'member-away-'+fixtureId,x1:'0',y1:'0',x2:'0',y2:'1'});
  ga.append(svgNode('stop',{offset:'0%','stop-color':'#FFA451','stop-opacity':'.20'}),svgNode('stop',{offset:'100%','stop-color':'#FFA451','stop-opacity':'0'}));
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
    svg.append(svgNode('line',{x1:x,y1:laneH+pad.top,x2:x,y2:plotBottom,class:'expand-flow-grid v'}));
    const t=svgNode('text',{x,y:plotBottom+23,'text-anchor':'middle',class:'expand-flow-axis'});t.textContent=m+"'";svg.append(t);
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

  // Collision-aware placement: keep the real signal point fixed; never move a label forward.
  const occupiedSignalPlates=[];
  let neutralLaneCount=0;
  const signalPlateGap=4;
  function signalPlateOverlaps(candidate){
    return occupiedSignalPlates.some(p=>
      candidate.x<p.x+p.w+signalPlateGap &&
      candidate.x+candidate.w+signalPlateGap>p.x &&
      candidate.y<p.y+p.h+signalPlateGap &&
      candidate.y+candidate.h+signalPlateGap>p.y
    );
  }
  function placeSignalPlate(initialX,initialY,tagW,tagH,safeLeft,safeRight,minY,maxY){
    const xCandidates=[initialX];
    // A shift 'back' is always left of the initially proposed label; never ahead.
    for(let left=initialX-12;left>=safeLeft;left-=12)xCandidates.push(Math.max(safeLeft,left));
    if(xCandidates[xCandidates.length-1]!==safeLeft)xCandidates.push(safeLeft);
    const stride=tagH+signalPlateGap;
    const yCandidates=[initialY];
    for(let step=1;step<=Math.ceil((maxY-minY)/stride)+1;step++){
      const up=initialY-step*stride,down=initialY+step*stride;
      if(up>=minY)yCandidates.push(up);
      if(down<=maxY)yCandidates.push(down);
    }
    // Priority: vertical up/down first, then move backward and retry vertically.
    for(const left of xCandidates){
      for(const top of yCandidates){
        const candidate={x:left,y:top,w:tagW,h:tagH};
        if(left+tagW<=safeRight && !signalPlateOverlaps(candidate)){
          occupiedSignalPlates.push(candidate);
          return candidate;
        }
      }
    }
    return null;
  }
  for(const s of signals){
    const minute=Number(s.signalMinute);
    if(!Number.isFinite(minute)||minute<0||minute>current+.75) continue;
    const p=pressureAt(points,minute);
    const pick=String(s.selection||'').toLowerCase();
    const side=pick.includes('home')?'home':pick.includes('away')?'away':null;
    const y=yFor(side?p[side]:(p.home+p.away)/2),x=xFor(minute);
    const title=[minute+"'",cornerRuleName(s),signalPeriod(s),s.selection,fmtLine(s),fmtOdds(s.odds),s.bookmaker].filter(Boolean).join(' · ');
    const g=svgNode('g',{class:'member-flow-signal'});
    const tt=svgNode('title');tt.textContent=title;g.append(tt);
    g.append(svgNode('line',{x1:x,y1:laneH+pad.top,x2:x,y2:plotBottom,class:'member-flow-signal-line'}));
    g.append(svgNode('circle',{cx:x,cy:y,r:'6.1',class:'member-flow-signal-ring'}));
    g.append(svgNode('circle',{cx:x,cy:y,r:'3.1',class:'member-flow-signal-dot'}));

    // Compact verified entry snapshot. Never substitute a current live price.
    const market=String(s.market==='CORNERS'?cornerRuleName(s):s.market||'').trim();
    const pickLabel=String(s.selection||'').trim();
    const lineLabel=fmtLine(s);
    const oddsLabel=s.odds==null?'':fmtOdds(s.odds);
    const bookmaker=String(s.bookmaker||'').trim();
    const entryParts=[market,[pickLabel,lineLabel].filter(Boolean).join(' '),oddsLabel,bookmaker].filter(Boolean);
    const entryText=entryParts.join(' · ');
    const tagW=clamp(42+entryText.length*4.7,150,236),tagH=36;
    const safeLeft=pad.left+6,safeRight=w-pad.right-6;
    // Anchor to the left for late signals; never permit the plate to touch either edge.
    const initialX=clamp(x-tagW-12,safeLeft,safeRight-tagW);
    // Separate upper/lower label lanes; pressure curves retain original plot height.
    const preferredLane=side==='home'?'top':side==='away'?'bottom':(neutralLaneCount++%2?'bottom':'top');
    const laneBounds=lane=>lane==='top'
      ? {min:6,max:laneH-tagH-6}
      : {min:laneH+plotH+7,max:h-tagH-6};
    const order=[preferredLane,preferredLane==='top'?'bottom':'top'];
    let placed=null;
    for(const lane of order){
      const bounds=laneBounds(lane);
      placed=placeSignalPlate(initialX,bounds.min,tagW,tagH,safeLeft,safeRight,bounds.min,bounds.max);
      if(placed)break;
    }
    // Crowded fallback: retain the signal dot and its full SVG title; do not overlap labels.
    if(!placed)continue;
    const {x:tagX,y:tagY}=placed;
    const tag=svgNode('g',{class:'member-flow-signal-tag'});
    const plate=svgNode('rect',{x:tagX,y:tagY,width:tagW,height:tagH,rx:'5',ry:'5',class:'member-flow-signal-plate'});
    const accent=svgNode('rect',{x:tagX+6,y:tagY+7,width:'2.4',height:tagH-14,rx:'1.2',class:'member-flow-signal-accent'});
    const label=svgNode('text',{x:tagX+14,y:tagY+14,class:'member-flow-signal-label'});
    const signalWord=svgNode('tspan',{class:'member-flow-signal-word'});
    signalWord.textContent='SIGNAL ';
    const signalMinute=svgNode('tspan',{class:'member-flow-signal-minute'});
    signalMinute.textContent=minute+"′";
    label.append(signalWord,signalMinute);
    const detailText=svgNode('text',{x:tagX+14,y:tagY+28,class:'member-flow-signal-detail'});
    // Preserve the original one-line width, placement and complete SVG tooltip.
    detailText.setAttribute('textLength',Math.min(tagW-24,Math.max(30,entryText.length*4.5)));
    detailText.setAttribute('lengthAdjust','spacingAndGlyphs');
    const pickText=[pickLabel,lineLabel].filter(Boolean).join(' ');
    const pieces=[[market,'market'],[pickText,'pick'],[oddsLabel,'odds'],[bookmaker,'bookmaker']].filter(([value])=>value);
    if(!pieces.length){
      const fallback=svgNode('tspan',{class:'member-flow-signal-market'});
      fallback.textContent='ENTRY NOT AVAILABLE';
      detailText.append(fallback);
    }else{
      pieces.forEach(([value,kind],index)=>{
        if(index){
          const separator=svgNode('tspan',{class:'member-flow-signal-separator'});
          separator.textContent=' · ';
          detailText.append(separator);
        }
        const part=svgNode('tspan',{class:'member-flow-signal-'+kind});
        part.textContent=value;
        detailText.append(part);
      });
    }
    tag.append(plate,accent,label,detailText);
    // Fixed data anchor, straight green leader line to nearest label edge.
    const leaderStartX=clamp(x,tagX+8,tagX+tagW-8);
    const leaderStartY=tagY<y?tagY+tagH:tagY;
    g.append(svgNode('line',{x1:leaderStartX,y1:leaderStartY,x2:x,y2:y,
      class:'member-flow-signal-connector'}));
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
  // Reserved crest slots use typographic monograms until verified club logos are available.
  const crestSlot=(name,side)=>{
    const slot=node('span','featured-crest-slot '+side);
    slot.setAttribute('aria-hidden','true');
    const initials=String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'FC';
    slot.append(node('span','featured-crest-initials',initials));
    return slot;
  };
  const homeName=f?.home||selected.home;
  const awayName=f?.away||selected.away;
  const home=node('div','team home');
  home.append(crestSlot(homeName,'home'),node('b','',homeName));
  const center=node('div','score-center');
  const featuredScore=node('strong','featured-team-score');
  const shownScoreText=scoreText(shownScore);
  const parts=shownScore&&typeof shownScore==='object'&&shownScore.home!=null&&shownScore.away!=null
    ?[String(shownScore.home),String(shownScore.away)]
    :/^\\d+\\s*[-–:]\\s*\\d+$/.test(shownScoreText)?shownScoreText.split(/\\s*[-–:]\\s*/):null;
  if(parts)featuredScore.append(node('span','home',parts[0]),node('span','separator','-'),node('span','away',parts[1]));
  else featuredScore.textContent=shownScoreText;
  center.append(featuredScore);
  const away=node('div','team away');
  away.append(node('b','',awayName),crestSlot(awayName,'away'));
  score.append(home,center,away);

  const signal=node('div','featured-h-signal'+(selected.market==='CORNERS'?' has-corner-conditions':''));
  const entryContext=[`Entry score ${scoreText(selected.entryScore)}`];
  if(selected.market==='CORNERS'&&selected.entryCorners?.home!=null&&selected.entryCorners?.away!=null){
    entryContext.push(`Entry corners ${selected.entryCorners.home}-${selected.entryCorners.away}`);
    const total=pairTotal(selected.entryCorners);
    if(total!=null) entryContext.push(`Total ${total}`);
  }
  const entryDetails=node('b','entry-premium-details');
  const entryPiece=(value,kind)=>{
    if(value===null||value===undefined||String(value)==='')return;
    if(entryDetails.childNodes.length)entryDetails.append(node('span','entry-separator',' · '));
    entryDetails.append(node('span','entry-'+kind,String(value)));
  };
  entryPiece((selected.signalMinute??'—')+"′",'minute');
  entryPiece(cornerRuleName(selected)+' · '+signalPeriod(selected),'market');
  const entrySelection=String(selected.selection||'');
  entryPiece(entrySelection+(fmtLine(selected)?' '+fmtLine(selected):''),/\bAWAY\b/i.test(entrySelection)?'away':/\bHOME\b/i.test(entrySelection)?'home':'pick');
  entryPiece(fmtOdds(selected.odds),'odds');
  entryPiece(selected.bookmaker,'bookmaker');
  entryPiece('Entry score '+scoreText(selected.entryScore),'score');
  for(const extra of entryContext.slice(1))entryPiece(extra,'context');
  signal.append(node('span','','ENTRY'),entryDetails);

  if(selected.market==='CORNERS')signal.append(cornerRuleCard(selected));

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
  // Show every available signal for this fixture; do not synthesize timeline signals.
  const allSignals=state.payload.signals.filter(item=>String(item.fixtureId)===String(selected.fixtureId));
  if(!allSignals.some(item=>item.id===selected.id))allSignals.push(selected);
  allSignals.sort((a,b)=>(Number(a.signalMinute)||0)-(Number(b.signalMinute)||0)||(Number(a.createdAt)||0)-(Number(b.createdAt)||0));
  const history=node('section','featured-entry-history');
  history.setAttribute('aria-label','Signal entry history');
  const historyHead=node('div','featured-entry-history-head');
  historyHead.append(node('strong','','SIGNAL ENTRY HISTORY'),node('span','',allSignals.length+' SIGNAL'+(allSignals.length===1?'':'S')));
  history.append(historyHead);
  const historyList=node('div','featured-entry-history-list');
  for(const item of allSignals){
    const entry=node('div','featured-h-signal featured-history-entry'+(item.market==='CORNERS'?' has-corner-conditions':'')+(item.id===selected.id?' is-selected':''));
    const row=node('div','featured-history-compact-row');
    const add=(cls,value)=>row.append(node('span',cls,String(value??'—')));
    add('featured-history-minute',(item.signalMinute??'—')+'′');
    add('featured-history-market',cornerRuleName(item)+' · '+signalPeriod(item));
    add('featured-history-pick',String(item.selection||'—')+(fmtLine(item)?' '+fmtLine(item):''));
    add('featured-history-odds',fmtOdds(item.odds));
    add('featured-history-bookmaker',item.bookmaker||'—');
    add('featured-history-entry-score',scoreText(item.entryScore));
    if(item.market==='CORNERS'&&item.entryCorners?.home!=null&&item.entryCorners?.away!=null){
      const total=pairTotal(item.entryCorners);
      add('featured-history-corner-score',item.entryCorners.home+'–'+item.entryCorners.away+(total!=null?' ('+total+')':''));
    }
    // The Engine payload is authoritative; never infer settlement from scores.
    const result=String(item.result??'').trim().toUpperCase();
    const allowed=['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID','PENDING','LIVE','UNRESOLVED'];
    const label=allowed.includes(result)?result.replaceAll('_',' '):'NO DATA';
    add('featured-history-result '+(allowed.includes(result)?resultClass(result):'no-data'),label);
    const settled=['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID'].includes(result);
    if(settled&&item.pnl!==null&&item.pnl!==undefined&&item.pnl!==''&&Number.isFinite(Number(item.pnl))){
      add('featured-history-units',fmtPnl(item.pnl));
    }
    if(item.market==='CORNERS'){
      const technical=node('details','featured-history-technical');
      technical.append(node('summary','','Details'),cornerRuleCard(item));
      // Native details is the only interactive element; the Signal card has no click route.
      row.append(technical);
    }
    entry.append(row);
    // Read-only history rows: no navigation or signal switching from the card.
    entry.setAttribute('aria-label','Signal at '+(item.signalMinute??'unknown')+' minutes');
    historyList.append(entry);
  }
  history.append(historyList);
  const analysis=node('div','featured-analysis-layout');
  analysis.append(statRow,history);
  card.append(meta,score);
  const stack=node('div','featured-match-stack');
  stack.append(card,analysis);
  stack.matchFacts=sideFacts;
  return stack;
}

function renderInsight(host,fixtureId){
  host.replaceChildren();
  const selected=state.payload.signals.find(s=>s.id===state.expandedSignalId)
    ||state.payload.signals.find(s=>s.fixtureId===fixtureId);
  if(!selected) return;

  // Preserve legacy chip navigation for compatibility; history cards are the visible controls.
  const alternatives=signalChips(fixtureId);
  alternatives.classList.add('featured-history-legacy-nav');
  if(alternatives.children.length) host.append(alternatives);

  const detail=state.detailCache.get(fixtureId);

  if(!detail){
    const featured=featuredHorizontal(null,selected);
    host.append(featured);
    host.append(node('div','insight-loading','Loading Featured Match and Event Flow from Ball46 Mirror…'));
    host.append(featured.matchFacts);
    return;
  }

  const featured=featuredHorizontal(detail,selected);
  host.append(featured);
  host.append(eventFlowChart(detail,fixtureId));
  host.append(featured.matchFacts);

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
  const data=paginateSignals(filteredRows(),state.page);
  state.page=data.page;
  const rows=data.items;
  // An update can move the previously expanded row to another page.
  if(state.expandedSignalId&&!rows.some(row=>row.id===state.expandedSignalId)){
    state.expandedFixtureId=null;
    state.expandedSignalId=null;
  }
  rowsEl.replaceChildren();
  empty.hidden=data.total>0;
  if(!data.total)empty.textContent=state.favoritesView
    ? 'No saved signals in today’s board. Tap ☆ on a signal to add it to Favorites.'
    : 'No signals available for this market.';
  let detailInserted=false;

  for(const [index,row] of rows.entries()){
    const signalTr=makeSignalRow(row);
    signalTr.classList.add(index%2===0?'signal-shade-odd':'signal-shade-even');
    rowsEl.append(signalTr);
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

function renderCornerAudit(){
  if(!cornerAuditEl)return;
  cornerAuditEl.hidden=state.market!=='CORNERS';
  if(cornerAuditEl.hidden)return;
  cornerAuditEl.replaceChildren();
  cornerAuditEl.append(node('strong','','CORNER MARKETS · SOURCE CHECK'));
  const counts={ASIAN_TOTAL:0,STANDARD_TOTAL:0,TOTAL_OU:0,CORNER_HANDICAP:0,
    TEAM_CORNERS:0,CONFLICT:0,UNVERIFIED:0};
  for(const s of state.payload?.signals||[]){
    if(s.market!=='CORNERS')continue;
    const type=s.cornerMarket?.type||'UNVERIFIED';
    counts[Object.hasOwn(counts,type)?type:'UNVERIFIED']++;
  }
  for(const [k,label] of [['ASIAN_TOTAL','ASIAN TOTAL'],['STANDARD_TOTAL','STANDARD'],
    ['TOTAL_OU','TOTAL O/U'],['CORNER_HANDICAP','HANDICAP'],
    ['TEAM_CORNERS','TEAM'],['CONFLICT','CONFLICT'],['UNVERIFIED','UNVERIFIED']]){
    if(counts[k])cornerAuditEl.append(node('span','corner-count '+k.toLowerCase(),label+' '+counts[k]));
  }
  cornerAuditEl.append(node('small','','Source-based · never infer Asian from decimal lines'));
}
function render(){renderFavoritesNav();renderTabs();renderSummary();renderCornerAudit();renderRows();renderPagination();}

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
  favoriteStorageInit(session.member);
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
