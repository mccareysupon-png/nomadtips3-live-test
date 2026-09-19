#!/usr/bin/env bash
set -euo pipefail

: "${BALL46_URL:=https://ball46.com}"
: "${SOURCE_BRANCH:=work/ball46-live-prediction-percent-20260919}"
RUN_ID="${GITHUB_RUN_ID:-manual}"
ROOT="nomad-live-343"

mkdir -p /tmp/ball46-next-prod /tmp/ball46-next-hdr
: > /tmp/ball46-next-protected.tsv

# Mirror current production first so this job cannot overwrite newer production assets from an older branch.
while IFS= read -r f; do
  name="${f#${ROOT}/}"
  case "$name" in *.html|*.js|*.css|*.svg|*.json|*.png|*.webp|*.jpg|*.jpeg|*.ico) ;; *) continue ;; esac
  safe="${name//\//_}"
  code=$(curl -sS -L --max-time 25 -D "/tmp/ball46-next-hdr/$safe" -o "/tmp/ball46-next-prod/$safe" -w '%{http_code}' "$BALL46_URL/$name?nextflow=${RUN_ID}") || true
  [ "$code" = 200 ] || continue
  ctype=$(tr -d '\r' < "/tmp/ball46-next-hdr/$safe" | awk 'BEGIN{IGNORECASE=1}/^content-type:/{print tolower($0)}' | tail -1)
  case "$name" in
    *.js) [[ "$ctype" == *javascript* || "$ctype" == *text/plain* ]] || continue ;;
    *.css) [[ "$ctype" == *text/css* || "$ctype" == *text/plain* ]] || continue ;;
    *.html) [[ "$ctype" == *text/html* || "$ctype" == *text/plain* ]] || continue ;;
    *.svg) [[ "$ctype" == *svg* || "$ctype" == *xml* || "$ctype" == *text/plain* ]] || continue ;;
  esac
  cp "/tmp/ball46-next-prod/$safe" "$f"
  case "$name" in
    ball46-next.css|signal-next.js|statistics-next.js|signal.html|statistics.html) ;;
    *) printf '%s\t%s\n' "$name" "$(sha256sum "$f" | awk '{print $1}')" >> /tmp/ball46-next-protected.tsv ;;
  esac
done < <(find "$ROOT" -maxdepth 1 -type f | sort)

for f in index.html dashboard-v2-stage3.js event-flow-343.js event-flow-343.css; do
  grep -Fq "$f" /tmp/ball46-next-protected.tsv || { echo "PROTECTED_BASE_MISSING:$f"; exit 1; }
done
grep -Fq 'ball46-next.css' "$ROOT/signal.html"
grep -Fq 'signal-next.js' "$ROOT/signal.html"
grep -Fq 'statistics-next.js' "$ROOT/statistics.html"
echo NEXT_PRODUCTION_MIRROR_PASS

python3 - <<'PY'
from pathlib import Path
import re
root=Path('nomad-live-343')

# Shared NEXT CSS: one semantic owner for team-side bars and the visual skin of the existing Event Flow.
p=root/'ball46-next.css'; s=p.read_text()
marker='/* BALL46 NEXT SHARED TEAM SIDES + EVENT FLOW 20260919 */'
if marker in s:
    s=s.split(marker,1)[0].rstrip()+'\n'
