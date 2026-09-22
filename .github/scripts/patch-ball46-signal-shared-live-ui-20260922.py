from pathlib import Path
import re

ROOT = Path('nomad-live-343')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, got {count}')
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=0):
    out, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 regex match, got {count}')
    return out

# --- index.html: remove standalone Signal page, keep shared Live shell, add slim market filter ---
p = ROOT / 'index.html'
h = p.read_text()
h = re.sub(r'\s*<link[^>]+signal-shared-view-343\.css[^>]*>', '', h, flags=re.I)
h = h.replace('</head>', '<link rel="stylesheet" href="/signal-shared-view-343.css?v=20260922a">\n</head>', 1)
h = regex_once(
    h,
    r'\s*<div class="workspace-panel sp-signal" data-workspace-panel="signal" hidden>.*?<p class="next-note">.*?</p>\s*</div>\s*(?=<div class="workspace-panel" data-workspace-panel="statistics")',
    '\n\n',
    'remove standalone signal panel',
    flags=re.S,
)
h = re.sub(r'\s*<script[^>]+signal-next\.js[^>]*></script>', '', h, flags=re.I)
market_toolbar = '''<div class="signal-market-toolbar" data-signal-market-toolbar hidden aria-label="Signal market filter"><span class="signal-market-label">SIGNAL MARKET</span><button type="button" class="signal-market-chip active" data-signal-market="all">ALL <b data-signal-market-count="all">0</b></button><button type="button" class="signal-market-chip" data-signal-market="1x2">1X2 <b data-signal-market-count="1x2">0</b></button><button type="button" class="signal-market-chip" data-signal-market="ah">AH <b data-signal-market-count="ah">0</b></button><button type="button" class="signal-market-chip" data-signal-market="ou">O/U <b data-signal-market-count="ou">0</b></button><button type="button" class="signal-market-chip" data-signal-market="corners">CORNERS <b data-signal-market-count="corners">0</b></button><button type="button" class="signal-market-chip" data-signal-market="cards">CARDS <b data-signal-market-count="cards">0</b></button><button type="button" class="signal-market-chip" data-signal-market="other">OTHER <b data-signal-market-count="other">0</b></button></div>'''
h = regex_once(
    h,
    r'(<section class="main-board"><div class="board-toolbar">.*?</div>)(<div class="board-sections")',
    r'\1' + market_toolbar + r'\2',
    'insert shared signal market toolbar',
    flags=re.S,
)
h = replace_once(h, '<span class="kicker">FEATURED MATCH</span>', '<span class="kicker" data-featured-kicker>FEATURED MATCH</span>', 'featured kicker marker')
h = replace_once(h, '<span class="kicker">LIVE PREDICTION</span>', '<span class="kicker" data-prediction-kicker>LIVE PREDICTION</span>', 'prediction kicker marker')
h = re.sub(r'dashboard-v2-stage3\.js\?[^"\']+', 'dashboard-v2-stage3.js?v=343-dashboard-v2-stage3-v6-signal-shared', h, count=1)
h = re.sub(r'singlepage-workspace-343\.js\?[^"\']+', 'singlepage-workspace-343.js?v=343-singlepage-20260922-signal-shared', h, count=1)
if 'data-workspace-panel="signal"' in h:
    raise SystemExit('standalone signal panel still present')
if 'signal-next.js' in h:
    raise SystemExit('signal-next reference still present')
if h.count('data-signal-market-toolbar') != 1:
    raise SystemExit('signal market toolbar count mismatch')
p.write_text(h)

