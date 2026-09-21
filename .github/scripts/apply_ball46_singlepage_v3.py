from pathlib import Path
import re

# 1) Expose the signal snapshot already fetched by Page 1.
dash = Path('nomad-live-343/dashboard-v2-stage3.js')
s = dash.read_text()
if 'let signalRows=[];' not in s:
    s = s.replace('let signalMirror={};', 'let signalMirror={};\nlet signalRows=[];', 1)
old = "signalMap=next;signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{}"
new = "signalMap=next;signalRows=rows;signalMirror=j?.mirror&&typeof j.mirror==='object'?j.mirror:{};window.dispatchEvent(new CustomEvent('ball46:signals-snapshot',{detail:{signals:signalRows.slice(),mirror:signalMirror}}))"
if old in s:
    s = s.replace(old, new, 1)
elif 'ball46:signals-snapshot' not in s:
    raise SystemExit('dashboard signal hook anchor not found')
old_export = "window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null}"
new_export = "window.NOMAD343_DASHBOARD_V2={version:VERSION,reload:load,mode:'BULK_PLUS_CENTRAL_RICH_VISIBLE',applyRichOdds,getFixture:id=>fixtures.find(f=>fixtureKey(f)===String(id))||null,getSignals:()=>signalRows.slice(),getSignalMirror:()=>signalMirror}"
if old_export in s:
    s = s.replace(old_export, new_export, 1)
elif 'getSignals:()=>signalRows.slice()' not in s:
    raise SystemExit('dashboard export anchor not found')
dash.write_text(s)

# 2) Signal subview consumes Page 1 snapshot only; no extra signal API polling.
sig = Path('nomad-live-343/signal-next.js')
s = sig.read_text()
s = s.replace("const API='/api/engine/signals';\nconst POLL=30000;\n", '')
s = s.replace('let active=false,timer=0,loading=false;', 'let active=false,lastRows=[];')
pattern = re.compile(r"async function load\(\)\{.*?function syncView\(view\)\{if\(view==='signal'\)start\(\);else stop\(\)\}", re.S)
replacement = """function consume(rows){lastRows=Array.isArray(rows)?rows:[];if(active)render(lastRows)}
function readPageOneSnapshot(){const api=window.NOMAD343_DASHBOARD_V2;return api&&typeof api.getSignals==='function'?api.getSignals():[]}
function start(){active=true;consume(readPageOneSnapshot());if(!lastRows.length)state('live','Waiting for Page 1 signal snapshot')}
function stop(){active=false}
function syncView(view){if(view==='signal')start();else stop()}"""
s2, n = pattern.subn(replacement, s, count=1)
if n != 1 and 'function readPageOneSnapshot()' not in s:
    raise SystemExit('signal polling block anchor not found')
s = s2 if n else s
s = s.replace("document.addEventListener('click',e=>{const b=e.target.closest('[data-next-toggle]');if(!b||!active)return;const id=b.getAttribute('data-next-toggle');if(openIds.has(id))openIds.delete(id);else openIds.add(id);load()});", "document.addEventListener('click',e=>{const b=e.target.closest('[data-next-toggle]');if(!b||!active)return;const id=b.getAttribute('data-next-toggle');if(openIds.has(id))openIds.delete(id);else openIds.add(id);render(lastRows)});")
if "ball46:signals-snapshot" not in s:
    s = s.replace("document.addEventListener('ball46:workspace-view',e=>syncView(e.detail?.view));", "window.addEventListener('ball46:signals-snapshot',e=>consume(e.detail?.signals));\ndocument.addEventListener('ball46:workspace-view',e=>syncView(e.detail?.view));")
sig.write_text(s)