addon=r'''
/* BALL46 NEXT SHARED TEAM SIDES + EVENT FLOW 20260919 */
:root{--next-home:#15945a;--next-away:#d0b52e;--next-away-soft:#fff9dc}
html[data-theme="dark"]{--next-home:#57d792;--next-away:#ead05a;--next-away-soft:#39351c}
.next-bar.home i,.next-bar:not(.away) i{background:var(--next-home)!important}
.next-bar.away i{background:var(--next-away)!important}
.next-flow-wrap{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.next-flow-wrap>h4{margin:0 0 8px;color:var(--muted);font-size:9px;font-weight:750;letter-spacing:.045em;text-transform:uppercase}
.next-shell .nomad-event-flow-card{margin:0;border:1px solid var(--line)!important;border-radius:10px;background:var(--surface)!important;box-shadow:none!important;overflow:hidden}
.next-shell .nomad-flow-head,.next-shell .nomad-flow-legend,.next-shell .nomad-flow-chart,.next-shell .nomad-flow-foot,.next-shell .nomad-flow-loading,.next-shell .nomad-flow-empty{background:var(--surface)!important;border-color:var(--line)!important;color:var(--muted)!important}
.next-shell .nomad-flow-head b{color:var(--text)!important}.next-shell .nomad-flow-head small,.next-shell .nomad-flow-foot{color:var(--muted)!important}
.next-shell .nomad-flow-grid-line{stroke:var(--line)!important}.next-shell .nomad-flow-grid-line.mid{stroke:var(--line-strong)!important}.next-shell .nomad-flow-axis-label{fill:var(--muted)!important}
.next-shell .nomad-flow-legend .home{color:var(--next-home)!important}.next-shell .nomad-flow-legend .away{color:var(--next-away)!important}
.next-shell .nomad-flow-legend .home i{background:var(--next-home)!important;box-shadow:0 0 7px color-mix(in srgb,var(--next-home) 38%,transparent)!important}.next-shell .nomad-flow-legend .away i{background:var(--next-away)!important;box-shadow:0 0 7px color-mix(in srgb,var(--next-away) 38%,transparent)!important}
.next-shell .nomad-flow-line.home{stroke:var(--next-home)!important;filter:none!important}.next-shell .nomad-flow-line.away{stroke:var(--next-away)!important;filter:none!important}
.next-shell .nomad-flow-area.home{fill:color-mix(in srgb,var(--next-home) 14%,transparent)!important}.next-shell .nomad-flow-area.away{fill:color-mix(in srgb,var(--next-away) 14%,transparent)!important}
.next-shell .nomad-flow-end.home{fill:var(--next-home)!important;stroke:var(--surface)!important}.next-shell .nomad-flow-end.away{fill:var(--next-away)!important;stroke:var(--surface)!important}
.next-live-track-card{border:1px solid var(--line);border-radius:11px;background:var(--surface-2);overflow:hidden}.next-live-track-card+.next-live-track-card{margin-top:7px}.next-live-track-card .next-live-row{border:0;border-radius:0;background:transparent}.next-live-toggle{width:32px;height:32px;border:1px solid var(--line);border-radius:8px;background:var(--surface);cursor:pointer}.next-live-track-detail{padding:0 12px 12px}.next-live-track-detail .next-detail-card{background:var(--surface)}
@media(max-width:820px){.next-live-row.with-toggle{grid-template-columns:minmax(0,1fr) 70px auto}.next-live-row.with-toggle .picks{grid-column:1/-1;justify-content:flex-start}.next-live-track-detail{padding:0 8px 8px}}
'''
p.write_text(s.rstrip()+'\n'+addon.strip()+'\n')

