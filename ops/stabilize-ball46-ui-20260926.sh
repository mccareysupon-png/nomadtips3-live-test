#!/usr/bin/env bash
set -euo pipefail
BALL46_WORKER="https://ball46-production.mccarey-supon.workers.dev"
BALL46_PUBLIC="https://www.ball46.com"
mkdir -p /tmp/prod /tmp/rollback /tmp/verify

fetch_required(){
  name="$1"; safe="${name//\//_}"
  code=$(curl -sS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 -o "/tmp/prod/$safe" -w '%{http_code}' "$BALL46_WORKER/$name?ui-stable-copy=${GITHUB_RUN_ID}") || true
  [ "$code" = 200 ] || { echo "PROD_ASSET_HTTP_${code}:$name"; exit 1; }
  test -s "/tmp/prod/$safe" || { echo "PROD_ASSET_EMPTY:$name"; exit 1; }
  mkdir -p "$(dirname "nomad-live-343/$name")"
  cp "/tmp/prod/$safe" "nomad-live-343/$name"
}

fetch_required index.html
python3 - <<'PY' > /tmp/index-assets.txt
from pathlib import Path
import re
h=Path('nomad-live-343/index.html').read_text(errors='ignore')
found=set()
for x in re.findall(r'''(?:src|href)=["']([^"']+)["']''',h,re.I):
    x=x.split('?',1)[0].split('#',1)[0].strip().lstrip('./').lstrip('/')
    if not x or '://' in x or '/' in x: continue
    if re.search(r'\.(?:js|css|svg|json|png|webp|jpg|jpeg|ico)$',x,re.I): found.add(x)
for x in sorted(found): print(x)
PY
while IFS= read -r name; do [ -n "$name" ] && fetch_required "$name"; done < /tmp/index-assets.txt

for f in dashboard-v2-stage3.js singlepage-workspace-343.js singlepage-workspace-343.css; do
  fetch_required "$f"
  cp "nomad-live-343/$f" "/tmp/rollback/$f"
  sha256sum "nomad-live-343/$f" | awk '{print $1}' > "/tmp/${f}.before.sha"
done
sha256sum nomad-live-343/index.html | awk '{print $1}' > /tmp/index.before.sha

grep -Fc 'fetch(' nomad-live-343/dashboard-v2-stage3.js > /tmp/dashboard.fetch.before
grep -Fc 'fetch(' nomad-live-343/singlepage-workspace-343.js > /tmp/singlepage.fetch.before

grep -Fq "const API='/api/engine/board'" nomad-live-343/dashboard-v2-stage3.js
grep -Fq "const SIGNALS_API='/api/engine/signals'" nomad-live-343/dashboard-v2-stage3.js
grep -Fq "const STAT_API='/api/engine/statistics'" nomad-live-343/singlepage-workspace-343.js
grep -Fq 'function renderBoard(){' nomad-live-343/dashboard-v2-stage3.js
grep -Fq 'function parseRoute(){' nomad-live-343/singlepage-workspace-343.js

after_api_check(){
  prefix="$1"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/board?${prefix}=${GITHUB_RUN_ID}" -o "/tmp/${prefix}-board.json"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/signals?${prefix}=${GITHUB_RUN_ID}" -o "/tmp/${prefix}-signals.json"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/statistics?${prefix}=${GITHUB_RUN_ID}" -o "/tmp/${prefix}-statistics.json"
  PREFIX="$prefix" node - <<'NODE'
const fs=require('fs'); const p=process.env.PREFIX;
const b=JSON.parse(fs.readFileSync(`/tmp/${p}-board.json`));
const s=JSON.parse(fs.readFileSync(`/tmp/${p}-signals.json`));
const t=JSON.parse(fs.readFileSync(`/tmp/${p}-statistics.json`));
if(b?.ok!==true||!Array.isArray(b?.fixtures)) throw Error('BOARD_UNHEALTHY');
if(!Array.isArray(s?.signals)) throw Error('SIGNALS_UNHEALTHY');
if(t?.ok!==true||!Array.isArray(t?.rows)) throw Error('STATISTICS_UNHEALTHY');
console.log('API_OK',p,{fixtures:b.fixtures.length,signals:s.signals.length,settled:t.rows.length});
NODE
}
after_api_check before

python3 - <<'PY'
from pathlib import Path