# --- singlepage-workspace-343.js: route Signal to Live panel and own market filter state ---
p = ROOT / 'singlepage-workspace-343.js'
s = p.read_text()
s = replace_once(
    s,
    "const state={view:'live',market:'all',variant:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsLoadedAt:0};",
    "const state={view:'live',signalMarket:'all',market:'all',variant:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsLoadedAt:0};",
    'state signal market',
)
s = replace_once(
    s,
    "function parseRoute(){const q=new URLSearchParams(location.search),view=q.get('view'),market=q.get('market'),variant=q.get('variant'),filter=q.get('filter');state.view=['live','signal','statistics'].includes(view)?view:'live';state.market=MARKETS.some(m=>m.id===market)?market:'all';const allowed=window.BALL46_MARKET_REGISTRY?.variants?.(state.market)||[];state.variant=allowed.some(v=>v.key===variant)?variant:'all';state.filter=filter||'all';state.page=Math.max(1,Number(q.get('page'))||1);return q.get('status')||'all'}",
    "function parseRoute(){const q=new URLSearchParams(location.search),view=q.get('view'),signalMarket=q.get('signalMarket'),market=q.get('market'),variant=q.get('variant'),filter=q.get('filter');state.view=['live','signal','statistics'].includes(view)?view:'live';state.signalMarket=['all','1x2','ah','ou','corners','cards','other'].includes(signalMarket)?signalMarket:'all';state.market=MARKETS.some(m=>m.id===market)?market:'all';const allowed=window.BALL46_MARKET_REGISTRY?.variants?.(state.market)||[];state.variant=allowed.some(v=>v.key===variant)?variant:'all';state.filter=filter||'all';state.page=Math.max(1,Number(q.get('page'))||1);return q.get('status')||'all'}",
    'route parse signal market',
)
s = replace_once(
    s,
    "function writeRoute({replace=false,status=null}={}){const q=new URLSearchParams();if(state.view!=='live')q.set('view',state.view);if(state.view==='statistics'&&state.market!=='all')q.set('market',state.market);if(state.view==='statistics'&&state.variant!=='all')q.set('variant',state.variant);if(state.view==='statistics'&&state.filter!=='all')q.set('filter',state.filter);if(state.view==='statistics'&&state.page>1)q.set('page',state.page);if(state.view==='live'&&status&&status!=='all')q.set('status',status);const url=`${location.pathname}${q.toString()?`?${q}`:''}`;(replace?history.replaceState:history.pushState).call(history,null,'',url)}",
    "function writeRoute({replace=false,status=null}={}){const q=new URLSearchParams();if(state.view!=='live')q.set('view',state.view);if(state.view==='signal'&&state.signalMarket!=='all')q.set('signalMarket',state.signalMarket);if(state.view==='statistics'&&state.market!=='all')q.set('market',state.market);if(state.view==='statistics'&&state.variant!=='all')q.set('variant',state.variant);if(state.view==='statistics'&&state.filter!=='all')q.set('filter',state.filter);if(state.view==='statistics'&&state.page>1)q.set('page',state.page);if(state.view==='live'&&status&&status!=='all')q.set('status',status);const url=`${location.pathname}${q.toString()?`?${q}`:''}`;(replace?history.replaceState:history.pushState).call(history,null,'',url)}",
    'route write signal market',
)
s = replace_once(
    s,
    "function dispatchView(){document.body.dataset.workspaceView=state.view;document.dispatchEvent(new CustomEvent('ball46:workspace-view',{detail:{view:state.view,market:state.market}}))}",
    "function syncSignalMarketUi(){document.body.dataset.signalMarket=state.signalMarket;const bar=$('[data-signal-market-toolbar]');if(bar)bar.hidden=state.view!=='signal';$$('[data-signal-market]').forEach(b=>b.classList.toggle('active',state.view==='signal'&&b.dataset.signalMarket===state.signalMarket))}\nfunction dispatchView(){syncSignalMarketUi();document.body.dataset.workspaceView=state.view;document.dispatchEvent(new CustomEvent('ball46:workspace-view',{detail:{view:state.view,market:state.market,signalMarket:state.signalMarket}}))}\nfunction dispatchSignalMarket(){syncSignalMarketUi();document.dispatchEvent(new CustomEvent('ball46:signal-market',{detail:{market:state.signalMarket}}))}",
    'signal market ui dispatch',
)
s = replace_once(
    s,
    "function setView(view,{market=null,push=true}={}){state.view=view;if(market){state.market=market;state.variant='all';state.filter='all';state.page=1}$$('[data-workspace-panel]').forEach(p=>p.hidden=p.dataset.workspacePanel!==view);$$('[data-workspace-view]').forEach(b=>b.classList.toggle('active',b.dataset.workspaceView===view));$$('[data-stat-market]').forEach(b=>b.classList.toggle('active',view==='statistics'&&b.dataset.statMarket===state.market));const leagues=$('[data-league-card]');if(leagues)leagues.hidden=false;paintHeading();if(view==='statistics'){startStatistics();if(state.statsLoaded)renderStats()}else stopStatistics();dispatchView();if(push)writeRoute()}",
    "function setView(view,{market=null,push=true}={}){state.view=view;if(market){state.market=market;state.variant='all';state.filter='all';state.page=1}const panelView=view==='signal'?'live':view;$$('[data-workspace-panel]').forEach(p=>p.hidden=p.dataset.workspacePanel!==panelView);$$('[data-workspace-view]').forEach(b=>b.classList.toggle('active',b.dataset.workspaceView===view));$$('[data-stat-market]').forEach(b=>b.classList.toggle('active',view==='statistics'&&b.dataset.statMarket===state.market));const leagues=$('[data-league-card]');if(leagues)leagues.hidden=false;paintHeading();if(view==='statistics'){startStatistics();if(state.statsLoaded)renderStats()}else stopStatistics();dispatchView();if(push)writeRoute()}",
    'signal uses live panel',
)
s = replace_once(
    s,
    " $$('[data-stat-market]').forEach(b=>b.addEventListener('click',()=>setView('statistics',{market:b.dataset.statMarket})));\n $$('[data-status-filter]').forEach(b=>b.addEventListener('click',()=>{setView('live',{push:false});writeRoute({status:b.dataset.statusFilter||'all'})}));",
    " $$('[data-stat-market]').forEach(b=>b.addEventListener('click',()=>setView('statistics',{market:b.dataset.statMarket})));\n $$('[data-signal-market]').forEach(b=>b.addEventListener('click',()=>{state.signalMarket=b.dataset.signalMarket||'all';writeRoute();dispatchSignalMarket()}));\n $$('[data-status-filter]').forEach(b=>b.addEventListener('click',()=>{setView('live',{push:false});writeRoute({status:b.dataset.statusFilter||'all'})}));",
    'bind signal market buttons',
)
if "dataWorkspacePanel!==view" in s:
    raise SystemExit('old direct signal-panel routing still present')