# Page 2: semantic Home/Away bars + existing Event Flow under live match statistics.
p=root/'signal-next.js'; s=p.read_text()
if 'data-event-flow-fixture' not in s:
    old='return`<div class="next-stat-row"><b>${esc(fmt(h))}</b><div class="next-bar"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="next-bar away"><i style="width:${aw}%"></i></div><b>${esc(fmt(a))}</b></div>`'
    new='return`<div class="next-stat-row"><b>${esc(fmt(h))}</b><div class="next-bar home"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="next-bar away"><i style="width:${aw}%"></i></div><b>${esc(fmt(a))}</b></div>`'
    if old not in s: raise SystemExit('SIGNAL_NEXT_BAR_ANCHOR_MISSING')
    s=s.replace(old,new,1)
    anchor='function evidence(s){'
    helper='function flowCard(g){const s=g.sample;return`<div class="next-flow-wrap"><h4>Event Flow · Attack Momentum</h4><section class="nomad-event-flow-card" data-event-flow-fixture="${esc(g.id)}" data-home="${esc(team(s,\'home\'))}" data-away="${esc(team(s,\'away\'))}"><div class="nomad-flow-loading">Loading Event Flow…</div></section></div>`}\n'
    if anchor not in s: raise SystemExit('SIGNAL_NEXT_EVIDENCE_ANCHOR_MISSING')
    s=s.replace(anchor,helper+anchor,1)
    old_detail='<section class="next-detail-card"><h3>Live match statistics</h3>${statRows(s)}</section>'
    new_detail='<section class="next-detail-card"><h3>Live match statistics</h3>${statRows(s)}${flowCard(g)}</section>'
    if old_detail not in s: raise SystemExit('SIGNAL_NEXT_DETAIL_ANCHOR_MISSING')
    s=s.replace(old_detail,new_detail,1)
    old_render="state('live',`${rows.length} active signal${rows.length===1?'':'s'} · ${groups.length} match${groups.length===1?'':'es'}`)}"
    new_render="window.NOMAD_EVENT_FLOW_343?.hydrate(el);state('live',`${rows.length} active signal${rows.length===1?'':'s'} · ${groups.length} match${groups.length===1?'':'es'}`)}"
    if old_render not in s: raise SystemExit('SIGNAL_NEXT_RENDER_ANCHOR_MISSING')
    s=s.replace(old_render,new_render,1)
if s.count('data-event-flow-fixture')!=1 or 'next-bar home' not in s: raise SystemExit('SIGNAL_NEXT_VERIFY_FAIL')
p.write_text(s)