# Shared stable chrome: move the existing search/time toolbar, do not create another data path.
p=Path('nomad-live-343/singlepage-workspace-343.js')
s=p.read_text()
marker='BALL46_UI_STABLE_CHROME_20260926'
if marker in s: raise SystemExit('STABLE_CHROME_ALREADY_PRESENT')
anchor='function parseRoute(){'
if s.count(anchor)!=1: raise SystemExit(f'PARSE_ROUTE_ANCHOR_COUNT:{s.count(anchor)}')
code=r'''/* BALL46_UI_STABLE_CHROME_20260926 — presentation only */
function ensureStableChrome(){
  const stage=$('.workspace-stage');
  if(!stage)return;
  let head=stage.querySelector('[data-workspace-stable-head]');
  if(!head){
    head=document.createElement('section');
    head.className='workspace-stable-head';
    head.dataset.workspaceStableHead='1';
    head.innerHTML='<div class="workspace-stable-copy"><span data-workspace-stable-kicker>WORKSPACE</span><b data-workspace-stable-title>Today\'s Matches</b></div><div class="workspace-stable-toolbar-host" data-workspace-stable-toolbar-host></div>';
    stage.insertBefore(head,stage.firstChild);
  }
  let slot=stage.querySelector('[data-workspace-scorebar-slot]');
  if(!slot){
    slot=document.createElement('section');
    slot.className='workspace-scorebar-slot';
    slot.dataset.workspaceScorebarSlot='1';
    slot.setAttribute('aria-label','Live match scorebar');
    head.insertAdjacentElement('afterend',slot);
  }
  const toolbar=$('.board-toolbar'),host=head.querySelector('[data-workspace-stable-toolbar-host]');
  if(toolbar&&host&&toolbar.parentNode!==host){toolbar.classList.add('workspace-toolbar-shared');host.appendChild(toolbar)}
}
function updateStableChrome(){
  const kicker=$('[data-workspace-stable-kicker]'),title=$('[data-workspace-stable-title]');
  if(!kicker||!title)return;
  if(state.view==='signal'){kicker.textContent='LIVE SIGNAL CENTER';title.textContent='Active Signals';return}
  if(state.view==='statistics'){
    const m=MARKETS.find(x=>x.id===state.market)||MARKETS[0];
    kicker.textContent='STATISTICS V2';title.textContent=m.label||'Statistics';return
  }
  kicker.textContent='MATCH STATUS';title.textContent="Today's Matches";
}
'''
s=s.replace(anchor,code+anchor,1)
old="function setView(view,{market=null,push=true}={}){state.view=view;if(market){state.market=market;state.variant='all';state.filter='all';state.page=1}$$('[data-workspace-panel]')"
new="function setView(view,{market=null,push=true}={}){state.view=view;ensureStableChrome();if(market){state.market=market;state.variant='all';state.filter='all';state.page=1}updateStableChrome();$$('[data-workspace-panel]')"
if old not in s: raise SystemExit('SET_VIEW_ANCHOR_MISSING')
s=s.replace(old,new,1)
p.write_text(s)

# Stable scorebar: use already-loaded board fixtures, independent from current status filter.
p=Path('nomad-live-343/dashboard-v2-stage3.js')
s=p.read_text()
marker='BALL46_WORKSPACE_SCOREBAR_20260926'
if marker in s: raise SystemExit('WORKSPACE_SCOREBAR_ALREADY_PRESENT')
anchor='function renderBoard(){'
if s.count(anchor)!=1: raise SystemExit(f'RENDER_BOARD_ANCHOR_COUNT:{s.count(anchor)}')
code=r'''/* BALL46_WORKSPACE_SCOREBAR_20260926 — UI only, zero extra requests */
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
'''
s=s.replace(anchor,code+'function renderBoard(){renderWorkspaceScorebar();',1)
p.write_text(s)

