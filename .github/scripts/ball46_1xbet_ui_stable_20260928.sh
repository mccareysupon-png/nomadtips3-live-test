#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
ROOT="/tmp/b46-1xbet-ui-stable"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
CLEAN="/tmp/b46-1xbet-ui-stable-clean"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"
rm -rf "$ROOT" "$CLEAN"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$CLEAN"

# Lock CURRENT Production runtime/config only. Never use an old site payload.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-ui-stable')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; r.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING')
runtime=base64.b64decode(main[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
r.joinpath('runtime/index.js').write_bytes(runtime); r.joinpath('runtime.sha').write_text(sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result']; ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
print('CURRENT_LOCK_OK',vid,'modules=',[m.get('name') for m in mods],'main_sha=',sha)
PY

# Fetch the exact current Production asset set.
python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt')
xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79: raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','odds-format-343.js','full-market-bookmaker-343.js','full-market-bookmaker-343.css','dashboard-v2-stage3.js','signal.js','statistics.js'}
if not need.issubset(xs): raise SystemExit('REQUIRED_MISSING:'+repr(sorted(need-set(xs))))
Path('/tmp/b46-1xbet-ui-stable/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-1xbet-ui=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

# Pre-health snapshot.
nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46ui=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46ui=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46ui=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Hard signatures: abort if another page changed these UI files before us.
grep -Fq "const VERSION='343-full-market-bookmaker-v3-bulk-snapshot-zero-click'" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "function marketTable(m){" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq "function shellHtml(info,active){" "$BEFORE/full-market-bookmaker-343.js"
grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$BEFORE/odds-format-343.js"
grep -Fq '.fmb-tab b{display:block' "$BEFORE/full-market-bookmaker-343.css"

# Patch the true renderer: brand and odds links exist on first render, not post-DOM decoration.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-1xbet-ui-stable/after/full-market-bookmaker-343.js')
s=p.read_text()
anchor="const state=new Map();\n"
insert="""const state=new Map();
const ONE_XBET_AFFILIATE_URL='https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97';
const ONE_XBET_LOGO_URL='https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png';
const ONE_XBET_PRICE_RE=/^(?:\\d+(?:\\.\\d+)?|\\d+\\s*\\/\\s*\\d+|[+-]\\d+)$/;
"""
if s.count(anchor)!=1: raise SystemExit('STATE_ANCHOR_COUNT_'+str(s.count(anchor)))
s=s.replace(anchor,insert,1)

old_market='''function marketTable(m){const heads=headers(m.kind),rows=stagesFor(m.value).map(stage=>{const c=cell(stageValue(m.value,stage),m.kind);if(m.kind==='OTHER')return `<tr><th>${esc(stage)}</th><td colspan="3" class="fmb-raw">${esc(c?.raw||'—')}</td></tr>`;if(m.kind==='1X2')return `<tr><th>${esc(stage)}</th><td>${esc(c?.a||'—')}</td><td>${esc(c?.b||'—')}</td><td>${esc(c?.c||'—')}</td></tr>`;return `<tr><th>${esc(stage)}</th><td>${esc(c?.line||'—')}</td><td>${esc(c?.a||'—')}</td><td>${esc(c?.b||'—')}</td></tr>`}).join('');return `<article class="fmb-market" data-market="${esc(m.key)}"><header><div><b>${esc(m.label)}</b><span>${esc(m.period)}</span></div><small>${esc(m.rawPath||m.key)}</small></header><div class="fmb-table-wrap"><table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>`}'''
new_market='''function oneXBetPriceHtml(v,slug){const text=String(v??'—').trim()||'—';if(slug!=='1xbet'||text==='—'||!ONE_XBET_PRICE_RE.test(text))return esc(text);return `<a class="fmb-1xbet-odds" data-b46-1xbet-odds="1" href="${ONE_XBET_AFFILIATE_URL}" target="_blank" rel="sponsored noopener noreferrer" title="1xBet affiliate link · 18+ · Gamble responsibly">${esc(text)}</a>`}
function marketTable(m,bookSlug){const heads=headers(m.kind),rows=stagesFor(m.value).map(stage=>{const c=cell(stageValue(m.value,stage),m.kind);if(m.kind==='OTHER')return `<tr><th>${esc(stage)}</th><td colspan="3" class="fmb-raw">${esc(c?.raw||'—')}</td></tr>`;if(m.kind==='1X2')return `<tr><th>${esc(stage)}</th><td>${oneXBetPriceHtml(c?.a||'—',bookSlug)}</td><td>${oneXBetPriceHtml(c?.b||'—',bookSlug)}</td><td>${oneXBetPriceHtml(c?.c||'—',bookSlug)}</td></tr>`;return `<tr><th>${esc(stage)}</th><td>${esc(c?.line||'—')}</td><td>${oneXBetPriceHtml(c?.a||'—',bookSlug)}</td><td>${oneXBetPriceHtml(c?.b||'—',bookSlug)}</td></tr>`}).join('');return `<article class="fmb-market" data-market="${esc(m.key)}"><header><div><b>${esc(m.label)}</b><span>${esc(m.period)}</span></div><small>${esc(m.rawPath||m.key)}</small></header><div class="fmb-table-wrap"><table><thead><tr>${heads.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></article>`}'''
if s.count(old_market)!=1: raise SystemExit('MARKET_TABLE_SIGNATURE_COUNT_'+str(s.count(old_market)))
s=s.replace(old_market,new_market,1)

old_render="rows.map(marketTable).join('')"
new_render="rows.map(m=>marketTable(m,book.slug)).join('')"
if s.count(old_render)!=1: raise SystemExit('RENDER_MAP_SIGNATURE_COUNT_'+str(s.count(old_render)))
s=s.replace(old_render,new_render,1)

old_shell='''function shellHtml(info,active){const found=new Set(info.found),tabs=info.books.map(b=>`<button type="button" class="fmb-tab${b.slug===active?' active':''}${found.has(b.slug)?' has-data':' no-data'}" data-fmb-book="${esc(b.slug)}" aria-pressed="${b.slug===active?'true':'false'}"><b>${esc(b.name)}</b><i></i></button>`).join('');return `<div class="fmb-head"><div><span>FULL MARKET · BOOKMAKERS</span><b>BULK SNAPSHOT · 0 CLICK REQUESTS</b></div><small>${esc(info.found.length)}/${esc(info.books.length)} books in snapshot · DEC</small></div><div class="fmb-tabs" data-fmb-tabs>${tabs}</div><div class="fmb-panel" data-fmb-panel></div>`}'''
new_shell='''function bookLabelHtml(b){if(b.slug!=='1xbet')return esc(b.name);return `<span class="fmb-book-logo fmb-book-logo-1xbet" aria-label="1xBet"><img src="${ONE_XBET_LOGO_URL}" alt="1xBet" width="42" height="10" decoding="async" referrerpolicy="no-referrer"></span>`}
function shellHtml(info,active){const found=new Set(info.found),tabs=info.books.map(b=>`<button type="button" class="fmb-tab${b.slug===active?' active':''}${found.has(b.slug)?' has-data':' no-data'}" data-fmb-book="${esc(b.slug)}" aria-pressed="${b.slug===active?'true':'false'}"><b>${bookLabelHtml(b)}</b><i></i></button>`).join('');return `<div class="fmb-head"><div><span>FULL MARKET · BOOKMAKERS</span><b>BULK SNAPSHOT · 0 CLICK REQUESTS</b></div><small>${esc(info.found.length)}/${esc(info.books.length)} books in snapshot · DEC</small></div><div class="fmb-tabs" data-fmb-tabs>${tabs}</div><div class="fmb-panel" data-fmb-panel></div>`}'''
if s.count(old_shell)!=1: raise SystemExit('SHELL_SIGNATURE_COUNT_'+str(s.count(old_shell)))
s=s.replace(old_shell,new_shell,1)
p.write_text(s)
PY

# Move 1xBet styles beside the true Full Market renderer. Small fixed geometry: never expands old card rows.
cat >> "$AFTER/full-market-bookmaker-343.css" <<'CSS'

/* B46_1XBET_UI_STABLE_20260928: renderer-owned brand + price link presentation */
.fmb-tab .fmb-book-logo{display:inline-flex;align-items:center;justify-content:flex-start;vertical-align:middle;pointer-events:none;overflow:hidden;line-height:1}
.fmb-tab .fmb-book-logo-1xbet{width:42px;height:10px;max-width:42px;max-height:10px}
.fmb-tab .fmb-book-logo-1xbet img{display:block;width:42px;height:10px;max-width:42px;max-height:10px;object-fit:contain;object-position:left center;pointer-events:none}
.fmb-1xbet-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border:0!important;box-shadow:none!important}
.fmb-1xbet-odds:hover,.fmb-1xbet-odds:focus-visible,.fmb-1xbet-odds:active{filter:brightness(1.35);text-shadow:0 0 6px currentColor;outline:none}
@media(max-width:760px){.fmb-tab .fmb-book-logo-1xbet{width:38px;height:9px;max-width:38px;max-height:9px}.fmb-tab .fmb-book-logo-1xbet img{width:38px;height:9px;max-width:38px;max-height:9px}}
CSS

# Remove the old post-render affiliate decorator entirely. Keep the independent Odds Settings/formatter untouched.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-1xbet-ui-stable/after/odds-format-343.js')
s=p.read_text(); marker='/* B46_1XBET_AFFILIATE_V2_20260928'
if s.count(marker)!=1: raise SystemExit('AFFILIATE_V2_MARKER_COUNT_'+str(s.count(marker)))
i=s.index(marker)
tail=s[i:]
if 'function afterBookClick' not in tail or 'setTimeout(()=>decorateTab(tab),0)' not in tail: raise SystemExit('EXPECTED_POST_DECORATOR_MISSING')
p.write_text(s[:i].rstrip()+'\n')
PY

# Syntax + surgical invariants.
node --check "$AFTER/full-market-bookmaker-343.js"
node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_1XBET_UI_STABLE_20260928' "$AFTER/full-market-bookmaker-343.css"
grep -Fq 'function bookLabelHtml(b)' "$AFTER/full-market-bookmaker-343.js"
grep -Fq 'function oneXBetPriceHtml(v,slug)' "$AFTER/full-market-bookmaker-343.js"
grep -Fq 'width="42" height="10"' "$AFTER/full-market-bookmaker-343.js"
grep -Fq 'rows.map(m=>marketTable(m,book.slug))' "$AFTER/full-market-bookmaker-343.js"
! grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$AFTER/odds-format-343.js" || { echo OLD_AFFILIATE_LAYER_REMAINS; exit 1; }
! grep -Fq 'setTimeout(()=>decorateTab(tab),0)' "$AFTER/odds-format-343.js" || { echo OLD_CLICK_DECORATOR_REMAINS; exit 1; }

# Static proof: logo is inside button, never anchor; price anchor is created only by odds-value helper.
python3 - <<'PY'
from pathlib import Path
s=Path('/tmp/b46-1xbet-ui-stable/after/full-market-bookmaker-343.js').read_text()
assert '<b>${bookLabelHtml(b)}</b><i></i></button>' in s
assert 'fmb-book-logo-1xbet' in s
assert 'fmb-1xbet-odds' in s
assert 'data-b46-1xbet-odds="1"' in s
assert "if(slug!=='1xbet'||text==='—'||!ONE_XBET_PRICE_RE.test(text))return esc(text)" in s
assert "<td>${esc(c?.line||'—')}</td><td>${oneXBetPriceHtml" in s
print('STATIC_UI_INVARIANTS_OK')
PY

# Hard diff gate: only the three presentation assets may differ from CURRENT Production snapshot.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-1xbet-ui-stable'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
allowed=['full-market-bookmaker-343.css','full-market-bookmaker-343.js','odds-format-343.js']
if sorted(changed)!=sorted(allowed): raise SystemExit('THREE_FILE_DIFF_FAILED:'+repr(changed))
PY
echo THREE_FILE_DIFF_GATE_PASS

# Build clean runtime from current Production bytes, preserving bindings/config exactly.
cp "$RUNTIME/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<EOF2
{
  "name":"ball46-production",
  "main":"./index.js",
  "compatibility_date":"2026-09-09",
  "no_bundle":true,
  "services":[
    {"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},
    {"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},
    {"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}
  ],
  "assets":{"directory":"$AFTER","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},
  "triggers":{"crons":["* * * * *"]}
}
EOF2
cd "$CLEAN"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry.log" || { echo DRY_EXTRA_MODULES; exit 1; }

# Race guard: another page may be working; abort rather than overwrite a newer Production.
python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-1xbet-ui-stable/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p: raise SystemExit('PRODUCTION_MOVED_ABORT')
PY
echo RACE_GUARD_PASS

npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

# Verify runtime remains one clean index.js with identical bytes.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-ui-stable');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
print('POST_MODULES',[m.get('name') for m in mods])
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();pre=r.joinpath('runtime.sha').read_text().strip()
if sha!=pre: raise SystemExit('POST_RUNTIME_BYTES_CHANGED')
print('POST_RUNTIME_CLEAN',vid,sha)
PY

# Verify every live asset equals target snapshot and engine flow remains healthy.
nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  cmp -s "$AFTER/$rel" "$VERIFY/post/$rel" || { echo POST_ASSET_MISMATCH:$rel; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_79_ASSETS_MATCH_TARGET

grep -Fq 'B46_1XBET_UI_STABLE_20260928' "$VERIFY/post/full-market-bookmaker-343.css"
grep -Fq 'function bookLabelHtml(b)' "$VERIFY/post/full-market-bookmaker-343.js"
grep -Fq 'function oneXBetPriceHtml(v,slug)' "$VERIFY/post/full-market-bookmaker-343.js"
! grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$VERIFY/post/odds-format-343.js" || { echo POST_OLD_LAYER_REMAINS; exit 1; }

nonce="${GITHUB_RUN_ID}-postflow-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46ui=$nonce" -o "$VERIFY/board-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46ui=$nonce" -o "$VERIFY/signals-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46ui=$nonce" -o "$VERIFY/stats-post.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/verify/board-post.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/verify/signals-post.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-ui-stable/verify/stats-post.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_1XBET_UI_STABLE_VERIFIED