# Page 3 Live Signal Tracker: add expandable supporting live statistics + Event Flow. Settled table code is untouched.
p=root/'statistics-next.js'; s=p.read_text()
if 'data-next-live-toggle' not in s:
    if 'const POLL=45000;' not in s: raise SystemExit('STAT_NEXT_POLL_ANCHOR_MISSING')
    s=s.replace('const POLL=45000;','const POLL=45000;\nconst liveOpenIds=new Set();',1)
    start=s.find('function renderLive(rows){'); end=s.find('async function load(){',start)
    if start<0 or end<0: raise SystemExit('STAT_NEXT_RENDERLIVE_BOUNDARY_MISSING')
    helper=r'''const LIVE_METRICS=[['ATTACKS',['attacks','attack']],['DANGEROUS',['dangerousAttacks','dangerous_attacks','dangerousAttack','dangerous']],['SOT',['shotsOnTarget','shots_on_target','shotOnTarget','sot']],['SHOT OFF',['shotsOffTarget','shots_offTarget','shots_off_target','shotOff','off']],['CORNERS',['corners','corner']],['POSSESSION',['possession','possessionPct','possession_percent'],true]];
function livePair(src,keys){if(!src)return[null,null];for(const k of keys){const v=src[k];if(Array.isArray(v))return[num(v[0]),num(v[1])];if(v&&typeof v==='object'){const h=num(v.home??v.h??v[0]),a=num(v.away??v.a??v[1]);if(h!==null||a!==null)return[h,a]}}return[null,null]}
function liveStatSource(s){const base=s?.liveStatistics&&typeof s.liveStatistics==='object'?{...s.liveStatistics}:{};if(s?.liveCorners!==undefined&&s?.liveCorners!==null)base.corners=s.liveCorners;return base}
function liveStatRows(s){const src=liveStatSource(s);if(!src||!Object.keys(src).length)return'<div class="next-empty">Live match statistics are not available from the current feed.</div>';return LIVE_METRICS.map(([label,keys,pct])=>{const[h,a]=livePair(src,keys),max=pct?100:Math.max(1,h||0,a||0),hw=h===null?0:Math.max(0,Math.min(100,(h/max)*100)),aw=a===null?0:Math.max(0,Math.min(100,(a/max)*100)),fmt=v=>v===null?'—':`${Number.isInteger(v)?v:v.toFixed(1)}${pct?'%':''}`;return`<div class="next-stat-row"><b>${esc(fmt(h))}</b><div class="next-bar home"><i style="width:${hw}%"></i></div><span>${esc(label)}</span><div class="next-bar away"><i style="width:${aw}%"></i></div><b>${esc(fmt(a))}</b></div>`}).join('')}
function liveFlowCard(g){const s=g.sample;return`<div class="next-flow-wrap"><h4>Event Flow · Attack Momentum</h4><section class="nomad-event-flow-card" data-event-flow-fixture="${esc(g.id)}" data-home="${esc(s?.home?.name||'HOME')}" data-away="${esc(s?.away?.name||'AWAY')}"><div class="nomad-flow-loading">Loading Event Flow…</div></section></div>`}
function renderLive(rows){const el=document.querySelector('[data-next-live-tracker]');if(!el)return;const groups=groupSignals(rows),ids=new Set(groups.map(g=>g.id));for(const id of [...liveOpenIds])if(!ids.has(id))liveOpenIds.delete(id);el.innerHTML=groups.length?groups.map(g=>{const s=g.sample,open=liveOpenIds.has(g.id),league=[s?.league?.country,s?.league?.name].filter(Boolean).join(' · '),picks=g.signals.map(x=>`<span class="next-live-pick"><b>${esc(x?.marketLabel||x?.market||'—')}</b> · ${esc(selection(x))} ${esc(lineText(x))} @ <span class="odds-readonly">${esc(show(x?.odds))}</span></span>`).join('');return`<article class="next-live-track-card${open?' open':''}"><div class="next-live-row with-toggle"><div class="teams">${esc(s?.home?.name||'—')} — ${esc(s?.away?.name||'—')}<small>${esc(league||'Live match')}</small></div><div class="score">${esc(liveScore(s))}<small style="display:block;color:var(--green);font-size:9px;margin-top:3px">${esc(liveMinute(s))}</small></div><div class="picks">${picks}</div><button type="button" class="next-live-toggle" data-next-live-toggle="${esc(g.id)}" aria-expanded="${open?'true':'false'}" aria-label="Toggle live evidence">${open?'−':'+'}</button></div>${open?`<div class="next-live-track-detail"><section class="next-detail-card"><h3>Live match statistics</h3>${liveStatRows(s)}${liveFlowCard(g)}</section></div>`:''}</article>`}).join(''):'<div class="next-empty">No active signals to track right now.</div>';window.NOMAD_EVENT_FLOW_343?.hydrate(el)}
'''
    s=s[:start]+helper+s[end:]
    anchor="const tz=document.querySelector('[data-next-timezone]');"
    listener="document.addEventListener('click',e=>{const b=e.target.closest('[data-next-live-toggle]');if(!b)return;const id=b.getAttribute('data-next-live-toggle');if(liveOpenIds.has(id))liveOpenIds.delete(id);else liveOpenIds.add(id);load()});\n"
    if anchor not in s: raise SystemExit('STAT_NEXT_LISTENER_ANCHOR_MISSING')
    s=s.replace(anchor,listener+anchor,1)
if s.count('data-next-live-toggle')<2 or s.count('data-event-flow-fixture')!=1 or 'next-bar home' not in s: raise SystemExit('STAT_NEXT_VERIFY_FAIL')
p.write_text(s)

# Production HTML: reuse existing Event Flow assets, loaded before NEXT CSS/JS, and cache-bust NEXT only.
for name,nextjs in [('signal.html','signal-next.js'),('statistics.html','statistics-next.js')]:
    p=root/name; s=p.read_text()
    if 'event-flow-343.css' not in s:
        m=re.search(r'<link[^>]+href=["\']ball46-next\.css[^>]*>',s,re.I)
        if not m: raise SystemExit(f'{name}:BALL46_NEXT_CSS_LINK_MISSING')
        s=s[:m.start()]+'<link rel="stylesheet" href="event-flow-343.css?v=343-flow-v3">'+s[m.start():]
    s=re.sub(r'ball46-next\.css(?:\?[^"\']*)?','ball46-next.css?v=343-next-production-v2-team-flow',s,count=1)
    if 'event-flow-343.js' not in s:
        m=re.search(r'<script[^>]+src=["\']'+re.escape(nextjs)+r'(?:\?[^"\']*)?["\'][^>]*></script>',s,re.I)
        if not m: raise SystemExit(f'{name}:{nextjs}:SCRIPT_MISSING')
        s=s[:m.start()]+'<script src="event-flow-343.js?v=343-flow-v3" defer></script>'+s[m.start():]
    s=re.sub(re.escape(nextjs)+r'(?:\?[^"\']*)?',nextjs+'?v=343-next-production-v2-team-flow',s,count=1)
    p.write_text(s)