p.write_text(s)

# --- dashboard-v2-stage3.js: filter the existing Live card system by active signals/market ---
p = ROOT / 'dashboard-v2-stage3.js'
d = p.read_text()
d = replace_once(
    d,
    "function signalFor(f){return signalMap.get(fixtureKey(f))||null}",
    "function signalMarketKey(s){const x=String(s?.marketLabel||s?.market||s?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';if(/asian|handicap|(^|[^a-z])ah([^a-z]|$)/.test(x))return'ah';if(/over|under|o\\/u|goal[_ -]?line|total/.test(x))return'ou';return'other'}\nfunction signalsFor(f){const id=fixtureKey(f);return signalRows.filter(s=>String(s?.fixtureId??'').trim()===id)}\nfunction signalFor(f){const id=fixtureKey(f),rows=signalsFor(f),signalView=document.body.dataset.workspaceView==='signal',market=document.body.dataset.signalMarket||'all';if(signalView&&market!=='all')return rows.find(s=>signalMarketKey(s)===market)||null;return rows[0]||signalMap.get(id)||null}",
    'dashboard signal market resolver',
)
d = replace_once(
    d,
    "function statusLabel(key){return key==='live'?'LIVE MATCHES':key==='scheduled'?'UPCOMING MATCHES':key==='unknown'?'WAITING':'FINISHED MATCHES'}",
    "function statusLabel(key){if(document.body.dataset.workspaceView==='signal')return key==='live'?'ACTIVE SIGNALS':key==='scheduled'?'UPCOMING SIGNALS':key==='unknown'?'WAITING SIGNALS':'FINISHED SIGNALS';return key==='live'?'LIVE MATCHES':key==='scheduled'?'UPCOMING MATCHES':key==='unknown'?'WAITING':'FINISHED MATCHES'}",
    'signal contextual section title',
)
d = replace_once(
    d,
    "function visibleRows(){return fixtures.filter(f=>{if(statusFilter!=='all'&&classify(f)!==statusFilter)return false;if(leagueFilter!=='all'&&leagueName(f)!==leagueFilter)return false;if(query){const hay=[leagueName(f),f?.home?.name,f?.away?.name].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(query))return false}return true})}",
    "function visibleRows(){const signalView=document.body.dataset.workspaceView==='signal';return fixtures.filter(f=>{if(signalView&&!signalFor(f))return false;if(!signalView&&statusFilter!=='all'&&classify(f)!==statusFilter)return false;if(leagueFilter!=='all'&&leagueName(f)!==leagueFilter)return false;if(query){const hay=[leagueName(f),f?.home?.name,f?.away?.name].filter(Boolean).join(' ').toLowerCase();if(!hay.includes(query))return false}return true})}",
    'visible rows signal filter',
)
d = replace_once(
    d,
    "host.innerHTML=html.length?html.join(''):'<div class=\"board-empty\">No matches match the current filters.</div>';",
    "host.innerHTML=html.length?html.join(''):`<div class=\"board-empty\">${document.body.dataset.workspaceView==='signal'?'No active signals match the current filters.':'No matches match the current filters.'}</div>`;",
    'signal empty state',
)
d = replace_once(
    d,
    "function renderCounts(){const counts={live:0,scheduled:0,unknown:0,finished:0};",
    "function renderSignalMarketCounts(){const counts={all:signalRows.length,'1x2':0,ah:0,ou:0,corners:0,cards:0,other:0};for(const s of signalRows){const k=signalMarketKey(s);if(k in counts)counts[k]++}$$('[data-signal-market-count]').forEach(el=>{const k=el.dataset.signalMarketCount;el.textContent=String(counts[k]||0)})}\nfunction renderCounts(){renderSignalMarketCounts();const counts={live:0,scheduled:0,unknown:0,finished:0};",
    'signal market counts',
)
d = replace_once(
    d,
    "function renderLeagueFilters(){const host=$('[data-league-filters]');if(!host)return;const map=new Map();for(const f of fixtures){const l=leagueName(f);map.set(l,(map.get(l)||0)+1)}",
    "function renderLeagueFilters(){const host=$('[data-league-filters]');if(!host)return;const map=new Map(),source=document.body.dataset.workspaceView==='signal'?fixtures.filter(f=>signalFor(f)):fixtures;for(const f of source){const l=leagueName(f);map.set(l,(map.get(l)||0)+1)}",
    'signal-scoped league list',
)
d = replace_once(
    d,
    "function renderFeatured(){let f=fixtures.find(x=>fixtureKey(x)===selectedId);if(!f)f=fixtures.find(x=>classify(x)==='live')||fixtures.find(x=>classify(x)==='scheduled')||fixtures[0];if(!f)return;",
    "function clearFeatured(){selectedId=null;setText('[data-featured-league]','No active signal');setText('[data-featured-status]','—');setText('[data-featured-home]','—');setText('[data-featured-away]','—');setText('[data-featured-score]','—');const signal=$('[data-featured-signal]');if(signal){signal.innerHTML='No active signal';signal.classList.remove('locked');signal.title=''}const prediction=$('[data-prediction-content]');if(prediction){prediction.innerHTML='<div class=\"feature-empty\">NO ACTIVE SIGNAL</div>';prediction.classList.remove('locked');prediction.title='No active signal'}const facts=$('[data-featured-facts]');if(facts)facts.innerHTML='<div><span>HALF-TIME</span><b>—</b></div><div><span>CORNERS</span><b>—</b></div><div><span>CARDS H · A</span><b>—</b></div><div><span>ODDS AGE</span><b>—</b></div>';const stats=$('[data-featured-stats]');if(stats)stats.innerHTML='<div class=\"feature-empty\">No active signal match selected.</div>';const events=$('[data-featured-events]');if(events)events.innerHTML=''}\nfunction renderFeatured(){const signalView=document.body.dataset.workspaceView==='signal',pool=signalView?visibleRows():fixtures;let f=pool.find(x=>fixtureKey(x)===selectedId);if(!f)f=pool.find(x=>classify(x)==='live')||pool.find(x=>classify(x)==='scheduled')||pool[0];if(!f){if(signalView)clearFeatured();return};",
    'signal featured pool',
)
d = replace_once(
    d,
    "function start(){initControls();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}}",
    "function syncWorkspaceMode(){const signalView=document.body.dataset.workspaceView==='signal';setText('[data-featured-kicker]',signalView?'FEATURED SIGNAL':'FEATURED MATCH');setText('[data-prediction-kicker]',signalView?'SIGNAL OUTLOOK':'LIVE PREDICTION');$$('[data-status-filter]').forEach(btn=>btn.classList.toggle('active',!signalView&&btn.dataset.statusFilter===statusFilter))}\nfunction rerenderWorkspaceMode(){syncWorkspaceMode();if(selectedId&&!visibleRows().some(f=>fixtureKey(f)===selectedId))selectedId=null;renderLeagueFilters();renderBoard();renderFeatured()}\nfunction start(){initControls();document.addEventListener('ball46:workspace-view',rerenderWorkspaceMode);document.addEventListener('ball46:signal-market',rerenderWorkspaceMode);syncWorkspaceMode();load();setInterval(load,POLL_MS);window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}}",
    'dashboard shared view events',
)
if 'next-signal-card' in d or 'data-next-signal' in d:
    raise SystemExit('standalone signal renderer leaked into dashboard')
p.write_text(d)

# signal-next.js is obsolete in the shared-view architecture.
legacy = ROOT / 'signal-next.js'
if legacy.exists():
    legacy.unlink()

print('BALL46_SIGNAL_SHARED_VIEW_PATCH_OK')
