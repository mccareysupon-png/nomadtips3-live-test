(()=>{
'use strict';
const VERSION='343-dashboard-v2-stage3-v5-default-rich-bridge';
const API='/api/engine/board';
const SIGNALS_API='/api/engine/signals';
const POLL_MS=30_000;
const SIGNAL_POLL_MS=30_000;
const SIGNAL_AFTER_BOARD_MS=1000;
const COLLAPSED_LIMIT=10;
const THEME_KEY='nomad343_dashboard_theme_v1';
const BOOKS=[{slug:'bet365',name:'Bet365'},{slug:'pinnacle',name:'Pinnacle'},{slug:'williamhill',name:'William Hill'},{slug:'ladbrokes',name:'Ladbrokes'},{slug:'vcbet',name:'VCBet'},{slug:'1xbet',name:'1xBet'},{slug:'bwin',name:'Bwin'},{slug:'easybets',name:'Easybets'},{slug:'interwetten',name:'Interwetten'},{slug:'betfair',name:'Betfair'},{slug:'snai',name:'SNAI'},{slug:'macauslot',name:'Macau Slot'},{slug:'betsson',name:'Betsson'},{slug:'betathome',name:'Bet-at-home'},{slug:'18bet',name:'18Bet'},{slug:'10bet',name:'10BET'},{slug:'12bet',name:'12Bet'},{slug:'coral',name:'Coral'},{slug:'crown',name:'Crown'}];
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const show=(v,d=0)=>num(v)===null?'—':Number(v).toFixed(d).replace(/\.0+$/,'');
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};
const dateMs=v=>{const n=num(v);if(n!==null)return n>1e10?n:n*1000;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:null};
const norm=v=>String(v??'').toLowerCase().replace(/[\s_-]/g,'');
const timeZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();
let fixtures=[];
let signalMap=new Map();
let signalMirror={};
let signalRows=[];
let boardMeta={};
let selectedId=null;
let statusFilter='all';
let leagueFilter='all';
let query='';
const expandedGroups=new Set();
let loading=false;
let hasLoaded=false;
function fixtureKey(f){return String(f?.fixtureId??[f?.home?.name,f?.away?.name,f?.kickoffAt??f?.kickoffUtc].join('|'))}
function mergeLastGoodValue(previous,incoming){if(incoming===null||incoming===undefined||incoming==='')return previous;if(Array.isArray(incoming))return incoming.length?incoming:previous;if(typeof incoming!=='object')return incoming;const prev=previous&&typeof previous==='object'&&!Array.isArray(previous)?previous:{};const out={...prev};for(const [k,v] of Object.entries(incoming))out[k]=mergeLastGoodValue(prev[k],v);return out}
function holdLastGoodOdds(rows){const old=new Map(fixtures.map(f=>[fixtureKey(f),f]));return rows.map(f=>{const prev=old.get(fixtureKey(f));if(!prev)return f;const merged={...f};merged.providerOdds=mergeLastGoodValue(prev?.providerOdds,f?.providerOdds);if((!f?.providerOdds||!Object.keys(f.providerOdds||{}).length)&&prev?.providerOddsUpdatedAt)merged.providerOddsUpdatedAt=prev.providerOddsUpdatedAt;if((!f?.providerOdds||!Object.keys(f.providerOdds||{}).length)&&prev?.providerOddsFreshAt)merged.providerOddsFreshAt=prev.providerOddsFreshAt;return merged})}
let richRenderFrame=0;
function scheduleRichRender(){if(richRenderFrame)return;const run=()=>{richRenderFrame=0;renderBoard();renderFeatured()};if(typeof requestAnimationFrame==='function')richRenderFrame=requestAnimationFrame(run);else{richRenderFrame=1;setTimeout(run,0)}}
function applyRichOdds(fixtureId,fullOdds,fetchedAt){const id=String(fixtureId??'').trim();if(!id||!fullOdds||typeof fullOdds!=='object')return false;const idx=fixtures.findIndex(f=>fixtureKey(f)===id);if(idx<0)return false;const prev=fixtures[idx];fixtures[idx]={...prev,providerOdds:mergeLastGoodValue(prev?.providerOdds,fullOdds),providerOddsUpdatedAt:fetchedAt??prev?.providerOddsUpdatedAt??Date.now(),providerOddsFreshAt:fetchedAt??prev?.providerOddsFreshAt??Date.now(),providerOddsHeld:true,defaultRichOdds:true};scheduleRichRender();return true}
function leagueName(f){return [f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')||'Other'}
function rawStatus(f){return [f?.status,f?.statusCode,f?.statusReason].filter(Boolean).join(' ').toLowerCase()}
function classify(f){const raw=rawStatus(f),board=String(f?.boardState||'').toLowerCase();if(/unknown|postpon|cancel|canceled|abandon|suspend|delay|delayed/.test(raw))return'unknown';if(['live','scheduled','finished','unknown'].includes(board))return board;if(/finished|full_time|full time|\bft\b|ended|after extra|\baet\b|penalties|\bpen\b/.test(raw))return'finished';if(/live|in_play|in play|playing|first half|second half|\b1h\b|\b2h\b|half.?time|\bht\b/.test(raw)||/^\d+$/.test(String(f?.statusCode??'')))return'live';return'scheduled'}
function kickoffLabel(f){const ms=dateMs(f?.kickoffAt??f?.kickoffUtc);if(ms===null)return'—';return new Intl.DateTimeFormat('en-GB',{timeZone,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms))}
function clockLabel(f){const code=String(f?.statusCode??'').trim().toUpperCase();if(code==='HT'||code.includes('HALF'))return'HT';const m=num(f?.minute);if(m!==null)return`${Math.round(m)}'`;const hit=code.match(/\d+/);return hit?`${hit[0]}'`:'LIVE'}
function detailedStatus(f){const raw=rawStatus(f).toUpperCase(),kind=classify(f),reason=String(f?.statusReason??'').trim();if(kind==='live')return clockLabel(f);if(kind==='finished')return'FT';if(kind==='scheduled')return kickoffLabel(f);if(/POST/.test(raw))return reason||'POSTPONED';if(/SUSP/.test(raw))return reason||'SUSPENDED';if(/CANCEL/.test(raw))return reason||'CANCELLED';if(/ABAND/.test(raw))return reason||'ABANDONED';if(/DELAY/.test(raw))return reason||'DELAYED';return reason||'UNCONFIRMED'}
function scorePair(f){return pair(f?.goals)}
function scoreLabel(f){if(classify(f)==='scheduled')return'—';const p=scorePair(f);return p.home===null||p.away===null?'—':`${show(p.home)}–${show(p.away)}`}
function scoreStack(f){const kind=classify(f),p=scorePair(f);if(kind==='scheduled')return'<strong>—</strong><strong>—</strong>';return `<strong>${esc(p.home===null?'—':show(p.home))}</strong><strong>${esc(p.away===null?'—':show(p.away))}</strong>`}
function halfScoreLabel(f){const h=num(f?.goals?.halfHome),a=num(f?.goals?.halfAway);return h===null||a===null?'':`HT ${show(h)}–${show(a)}`}
function signalMarketKey(s){const x=String(s?.marketLabel||s?.market||s?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';if(/asian|handicap|(^|[^a-z])ah([^a-z]|$)/.test(x))return'ah';if(/over|under|o\/u|goal[_ -]?line|total/.test(x))return'ou';return'other'}
function signalsFor(f){const id=fixtureKey(f);return signalRows.filter(s=>String(s?.fixtureId??'').trim()===id)}
function signalFor(f){const id=fixtureKey(f),rows=signalsFor(f),signalView=document.body.dataset.workspaceView==='signal',market=document.body.dataset.signalMarket||'all';if(signalView&&market!=='all')return rows.find(s=>signalMarketKey(s)===market)||null;return rows[0]||signalMap.get(id)||null}
function signalSummary(s){if(!s)return'No active signal';const selection=String(s?.selection||'').trim().toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL').trim(),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();const top=[selection,market].filter(Boolean).join(' · '),detail=[];if(line!==null)detail.push(`Line ${line>0?'+':''}${show(line,2)}`);if(odds!==null)detail.push(`Odds ${odds.toFixed(2)}`);if(book)detail.push(book);return[top,detail.join(' · ')].filter(Boolean).join(' | ')}
function signalDetailsHtml(s){if(!s)return'No active signal';const selection=String(s?.selection||'—').toUpperCase(),market=String(s?.marketLabel||s?.market||'SIGNAL'),line=num(s?.line??s?.selectionLine),odds=num(s?.odds),book=String(s?.bookmaker||'—'),entryMin=num(s?.entryMinute??s?.minute),liveMin=num(s?.mirrorMinute),entry=pair(s?.entryScore??s?.scoreAt),live=pair(s?.mirrorScore),lineText=line===null?'—':`${line>0?'+':''}${show(line,2)}`,entryScore=entry.home===null||entry.away===null?'—':`${show(entry.home)}–${show(entry.away)}`,liveScore=live.home===null||live.away===null?'—':`${show(live.home)}–${show(live.away)}`;return `<div class="feature-signal-main"><b>${esc(selection)}</b><span>${esc(market)}</span></div><div class="feature-signal-meta"><span>Line ${esc(lineText)}</span><span>Odds ${esc(odds===null?'—':odds.toFixed(2))}</span><span>${esc(book)}</span></div><div class="feature-signal-meta"><span>Signal ${esc(entryMin===null?'—':`${Math.round(entryMin)}'`)}</span><span>Entry ${esc(entryScore)}</span><span>Live ${esc(liveMin===null?'—':`${Math.round(liveMin)}'`)} · ${esc(liveScore)}</span></div>`}
function looksLikeMarketRoot(v){return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).some(k=>/^(1x2|asian[_ -]?handicap|goal[_ -]?line)$/i.test(k))}
function providerBooks(f){const payload=f?.providerOdds;if(!payload||typeof payload!=='object')return[];const full=payload?.data??payload,candidates=[full?.data?.bookmakers,full?.bookmakers,payload?.bookmakers,payload?.data?.bookmakers];let raw=candidates.find(Array.isArray)||[];if(!raw.length){const roots=[full?.data,full,payload?.data,payload].filter(x=>x&&typeof x==='object'&&!Array.isArray(x));for(const root of roots){const keyed=[];for(const book of BOOKS){const hit=root[book.slug]??root[book.name]??root[book.name.toLowerCase()];if(hit&&typeof hit==='object')keyed.push({slug:book.slug,name:book.name,...hit})}if(keyed.length){raw=keyed;break}}}if(!raw.length&&looksLikeMarketRoot(full))raw=[{slug:'bet365',name:'Bet365',odds:full}];if(!raw.length&&full?.odds&&looksLikeMarketRoot(full.odds))raw=[{slug:'bet365',name:'Bet365',odds:full.odds}];if(!raw.length&&full?.markets&&looksLikeMarketRoot(full.markets))raw=[{slug:'bet365',name:'Bet365',odds:full.markets}];const out=[];for(const book of BOOKS){const target=norm(book.slug),row=raw.find(x=>{const key=norm(x?.slug??x?.bookmaker?.slug??x?.name??x?.bookmaker?.name);return key===target||key.includes(target)||target.includes(key)});if(!row)continue;const odds=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??row;if(odds&&typeof odds==='object'&&!Array.isArray(odds))out.push({...book,odds})}return out}
function exactMarket(odds,target){if(!odds||typeof odds!=='object')return null;const wanted=target==='1X2'?'1x2':target==='AH'?'asian_handicap':'goal_line';for(const [raw,value] of Object.entries(odds)){const key=String(raw).toLowerCase().replace(/[\s-]+/g,'_');if(key===wanted&&value&&typeof value==='object')return value}return null}
function stagePick(market,kind){if(!market||typeof market!=='object')return null;const live=['LIVE',market.inplay??market.in_play??market.live],close=['CLOSE',market.closing??market.close],open=['OPEN',market.opening??market.open],order=kind==='live'||kind==='finished'?[live,close,open]:[close,open];return order.find(([,v])=>v&&typeof v==='object')||null}
function marketValue(target,value){
  if(target==='1X2'){
    const h=num(value?.home),d=num(value?.draw),a=num(value?.away);
    if(h===null&&d===null&&a===null)return null;
    return{kind:'1X2',home:h,draw:d,away:a};
  }
  const line=num(value?.line??value?.hdp??value?.handicap??value?.total);
  if(target==='AH'){
    const h=num(value?.home??value?.home_odds??value?.homeOdds),a=num(value?.away??value?.away_odds??value?.awayOdds);
    if(line===null&&h===null&&a===null)return null;
    return{kind:'AH',line,home:h,away:a};
  }
  const o=num(value?.over??value?.over_odds??value?.overOdds),u=num(value?.under??value?.under_odds??value?.underOdds);
  if(line===null&&o===null&&u===null)return null;
  return{kind:'OU',line,over:o,under:u};
}
function marketCompact(f,target){
  const kind=classify(f);
  for(const book of providerBooks(f)){
    const market=exactMarket(book.odds,target),stage=stagePick(market,kind);
    if(!stage)continue;
    const detail=marketValue(target,stage[1]);
    if(detail)return{stage:stage[0],detail,book:book.name};
  }
  return{stage:'',detail:null,book:''};
}
function metricRows(f){const st=f?.statistics||{};return[['Shots on target',pair(st.shotsOnTarget),false],['Shots off target',pair(st.shotsOffTarget),false],['Corners',pair(f?.corners),false],['Attacks',pair(st.attacks),false],['Dangerous attacks',pair(st.dangerousAttacks),false],['Possession',pair(st.possession),true]]}
function statHtml(f){return metricRows(f).map(([label,p,pct])=>{const h=p.home,a=p.away,max=pct?100:Math.max(h??0,a??0,1),hw=h===null?0:Math.min(100,(h/max)*100),aw=a===null?0:Math.min(100,(a/max)*100),hv=h===null?'—':`${show(h,pct?1:0)}${pct?'%':''}`,av=a===null?'—':`${show(a,pct?1:0)}${pct?'%':''}`;return `<div class="stat-row"><b>${esc(hv)}</b><div class="stat-track home"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="stat-track away"><i style="width:${aw}%"></i></div><b>${esc(av)}</b></div>`}).join('')}
function eventMinute(e){return num(e?.minute??e?.elapsed??e?.time?.elapsed)}
function eventTeam(e){const t=e?.team??e?.team_name;return typeof t==='object'?String(t?.name??''):String(t??'')}
function eventType(e){return String(e?.type??e?.event??e?.name??e?.detail??'Match event')}
function eventsHtml(f){const events=Array.isArray(f?.events)?f.events.slice():[];if(!events.length)return'<div class="feature-empty">No recent events in the current snapshot.</div>';events.sort((a,b)=>(eventMinute(b)??0)-(eventMinute(a)??0));return `<div class="event-title">RECENT EVENTS</div>${events.slice(0,5).map(e=>{const m=eventMinute(e),team=eventTeam(e);return `<div class="event-item"><time>${esc(m===null?'—':`${Math.round(m)}'`)}</time><span>${esc(eventType(e))}${team?` · ${esc(team)}`:''}</span></div>`}).join('')}`}
function cardsLabel(f){const h=f?.cards?.home||{},a=f?.cards?.away||{},hy=num(h.yellow),hr=num(h.red),ay=num(a.yellow),ar=num(a.red);if([hy,hr,ay,ar].every(x=>x===null))return'—';return`${hy??0}Y/${hr??0}R · ${ay??0}Y/${ar??0}R`}
function cornersLabel(f){const p=pair(f?.corners);return p.home===null||p.away===null?'—':`${show(p.home)}–${show(p.away)}`}
function oddsAgeLabel(f){const at=dateMs(f?.providerOddsUpdatedAt);if(at===null)return'—';const sec=Math.max(0,Math.round((Date.now()-at)/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m`}
function featureFactsHtml(f){return `<div><span>HALF-TIME</span><b>${esc(halfScoreLabel(f)||'—')}</b></div><div><span>CORNERS</span><b>${esc(cornersLabel(f))}</b></div><div><span>CARDS H · A</span><b>${esc(cardsLabel(f))}</b></div><div><span>ODDS AGE</span><b>${esc(oddsAgeLabel(f))}</b></div>`}
function statusLabel(key){if(document.body.dataset.workspaceView==='signal')return key==='live'?'ACTIVE SIGNALS':key==='scheduled'?'UPCOMING SIGNALS':key==='unknown'?'WAITING SIGNALS':'FINISHED SIGNALS';return key==='live'?'LIVE MATCHES':key==='scheduled'?'UPCOMING MATCHES':key==='unknown'?'WAITING':'FINISHED MATCHES'}
function statusDotClass(key){return key==='live'?'live':key==='scheduled'?'upcoming':key==='unknown'?'waiting':'finished'}
function visibleRows(){const signalView=document.body.dataset.workspaceView==='signal';return fixtures.filter(f=>{if(signalView&&!signalFor(f))return false;if(!signalView&&statusFilter!=='all'&&classify(f)!==statusFilter)return false;if(leagueFilter!=='all'&&leagueName(f)!==leagueFilter)return false;if(query){const hay=[leagueName(f),f?.home?.name,f?.away?.name].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(query))return false}return true})}
function groupByLeague(rows){const map=new Map();for(const f of rows){const key=leagueName(f);if(!map.has(key))map.set(key,[]);map.get(key).push(f)}return[...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]))}
function marketCell(label,data){
  const title=[data.book,data.stage].filter(Boolean).join(' · '),d=data?.detail||null;
  const price=v=>num(v)===null?'—':num(v).toFixed(2);
  const signed=v=>{const n=num(v);if(n===null)return'—';const z=Math.abs(n)<1e-9?0:n;return`${z>0?'+':''}${show(z,2)}`};
  const plainLine=v=>num(v)===null?'—':show(num(v),2);
  let body='<div class="market-prices market-prices-empty"><strong>—</strong></div>';
  if(d?.kind==='1X2'){
    body=`<div class="market-prices market-prices-1x2"><div class="market-quote"><i>H</i><strong>${esc(price(d.home))}</strong></div><div class="market-quote"><i>D</i><strong>${esc(price(d.draw))}</strong></div><div class="market-quote"><i>A</i><strong>${esc(price(d.away))}</strong></div></div>`;
  }else if(d?.kind==='AH'){
    const hl=signed(d.line),al=num(d.line)===null?'—':signed(-num(d.line));
    body=`<div class="market-prices market-prices-ah"><div class="market-price-row"><i>H</i><em>${esc(hl)}</em><strong>${esc(price(d.home))}</strong></div><div class="market-price-row"><i>A</i><em>${esc(al)}</em><strong>${esc(price(d.away))}</strong></div></div>`;
  }else if(d?.kind==='OU'){
    const line=plainLine(d.line);
    body=`<div class="market-prices market-prices-ou"><div class="market-price-row"><i>O</i><em>${esc(line)}</em><strong>${esc(price(d.over))}</strong></div><div class="market-price-row"><i>U</i><em>${esc(line)}</em><strong>${esc(price(d.under))}</strong></div></div>`;
  }
  const kindClass=d?.kind?String(d.kind).toLowerCase().replace(/[^a-z0-9]+/g,'-'):'empty';
  return `<div class="market-cell market-cell-${kindClass}"${title?` title="${esc(title)}"`:''}><span class="market-head">${esc(label)}${data.stage?` · ${esc(data.stage)}`:''}</span>${body}${data.book?`<small>${esc(data.book)}</small>`:''}</div>`;
}
function inlineSignalHtml(s){
  if(!s)return '<div class="signal-cell prediction-live no-pick"><span class="pred-main">WATCH</span><span class="pred-sub">NO LIVE PICK</span></div>';
  const market=String(s?.marketLabel||s?.market||'SIGNAL').replace(/^FT_/i,'').replaceAll('_',' ').trim().toUpperCase()||'SIGNAL';
  const selection=String(s?.selection||'—').trim().toUpperCase()||'—';
  const line=num(s?.line??s?.selectionLine),odds=num(s?.odds);
  const lineText=line===null?'':`${line>0?'+':''}${show(line,2)}`;
  const pick=[selection,lineText].filter(Boolean).join(' ');
  return `<div class="signal-cell locked prediction-live"><span class="pred-main">${esc(market)} · ${esc(pick)}</span><span class="pred-sub">${odds===null?'LIVE':`@ ${odds.toFixed(2)}`}</span></div>`;
}
function rowHtml(f){const id=fixtureKey(f),kind=classify(f),active=id===selectedId,sig=signalFor(f),m1=marketCompact(f,'1X2'),mah=marketCompact(f,'AH'),mou=marketCompact(f,'OU'),half=halfScoreLabel(f);return `<article class="match-row ${active?'active':''}" data-match-id="${esc(id)}" tabindex="0" role="button" aria-label="${esc(f?.home?.name||'Home')} versus ${esc(f?.away?.name||'Away')}"><div class="teams-cell"><b>${esc(f?.home?.name||'—')}</b><b>${esc(f?.away?.name||'—')}</b></div><div class="score-cell">${scoreStack(f)}<small>${esc(kind==='live'?clockLabel(f):kind==='finished'?'FT':kickoffLabel(f))}</small>${half?`<small class="half-score">${esc(half)}</small>`:''}</div>${marketCell('1X2',m1)}${marketCell('AH',mah)}${marketCell('O/U',mou)}${inlineSignalHtml(sig)}</article>`}
/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */
function renderWorkspaceScorebar(){
  const slot=document.querySelector('[data-workspace-scorebar-slot]');
  if(!slot)return;
  const rows=fixtures.filter(function(f){return classify(f)==='live'}).slice(0,10);
  const cells=rows.map(function(f){
    const id=fixtureKey(f),p=scorePair(f),score=(p.home===null||p.away===null)?'—':(show(p.home)+'–'+show(p.away));
    return '<button type="button" class="workspace-scorebar-cell" data-workspace-score-id="'+esc(id)+'"><span class="workspace-scorebar-meta"><i>'+esc(detailedStatus(f))+'</i><b>'+esc(score)+'</b></span><span>'+esc(f?.home?.name||'—')+'</span><span class="away">'+esc(f?.away?.name||'—')+'</span></button>';
  });
  while(cells.length<10){
    const first=cells.length===0;
    cells.push('<div class="workspace-scorebar-cell placeholder"><span>'+(first?'No live matches':'—')+'</span><span class="away">—</span></div>');
  }
  slot.innerHTML='<div class="workspace-scorebar-grid">'+cells.join('')+'</div>';
  slot.querySelectorAll('[data-workspace-score-id]').forEach(function(btn){btn.onclick=function(){selectedId=btn.dataset.workspaceScoreId;renderBoard();renderFeatured()}});
}
document.addEventListener('ball46:stable-chrome-ready',renderWorkspaceScorebar);
function renderBoard(){renderWorkspaceScorebar();const host=$('[data-board-sections]');if(!host)return;const rows=visibleRows(),order=['live','scheduled','unknown','finished'],html=[];for(const key of order){const all=rows.filter(f=>classify(f)===key);if(!all.length)continue;const open=expandedGroups.has(key),shown=open?all:all.slice(0,COLLAPSED_LIMIT),leagueGroups=groupByLeague(shown);html.push(`<section class="status-section" data-status-section="${key}"><header class="status-head"><div><i class="status-dot ${statusDotClass(key)}"></i><h2>${statusLabel(key)}</h2></div><b>${all.length}</b></header>${leagueGroups.map(([league,list])=>`<section class="league-block"><header class="league-head"><strong>${esc(league)}</strong><span>${list.length} match${list.length===1?'':'es'}</span></header>${list.map(rowHtml).join('')}</section>`).join('')}${all.length>COLLAPSED_LIMIT?`<div class="show-more"><button type="button" data-expand-group="${key}">${open?'Show less':`View all ${all.length}`}</button></div>`:''}</section>`)}host.innerHTML=html.length?html.join(''):`<div class="board-empty">${document.body.dataset.workspaceView==='signal'?'No active signals match the current filters.':'No matches match the current filters.'}</div>`;$$('[data-match-id]').forEach(el=>{const choose=()=>{selectedId=el.dataset.matchId;renderBoard();renderFeatured()};el.addEventListener('click',choose);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose()}})});$$('[data-expand-group]').forEach(btn=>btn.addEventListener('click',()=>{const k=btn.dataset.expandGroup;expandedGroups.has(k)?expandedGroups.delete(k):expandedGroups.add(k);renderBoard()}))}
function setText(sel,v){const el=$(sel);if(el)el.textContent=String(v??'—')}
function renderSignalMarketCounts(){const counts={all:signalRows.length,'1x2':0,ah:0,ou:0,corners:0,cards:0,other:0};for(const s of signalRows){const k=signalMarketKey(s);if(k in counts)counts[k]++}$$('[data-signal-market-count]').forEach(el=>{const k=el.dataset.signalMarketCount;el.textContent=String(counts[k]||0)})}
function renderCounts(){renderSignalMarketCounts();const counts={live:0,scheduled:0,unknown:0,finished:0};fixtures.forEach(f=>counts[classify(f)]++);for(const [k,v] of Object.entries(counts)){const a=$(`[data-filter-count="${k}"]`),b=$(`[data-overview="${k}"]`);if(a)a.textContent=v;if(b)b.textContent=v}const all=$('[data-filter-count="all"]');if(all)all.textContent=fixtures.length;const activeSignals=num(signalMirror?.activeSignals)??signalMap.size,activeMatches=num(signalMirror?.activeMatches)??new Set(signalMap.keys()).size;setText('[data-signal-count]',activeSignals);setText('[data-active-match-count]',activeMatches);const age=num(boardMeta?.hubAgeMs);setText('[data-bulk-age]',age===null?'—':`${Math.max(0,Math.round(age/1000))}s`)}
function renderLeagueFilters(){const host=$('[data-league-filters]');if(!host)return;const map=new Map(),source=document.body.dataset.workspaceView==='signal'?fixtures.filter(f=>signalFor(f)):fixtures;for(const f of source){const l=leagueName(f);map.set(l,(map.get(l)||0)+1)}host.innerHTML=[...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).map(([name,count])=>`<button class="league-filter ${leagueFilter===name?'active':''}" data-league-filter="${esc(name)}"><span>${esc(name)}</span><b>${count}</b></button>`).join('')||'<div class="rail-empty">No leagues available</div>';$$('[data-league-filter]').forEach(btn=>btn.addEventListener('click',()=>{leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter;renderLeagueFilters();renderBoard()}))}
function clearFeatured(){selectedId=null;setText('[data-featured-league]','No active signal');setText('[data-featured-status]','—');setText('[data-featured-home]','—');setText('[data-featured-away]','—');setText('[data-featured-score]','—');const signal=$('[data-featured-signal]');if(signal){signal.innerHTML='No active signal';signal.classList.remove('locked');signal.title=''}const prediction=$('[data-prediction-content]');if(prediction){prediction.innerHTML='<div class="feature-empty">NO ACTIVE SIGNAL</div>';prediction.classList.remove('locked');prediction.title='No active signal'}const facts=$('[data-featured-facts]');if(facts)facts.innerHTML='<div><span>HALF-TIME</span><b>—</b></div><div><span>CORNERS</span><b>—</b></div><div><span>CARDS H · A</span><b>—</b></div><div><span>ODDS AGE</span><b>—</b></div>';const stats=$('[data-featured-stats]');if(stats)stats.innerHTML='<div class="feature-empty">No active signal match selected.</div>';const events=$('[data-featured-events]');if(events)events.innerHTML=''}
function renderFeatured(){const signalView=document.body.dataset.workspaceView==='signal',pool=signalView?visibleRows():fixtures;let f=pool.find(x=>fixtureKey(x)===selectedId);if(!f)f=pool.find(x=>classify(x)==='live')||pool.find(x=>classify(x)==='scheduled')||pool[0];if(!f){if(signalView)clearFeatured();return};selectedId=fixtureKey(f);setText('[data-featured-league]',leagueName(f));setText('[data-featured-status]',detailedStatus(f));setText('[data-featured-home]',f?.home?.name||'—');setText('[data-featured-away]',f?.away?.name||'—');setText('[data-featured-score]',scoreLabel(f));const signal=$('[data-featured-signal]'),s=signalFor(f);if(signal){signal.innerHTML=signalDetailsHtml(s);signal.classList.toggle('locked',Boolean(s));signal.title=s?signalSummary(s):''}const prediction=$('[data-prediction-content]');if(prediction){prediction.innerHTML=s?signalDetailsHtml(s):'<div class="feature-empty">WATCH · NO LIVE PICK</div>';prediction.classList.toggle('locked',Boolean(s));prediction.title=s?signalSummary(s):'No active live prediction'}const facts=$('[data-featured-facts]');if(facts)facts.innerHTML=featureFactsHtml(f);const stats=$('[data-featured-stats]');if(stats)stats.innerHTML=statHtml(f);const events=$('[data-featured-events]');if(events)events.innerHTML=eventsHtml(f)}
function setState(ok,payload){const el=$('[data-state]');if(!el)return;el.classList.remove('live','warn');if(!ok){el.classList.add('warn');el.querySelector('span').textContent='Live data unavailable';return}const age=num(payload?.hubAgeMs??payload?.ageMs),stale=Boolean(payload?.stale);el.classList.add(stale?'warn':'live');const seconds=age===null?null:Math.max(0,Math.round(age/1000));el.querySelector('span').textContent=stale?`Bulk data stale${seconds===null?'':` · ${seconds}s`}`:`Bulk data${seconds===null?' connected':` · ${seconds}s`}`;el.title=[payload?.hubVersion,payload?.version].filter(Boolean).join(' · ')}
async function fetchJson(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}_=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP_${r.status}`);return r.json()}
async function loadSignals(){if(document.visibilityState==='hidden')return;try{const j=await fetchJson(SIGNALS_API),rows=Array.isArray(j?.signals)?j.signals:[],next=new Map();rows.sort((a,b)=>Number(b?.createdAt||0)-Number(a?.createdAt||0));for(const s of rows){const id=String(s?.fixtureId??'').trim();if(id&&!next.has(id))next.set(id,s)}signalMap=next;signalRows=rows;signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{};window.dispatchEvent(new CustomEvent('ball46:signals-snapshot',{detail:{signals:signalRows.slice(),mirror:signalMirror}}))}catch(err){console.warn('Signals refresh failed; keeping last-good signal state',err)}}
async function load(){if(loading||(hasLoaded&&document.visibilityState==='hidden'))return;loading=true;try{const board=await fetchJson(API);if(board?.ok!==true)throw new Error(board?.error||'BOARD_NOT_READY');const rows=Array.isArray(board?.fixtures)?board.fixtures:[];boardMeta=board;fixtures=holdLastGoodOdds(rows).slice().sort((a,b)=>(dateMs(a?.kickoffAt??a?.kickoffUtc)??0)-(dateMs(b?.kickoffAt??b?.kickoffUtc)??0));if(selectedId&&!fixtures.some(f=>fixtureKey(f)===selectedId))selectedId=null;renderCounts();renderLeagueFilters();renderBoard();renderFeatured();setState(true,board)}catch(err){console.warn('Dashboard V2 refresh failed',err);setState(false,null)}finally{loading=false;hasLoaded=true}}
function setTheme(theme){const next=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=next;const btn=$('[data-theme-toggle]');if(btn)btn.textContent=next==='light'?'☾ Dark':'☀ Light';try{localStorage.setItem(THEME_KEY,next)}catch{}}
function initControls(){const tz=$('[data-timezone]');if(tz)tz.textContent=timeZone;const stored=(()=>{try{return localStorage.getItem(THEME_KEY)}catch{return null}})();setTheme(stored==='dark'?'dark':'light');$('[data-theme-toggle]')?.addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));$$('[data-status-filter]').forEach(btn=>btn.addEventListener('click',()=>{statusFilter=btn.dataset.statusFilter;$$('[data-status-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderBoard()}));$('[data-search]')?.addEventListener('input',e=>{query=String(e.target.value||'').trim().toLowerCase();renderBoard()});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()})}
function startSignalLoopAfterBoard(){let started=false;const begin=()=>{if(started)return;started=true;setTimeout(()=>{loadSignals();setInterval(loadSignals,SIGNAL_POLL_MS)},SIGNAL_AFTER_BOARD_MS)};const onReady=()=>{if(hasLoaded){window.removeEventListener('ball46:board-first-paint',onReady);begin()}};window.addEventListener('ball46:board-first-paint',onReady);return begin}
function syncWorkspaceMode(){const signalView=document.body.dataset.workspaceView==='signal';setText('[data-featured-kicker]',signalView?'FEATURED SIGNAL':'FEATURED MATCH');setText('[data-prediction-kicker]',signalView?'SIGNAL OUTLOOK':'LIVE PREDICTION');$$('[data-status-filter]').forEach(btn=>btn.classList.toggle('active',!signalView&&btn.dataset.statusFilter===statusFilter))}
function rerenderWorkspaceMode(){syncWorkspaceMode();if(selectedId&&!visibleRows().some(f=>fixtureKey(f)===selectedId))selectedId=null;renderLeagueFilters();renderBoard();renderFeatured()}
function start(){initControls();document.addEventListener('ball46:workspace-view',rerenderWorkspaceMode);document.addEventListener('ball46:signal-market',rerenderWorkspaceMode);syncWorkspaceMode();const beginSignals=startSignalLoopAfterBoard();const first=load();Promise.resolve(first).finally(()=>{window.dispatchEvent(new CustomEvent('ball46:board-first-paint'));beginSignals()});setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BOARD_FIRST_THEN_SIGNALS',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