print('NEXT_SHARED_EVIDENCE_PATCH_PASS')
PY

node --check "$ROOT/signal-next.js"
node --check "$ROOT/statistics-next.js"
grep -Fq 'BALL46 NEXT SHARED TEAM SIDES + EVENT FLOW 20260919' "$ROOT/ball46-next.css"
grep -Fq 'data-event-flow-fixture' "$ROOT/signal-next.js"
grep -Fq 'data-next-live-toggle' "$ROOT/statistics-next.js"
for f in signal.html statistics.html; do
  grep -Fq 'event-flow-343.css?v=343-flow-v3' "$ROOT/$f"
  grep -Fq 'event-flow-343.js?v=343-flow-v3' "$ROOT/$f"
  grep -Fq '343-next-production-v2-team-flow' "$ROOT/$f"
done

echo NEXT_PATCH_VALIDATION_PASS

# Persist only the five approved presentation files.
git config user.name 'Ball46 UI Repair Bot'
git config user.email 'actions@users.noreply.github.com'
git add "$ROOT/ball46-next.css" "$ROOT/signal-next.js" "$ROOT/statistics-next.js" "$ROOT/signal.html" "$ROOT/statistics.html"
mapfile -t changed < <(git diff --cached --name-only)
printf 'NEXT changed files:\n%s\n' "${changed[*]}"
[ "${#changed[@]}" -le 5 ]
for f in "${changed[@]}"; do
  case "$f" in
    nomad-live-343/ball46-next.css|nomad-live-343/signal-next.js|nomad-live-343/statistics-next.js|nomad-live-343/signal.html|nomad-live-343/statistics.html) ;;
    *) echo "UNAPPROVED_FILE:$f"; exit 1 ;;
  esac
done
if ! git diff --cached --quiet; then
  git commit -m 'ui(ball46): shared green-yellow stats and event flow on pages 2-3'
  git push origin HEAD:"$SOURCE_BRANCH"
fi

# Record protected backend state before wrapper asset deploy.
curl -fsS "$BALL46_URL/api/full-market/health?nextflow=${RUN_ID}" -o /tmp/ball46-next-fm-before.json
node - <<'NODE'
const fs=require('fs'),h=JSON.parse(fs.readFileSync('/tmp/ball46-next-fm-before.json','utf8'));
fs.writeFileSync('/tmp/ball46-next-fm-version',String(h.version||''));
fs.writeFileSync('/tmp/ball46-next-fm-policy',String(h.staleCachePolicy||''));
console.log('BACKEND_BEFORE',h.version,h.staleCachePolicy||'');
NODE

# Deploy wrapper assets only. No engine/hub/full-market worker deploy command exists in this script.
(
  cd workers/nomadtips3-343-preview
  npx --yes wrangler@4.92.0 deploy --config wrangler.ball46.jsonc
)

# Verify production propagation and new presentation behavior.
ok=0
for n in $(seq 1 20); do
  curl -fsS -L "$BALL46_URL/signal.html?nextflow=${RUN_ID}-${n}" -o /tmp/ball46-next-signal.html || true
  curl -fsS -L "$BALL46_URL/statistics.html?nextflow=${RUN_ID}-${n}" -o /tmp/ball46-next-statistics.html || true
  if grep -Fq '343-next-production-v2-team-flow' /tmp/ball46-next-signal.html 2>/dev/null && grep -Fq '343-next-production-v2-team-flow' /tmp/ball46-next-statistics.html 2>/dev/null; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] || { echo PRODUCTION_PROPAGATION_FAIL; exit 1; }

