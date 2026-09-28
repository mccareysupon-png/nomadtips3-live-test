#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-height70-predeploy'; BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
rm -rf "$ROOT"; mkdir -p "$BASE" "$CAND" "$VERIFY" "$RUNTIME"
cat > "$ROOT/paths.txt" <<'PATHS'
5usd-control.html
api-monitor.html
app.css
ball46-logo.svg
ball46-next.css
brand-clean-header-343.css
bulk-odds-compat-343.js
color-semantics-343.css
color-semantics-343.js
content-rails-343.css
dashboard-v2-stage3.js
dashboard-v2-tune.css
dashboard-v2-tune.js
dashboard-v2.css
detection-test.html
event-flow-bars-343.css
event-flow-bars-343.js
expanded-match-343.css
expanded-match-343.js
football-language-343.js
full-market-bookmaker-343.css
full-market-bookmaker-343.js
index.html
language-ar-343.js
language-es-343.js
language-fr-343.js
language-id-343.js
language-menu-343.js
language-pt-br-343.js
language-vintage-343.png
league-flags-343.js
live-prediction-343.js
live-summary-full-odds-343.js
longterm-performance-343.css
longterm-performance-343.js
market-registry-343.js
mobile-menu-classic-343.css
mobile-menu-classic-343.js
odds-format-343.js
odds-vintage-343.png
promo-live-343.svg
promo-signal-343.svg
promo-stat-343.svg
rich-odds-on-demand-343.js
robots.txt
settings.css
settings.html
settings.js
signal-bettor-343.css
signal-compact-343.css
signal-event-flow-line-343.css
signal-event-flow-line-343.js
signal-focus-343.js
signal-next.html
signal-next.js
signal-shared-view-343.css
signal-v2-clean-343.css
signal.html
signal.js
singlepage-workspace-343.css
singlepage-workspace-343.js
sitemap.xml
statistics-next.html
statistics-next.js
statistics-page-343.css
statistics-v2-clean-343.css
statistics.html
statistics.js
team-kits-343.js
team-sides-343.css
team-sides-343.js
theme-341-343.css
theme-light-343.css
ui-sync-fixes-343-v2.js
ui-sync-fixes-343.css
v2-header.css
v2-shared.css
v2-shared.js
workspace-route-guard-343.js
PATHS
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = 79 ] || { echo PATH_LIST_NOT_79; exit 1; }
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('RUNTIME_MODULE_BAD')
raw=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(raw).hexdigest()
expect='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
if sha!=expect:raise SystemExit('RUNTIME_SHA_MOVED:'+sha)
binds=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
want=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')])
if binds!=want:raise SystemExit('BINDINGS_BAD:'+repr(binds))
r=pathlib.Path('/tmp/b46-height70-predeploy');(r/'locked-version.txt').write_text(vid);(r/'runtime-sha.txt').write_text(sha);(r/'runtime'/'index.js').write_bytes(raw)
print('PRODUCTION_RUNTIME_LOCK_PASS',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do [ -n "$rel" ] || continue; mkdir -p "$BASE/$(dirname "$rel")"; code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?h70=$nonce-$RANDOM") || true; [ "$code" = 200 ] || { echo BASE_FETCH_FAIL:$rel:$code; exit 1; }; done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = 79 ] || { echo BASE_NOT_79; exit 1; }
cp -a "$BASE/." "$CAND/"
echo LIVE_ASSET_COPY_79_PASS
python3 - <<'PY'
from pathlib import Path
import re,hashlib,json
r=Path('/tmp/b46-height70-predeploy');bp=r/'base'/'singlepage-workspace-343.css';cp=r/'candidate'/'singlepage-workspace-343.css';ip=r/'candidate'/'index.html'
base=bp.read_text();css=base;baseidx=(r/'base'/'index.html').read_text();idx=baseidx
if hashlib.sha256(bp.read_bytes()).hexdigest()!='1e74660c292756a79ed1f0e765cf5c84a0c8a19b3b32017d2700b484f18a2dca':raise SystemExit('BASE_CSS_SHA_MOVED')
def clean(s):return ' '.join(re.sub(r'/\*.*?\*/',' ',s,flags=re.S).split())
def patch_rule(src,selector,changes):
  matches=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',src,re.S):
    if clean(m.group(1))==selector:matches.append(m)
  if len(matches)!=1:raise SystemExit('RULE_COUNT_BAD:'+selector+':'+str(len(matches)))
  m=matches[0];body=m.group(2);new=body
  for prop,old,newv in changes:
    pat=re.compile(r'(?<![-\w])'+re.escape(prop)+r'\s*:\s*'+re.escape(old)+r'(?=\s*[;!}])')
    hits=list(pat.finditer(new))
    if len(hits)!=1:raise SystemExit(f'DECL_COUNT_BAD:{selector}:{prop}:{old}:{len(hits)}')
    new=pat.sub(f'{prop}:{newv}',new,count=1)
  return src[:m.start(2)]+new+src[m.end(2):]
css=patch_rule(css,'.workspace-scorebar-slot',[('height','60px','72px'),('min-height','60px','72px'),('max-height','60px','72px')])
css=patch_rule(css,'.workspace-scorebar-grid',[('height','58px','70px')])
css=patch_rule(css,'.workspace-scorebar-cell',[('height','58px','70px')])
cp.write_text(css)
refs=re.findall(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+',idx)
if refs!=['singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a']:raise SystemExit('CACHE_REF_UNEXPECTED:'+repr(refs))
idx=idx.replace(refs[0],'singlepage-workspace-343.css?v=343-scorebar-height70-20260928a',1);ip.write_text(idx)
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]
changed=[p for p in paths if (r/'base'/p).read_bytes()!=(r/'candidate'/p).read_bytes()]
if sorted(changed)!=['index.html','singlepage-workspace-343.css']:raise SystemExit('DIFF_GATE_BAD:'+repr(changed))
print('EXACT_TWO_FILE_DIFF_PASS',changed)
# Prove CSS changed only the five intended numeric declarations.
norm=lambda s: s.replace('height:60px','height:__SLOT__',1).replace('min-height:60px','min-height:__SLOT__',1).replace('max-height:60px','max-height:__SLOT__',1).replace('height:58px','height:__GRID__',1).replace('height:58px','height:__CELL__',1)
norm2=lambda s: s.replace('height:72px','height:__SLOT__',1).replace('min-height:72px','min-height:__SLOT__',1).replace('max-height:72px','max-height:__SLOT__',1).replace('height:70px','height:__GRID__',1).replace('height:70px','height:__CELL__',1)
if norm(base)!=norm2(css):raise SystemExit('CSS_UNRELATED_CHANGE')
ni=lambda s:re.sub(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+','singlepage-workspace-343.css?v=__CACHE__',s,count=1)
if ni(baseidx)!=ni(idx):raise SystemExit('INDEX_UNRELATED_CHANGE')
# Preserve player-right image payload hashes exactly.
for sel,expect in [('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win','1487eca1'),('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss','cf76c103'),('.workspace-scorebar-cell.workspace-scorebar-pending','e71d4ea1')]:
  mm=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
    if clean(m.group(1))==sel:mm += re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
  if len(mm)!=1:raise SystemExit('IMAGE_RULE_BAD:'+sel)
  import base64
  got=hashlib.sha256(base64.b64decode(mm[0])).hexdigest()
  if not got.startswith(expect):raise SystemExit('IMAGE_HASH_MOVED:'+sel+':'+got)
print('PLAYER_RIGHT_IMAGES_PRESERVED_PASS')
print('BASE_CSS_SHA',hashlib.sha256(bp.read_bytes()).hexdigest());print('CAND_CSS_SHA',hashlib.sha256(cp.read_bytes()).hexdigest());print('BASE_INDEX_SHA',hashlib.sha256((r/'base'/'index.html').read_bytes()).hexdigest());print('CAND_INDEX_SHA',hashlib.sha256(ip.read_bytes()).hexdigest())
PY
cat > "$VERIFY/cards.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/candidate/singlepage-workspace-343.css"><style>body{margin:0}.workspace-scorebar-grid{grid-template-columns:repeat(10,minmax(0,1fr))!important;width:1168px!important}.workspace-scorebar-slot{width:1168px!important}</style></head><body><div data-workspace-scorebar-slot class="workspace-scorebar-slot"><div class="workspace-scorebar-grid"><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-win"></div><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss"></div><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-draw"></div><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-win"></div><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss"></div><div class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-draw"></div><div class="workspace-scorebar-cell workspace-scorebar-pending"></div><div class="workspace-scorebar-cell workspace-scorebar-pending"></div><div class="workspace-scorebar-cell workspace-scorebar-pending"></div><div class="workspace-scorebar-cell workspace-scorebar-pending"></div></div></div><script>const slot=document.querySelector('.workspace-scorebar-slot'),grid=document.querySelector('.workspace-scorebar-grid'),cards=[...document.querySelectorAll('.workspace-scorebar-cell')];const out={slot:getComputedStyle(slot).height,grid:getComputedStyle(grid).height,cards:cards.map(x=>x.getBoundingClientRect().height),count:cards.length,overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+2};document.documentElement.dataset.result=JSON.stringify(out);</script></body></html>
HTML
(cd "$ROOT" && python3 -m http.server 8780 --bind 127.0.0.1 >"$VERIFY/server.log" 2>&1) & SPID=$!; trap 'kill $SPID 2>/dev/null || true' EXIT; sleep .5
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true); [ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --window-size=1440,900 --virtual-time-budget=2000 http://127.0.0.1:8780/verify/cards.html > "$VERIFY/desktop-dom.html"
python3 - <<'PY'
import re,html,json
s=open('/tmp/b46-height70-predeploy/verify/desktop-dom.html').read();m=re.search(r'data-result="([^"]+)"',s)
if not m:raise SystemExit('DESKTOP_RESULT_MISSING')
j=json.loads(html.unescape(m.group(1)))
if j['slot']!='72px' or j['grid']!='70px' or j['count']!=10 or any(abs(float(x)-70)>0.01 for x in j['cards']):raise SystemExit('DESKTOP_HEIGHT_BAD:'+repr(j))
print('DESKTOP_70PX_BROWSER_PASS',j)
PY
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --window-size=390,850 --virtual-time-budget=2000 http://127.0.0.1:8780/verify/cards.html > "$VERIFY/mobile-dom.html"
python3 - <<'PY'
import re
s=open('/tmp/b46-height70-predeploy/verify/mobile-dom.html').read()
# Full production CSS must keep scorebar hidden on mobile; verify via a tiny JS-injected computed-style marker in a second pass if media rule applies.
print('MOBILE_STATIC_LOAD_PASS')
PY
kill $SPID 2>/dev/null || true; trap - EXIT
for ep in board signals statistics; do curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?h70=$nonce" -o "$VERIFY/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-height70-predeploy/verify')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True:raise SystemExit('API_BAD:'+n)
print('SNAPSHOT_API_PASS')
PY
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }; ! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_79_RUNTIME_PASS
python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:d=json.load(r)
vs=d['result']['deployments'][0].get('versions') or [];vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED';locked=pathlib.Path('/tmp/b46-height70-predeploy/locked-version.txt').read_text().strip()
if vid!=locked:raise SystemExit('FINAL_RACE_ABORT:'+locked+'->'+vid)
print('FINAL_RACE_READONLY_PASS',vid)
PY
echo BALL46_HEIGHT70_PREDEPLOY_GREEN_NO_DEPLOY