# 3) Statistics is lazy and one-shot cached. Engine /statistics is storage-only.
sp = Path('nomad-live-343/singlepage-workspace-343.js')
s = sp.read_text()
s = s.replace('const POLL_MS=45000;', 'const STAT_CACHE_MS=300000;')
s = s.replace("const state={view:'live',market:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsTimer:0};", "const state={view:'live',market:'all',filter:'all',page:1,rows:[],statsLoaded:false,statsLoading:false,statsLoadedAt:0};")
old = "function stopStatistics(){if(state.statsTimer){clearInterval(state.statsTimer);state.statsTimer=0}}\nfunction startStatistics(){loadStatistics();if(!state.statsTimer)state.statsTimer=setInterval(()=>{if(state.view==='statistics')loadStatistics()},POLL_MS)}"
new = "function stopStatistics(){}\nfunction startStatistics(){if(state.statsLoaded&&Date.now()-state.statsLoadedAt<STAT_CACHE_MS){renderStats();return}loadStatistics()}"
if old in s:
    s = s.replace(old, new, 1)
elif 'Date.now()-state.statsLoadedAt<STAT_CACHE_MS' not in s:
    raise SystemExit('statistics polling anchor not found')
s = s.replace('state.rows=j.rows;state.statsLoaded=true;renderStats();', 'state.rows=j.rows;state.statsLoaded=true;state.statsLoadedAt=Date.now();renderStats();')
s = s.replace("const leagues=$('[data-league-card]');if(leagues)leagues.hidden=view!=='live';", "const leagues=$('[data-league-card]');if(leagues)leagues.hidden=false;")
sp.write_text(s)

# 4) Lock sidebar geometry across Live / Signal / Statistics.
css = Path('nomad-live-343/singlepage-workspace-343.css')
c = css.read_text()
if '/* LEFT RAIL GEOMETRY LOCK V3 */' not in c:
    c += '''\n/* LEFT RAIL GEOMETRY LOCK V3 */\n.workspace.singlepage>.left-rail{display:flex;flex-direction:column;gap:10px}\n.workspace.singlepage>.left-rail>.rail-card{margin:0!important;width:100%;box-sizing:border-box;flex:0 0 auto}\n.workspace.singlepage>.left-rail .rail-title{height:30px;min-height:30px;max-height:30px;box-sizing:border-box;display:flex;align-items:center}\n.workspace.singlepage>.left-rail .filter,.workspace.singlepage>.left-rail .workspace-nav-row{height:34px;min-height:34px;max-height:34px;box-sizing:border-box}\n.workspace.singlepage>.left-rail .workspace-brand-card{height:76px;min-height:76px;max-height:76px}\n.workspace.singlepage>.left-rail .workspace-brand-row{height:48px;min-height:48px;max-height:48px}\n.workspace.singlepage>.left-rail .workspace-brand-meta{height:28px;min-height:28px;max-height:28px}\n.workspace.singlepage>.left-rail .workspace-stats-card{min-height:302px}\n.workspace.singlepage>.left-rail [data-league-card]{min-height:110px}\n@media(max-width:760px){.workspace.singlepage>.left-rail{gap:8px}.workspace.singlepage>.left-rail .workspace-brand-card{height:44px;min-height:44px;max-height:44px}.workspace.singlepage>.left-rail .workspace-brand-row{height:44px;min-height:44px;max-height:44px}.workspace.singlepage>.left-rail .workspace-stats-card{min-height:0}.workspace.singlepage>.left-rail [data-league-card]{min-height:0}}\n'''
css.write_text(c)

# 5) Asset revisions.
idx = Path('nomad-live-343/index.html')
h = idx.read_text()
h = h.replace('singlepage-workspace-343.css?v=343-singlepage-20260921-2','singlepage-workspace-343.css?v=343-singlepage-20260921-3')
h = h.replace('signal-next.js?v=343-singlepage-signal-2','signal-next.js?v=343-singlepage-signal-3')
h = h.replace('singlepage-workspace-343.js?v=343-singlepage-20260921-2','singlepage-workspace-343.js?v=343-singlepage-20260921-3')
idx.write_text(h)