for f in ball46-next.css signal-next.js statistics-next.js event-flow-343.js event-flow-343.css; do
  curl -fsS -L "$BALL46_URL/$f?nextflow=${RUN_ID}" -o "/tmp/ball46-next-$f"
done
node --check /tmp/ball46-next-signal-next.js
node --check /tmp/ball46-next-statistics-next.js
node --check /tmp/ball46-next-event-flow-343.js
grep -Fq 'BALL46 NEXT SHARED TEAM SIDES + EVENT FLOW 20260919' /tmp/ball46-next-ball46-next.css
grep -Fq '.next-bar.away i{background:var(--next-away)!important}' /tmp/ball46-next-ball46-next.css
grep -Fq 'next-bar home' /tmp/ball46-next-signal-next.js
grep -Fq 'data-event-flow-fixture' /tmp/ball46-next-signal-next.js
grep -Fq 'data-next-live-toggle' /tmp/ball46-next-statistics-next.js
grep -Fq 'data-event-flow-fixture' /tmp/ball46-next-statistics-next.js
for f in /tmp/ball46-next-signal.html /tmp/ball46-next-statistics.html; do
  grep -Fq 'event-flow-343.css?v=343-flow-v3' "$f"
  grep -Fq 'event-flow-343.js?v=343-flow-v3' "$f"
done

# Every static asset outside the five allowed files must remain byte-for-byte unchanged.
while IFS=$'\t' read -r name before; do
  safe="${name//\//_}"
  curl -fsS -L --max-time 25 "$BALL46_URL/$name?nextflow=${RUN_ID}-after" -o "/tmp/ball46-next-after-$safe"
  after=$(sha256sum "/tmp/ball46-next-after-$safe" | awk '{print $1}')
  [ "$before" = "$after" ] || { echo "PROTECTED_ASSET_CHANGED:$name"; exit 1; }
done < /tmp/ball46-next-protected.tsv

# Backends must still be healthy and Full Market identity/policy unchanged.
curl -fsS "$BALL46_URL/api/full-market/health?nextflow=${RUN_ID}-after" -o /tmp/ball46-next-fm-after.json
curl -fsS "$BALL46_URL/api/engine/board?nextflow=${RUN_ID}" -o /tmp/ball46-next-board.json
curl -fsS "$BALL46_URL/api/engine/signals?nextflow=${RUN_ID}" -o /tmp/ball46-next-signals.json
curl -fsS "$BALL46_URL/api/engine/statistics?nextflow=${RUN_ID}" -o /tmp/ball46-next-stats.json
node - <<'NODE'
const fs=require('fs');
const h=JSON.parse(fs.readFileSync('/tmp/ball46-next-fm-after.json','utf8'));
const b=JSON.parse(fs.readFileSync('/tmp/ball46-next-board.json','utf8'));
const s=JSON.parse(fs.readFileSync('/tmp/ball46-next-signals.json','utf8'));
const st=JSON.parse(fs.readFileSync('/tmp/ball46-next-stats.json','utf8'));
if(String(h.version||'')!==fs.readFileSync('/tmp/ball46-next-fm-version','utf8')) throw Error('FULL_MARKET_VERSION_CHANGED');
if(String(h.staleCachePolicy||'')!==fs.readFileSync('/tmp/ball46-next-fm-policy','utf8')) throw Error('FULL_MARKET_POLICY_CHANGED');
if(b?.ok!==true||!Array.isArray(b.fixtures)) throw Error('BOARD_UNHEALTHY');
if(!Array.isArray(s?.signals)) throw Error('SIGNALS_UNHEALTHY');
if(st?.ok!==true||!Array.isArray(st.rows)) throw Error('STATISTICS_UNHEALTHY');
console.log('NEXT_SHARED_EVIDENCE_DEPLOY_PASS',JSON.stringify({fixtures:b.fixtures.length,signals:s.signals.length,stats:st.rows.length,fullMarket:h.version}));
NODE