# Presentation CSS only: fixed shared header + fixed scorebar slot; hide duplicate per-view headers.
p=Path('nomad-live-343/singlepage-workspace-343.css')
s=p.read_text()
if 'BALL46_UI_STABLE_LAYOUT_20260926' in s: raise SystemExit('STABLE_LAYOUT_ALREADY_PRESENT')
s += r'''

/* BALL46_UI_STABLE_LAYOUT_20260926 — shared chrome geometry lock */
.workspace-stable-head{height:52px;min-height:52px;max-height:52px;margin:0 0 10px;padding:5px 8px 5px 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);display:grid;grid-template-columns:180px minmax(0,1fr);gap:10px;align-items:center;overflow:hidden}
.workspace-stable-copy{min-width:0;display:flex;flex-direction:column;justify-content:center}.workspace-stable-copy span{color:var(--muted);font-size:7px;font-weight:900;letter-spacing:.1em;line-height:1.1}.workspace-stable-copy b{margin-top:3px;color:var(--text);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.workspace-stable-toolbar-host{min-width:0}.workspace-stable-toolbar-host .board-toolbar{height:40px;min-height:40px;max-height:40px;margin:0!important;display:flex;align-items:center}.workspace-stable-toolbar-host .search-box{height:40px}.workspace-stable-toolbar-host .search-box input{height:38px}.workspace-stable-toolbar-host .local-time{height:40px;display:flex;align-items:center}
.workspace-panel>.workspace-view-head{display:none!important}
.workspace-scorebar-slot{height:60px;min-height:60px;max-height:60px;margin:0 0 10px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--panel);box-shadow:var(--shadow)}
.workspace-scorebar-grid{height:58px;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:0;overflow:hidden}
.workspace-scorebar-cell{min-width:0;height:58px;padding:6px 7px;border:0;border-right:1px solid var(--line);background:var(--panel);color:var(--text);text-align:left;overflow:hidden}.workspace-scorebar-cell:last-child{border-right:0}.workspace-scorebar-cell[role],button.workspace-scorebar-cell{cursor:pointer}.workspace-scorebar-cell:hover{background:var(--panel-2)}.workspace-scorebar-cell>span:not(.workspace-scorebar-meta){display:block;font-size:7.5px;font-weight:850;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.workspace-scorebar-cell>span.away{color:var(--yellow)}.workspace-scorebar-meta{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:3px;color:var(--muted);font-size:6.5px;font-weight:900;white-space:nowrap}.workspace-scorebar-meta i{font-style:normal;overflow:hidden;text-overflow:ellipsis}.workspace-scorebar-meta b{color:var(--green);font-size:10px}.workspace-scorebar-cell.placeholder{opacity:.48;display:flex;flex-direction:column;justify-content:center}
@media(max-width:1180px) and (min-width:761px){.workspace-stable-head{grid-template-columns:150px minmax(0,1fr)}.workspace-scorebar-grid{grid-template-columns:repeat(10,minmax(112px,1fr));overflow-x:auto}.workspace-scorebar-slot{overflow-x:auto}}
@media(max-width:760px){.workspace-stable-head{height:44px;min-height:44px;max-height:44px;padding:2px 6px;grid-template-columns:1fr;margin-bottom:8px}.workspace-stable-copy{display:none}.workspace-stable-toolbar-host .board-toolbar{height:38px;min-height:38px;max-height:38px}.workspace-stable-toolbar-host .search-box,.workspace-stable-toolbar-host .search-box input{height:38px}.workspace-scorebar-slot{display:none!important}.workspace-panel>.workspace-view-head{display:flex!important}}
'''
p.write_text(s)
PY

node --check nomad-live-343/dashboard-v2-stage3.js
node --check nomad-live-343/singlepage-workspace-343.js
grep -Fq 'BALL46_WORKSPACE_SCOREBAR_20260926' nomad-live-343/dashboard-v2-stage3.js
grep -Fq 'BALL46_UI_STABLE_CHROME_20260926' nomad-live-343/singlepage-workspace-343.js
grep -Fq 'BALL46_UI_STABLE_LAYOUT_20260926' nomad-live-343/singlepage-workspace-343.css
[ "$(cat /tmp/dashboard.fetch.before)" = "$(grep -Fc 'fetch(' nomad-live-343/dashboard-v2-stage3.js)" ] || { echo DASHBOARD_FETCH_COUNT_CHANGED; exit 1; }
[ "$(cat /tmp/singlepage.fetch.before)" = "$(grep -Fc 'fetch(' nomad-live-343/singlepage-workspace-343.js)" ] || { echo SINGLEPAGE_FETCH_COUNT_CHANGED; exit 1; }
[ "$(cat /tmp/index.before.sha)" = "$(sha256sum nomad-live-343/index.html|awk '{print $1}')" ] || { echo INDEX_CHANGED; exit 1; }

# Race guard: abort if any target moved since the mirror.
for f in dashboard-v2-stage3.js singlepage-workspace-343.js singlepage-workspace-343.css; do
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/$f?ui-stable-race=${GITHUB_RUN_ID}" -o "/tmp/race-${f}"
  [ "$(sha256sum "/tmp/race-${f}"|awk '{print $1}')" = "$(cat "/tmp/${f}.before.sha")" ] || { echo "PRODUCTION_MOVED_ABORT:$f"; exit 1; }
done

echo BALL46_UI_STABLE_PATCH_READY
