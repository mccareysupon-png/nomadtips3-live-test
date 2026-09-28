#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-realistic-bg-predeploy'
BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
rm -rf "$ROOT"; mkdir -p "$BASE" "$CAND" "$VERIFY" "$RUNTIME" "$ROOT/images"

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
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = "79" ] || { echo PATH_LIST_NOT_79; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('RUNTIME_MODULE_BAD')
raw=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest()
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')])
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
r=pathlib.Path('/tmp/b46-realistic-bg-predeploy'); (r/'locked-version.txt').write_text(vid); (r/'runtime-sha.txt').write_text(sha); (r/'runtime'/'index.js').write_bytes(raw)
print('PRODUCTION_RUNTIME_LOCK_PASS',vid,sha)
PY

for pair in \
  "win .github/assets/ball46_scorebar_win_234x116.webp.b64 73e92cbccd9fc7af96571ac9f647d8e8a0aeb136de4352a4a28c404b40942497" \
  "loss .github/assets/ball46_scorebar_loss_234x116.webp.b64 9811deecc7a6fba27e2fb03408589f2cc6893a692b297cd2359cf9c007b3dbcc" \
  "pending .github/assets/ball46_scorebar_pending_234x116.webp.b64 def9d5165833c241e281d406e3a239ea06cba198df5fdc7cdd3388c8c18c0154"; do
  set -- $pair; name=$1; src=$2; expect=$3
  base64 -d "$src" > "$ROOT/images/$name.webp"
  got=$(sha256sum "$ROOT/images/$name.webp" | awk '{print $1}')
  [ "$got" = "$expect" ] || { echo IMAGE_HASH_BAD:$name:$got; exit 1; }
done
echo IMAGE_PAYLOAD_HASH_PASS

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BASE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?realbg=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo BASE_FETCH_FAIL:$rel:$code; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo BASE_NOT_79; exit 1; }
cp -a "$BASE/." "$CAND/"

python3 - <<'PY'
from pathlib import Path
import re,hashlib,base64
r=Path('/tmp/b46-realistic-bg-predeploy'); cssp=r/'candidate'/'singlepage-workspace-343.css'; idxp=r/'candidate'/'index.html'
css=cssp.read_text(); idx=idxp.read_text()
targets=[
('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win','win'),
('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss','loss'),
('.workspace-scorebar-cell.workspace-scorebar-pending','pending')]
for sel,name in targets:
  pat=re.compile(r'('+re.escape(sel)+r'\s*\{)(.*?)(\})',re.S)
  matches=list(pat.finditer(css))
  if len(matches)!=1: raise SystemExit(f'SELECTOR_COUNT_BAD:{name}:{len(matches)}')
  m=matches[0]; body=m.group(2)
  imgs=re.findall(r'data:image/webp;base64,[A-Za-z0-9+/=]+',body)
  if len(imgs)!=1: raise SystemExit(f'IMAGE_URI_COUNT_BAD:{name}:{len(imgs)}')
  payload=(Path('.github/assets')/f'ball46_scorebar_{name}_234x116.webp.b64').read_text().strip()
  newbody=body.replace(imgs[0],'data:image/webp;base64,'+payload,1)
  css=css[:m.start(2)]+newbody+css[m.end(2):]
cssp.write_text(css)
refs=re.findall(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+',idx)
if len(refs)!=1: raise SystemExit('CSS_CACHE_REF_COUNT_'+str(len(refs)))
idx=idx.replace(refs[0],'singlepage-workspace-343.css?v=343-scorebar-realistic-player-bg-20260928a',1)
idxp.write_text(idx)
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]
changed=[p for p in paths if hashlib.sha256((r/'base'/p).read_bytes()).digest()!=hashlib.sha256((r/'candidate'/p).read_bytes()).digest()]
if sorted(changed)!=['index.html','singlepage-workspace-343.css']: raise SystemExit('DIFF_GATE_BAD:'+repr(changed))
print('EXACT_TWO_FILE_DIFF_PASS',changed)
# Structural proof: CSS identical after replacing all three target webp payloads with marker.
def norm_css(s):
  for sel,_ in targets:
    pat=re.compile(r'('+re.escape(sel)+r'\s*\{)(.*?)(\})',re.S); m=pat.search(s)
    if not m: raise SystemExit('NORM_SELECTOR_MISSING:'+sel)
    b=re.sub(r'data:image/webp;base64,[A-Za-z0-9+/=]+','data:image/webp;base64,__IMAGE__',m.group(2),count=1)
    s=s[:m.start(2)]+b+s[m.end(2):]
  return s
if norm_css((r/'base'/'singlepage-workspace-343.css').read_text())!=norm_css(css): raise SystemExit('CSS_STRUCTURE_CHANGED')
basei=(r/'base'/'index.html').read_text(); candi=idx
norm=lambda s: re.sub(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+','singlepage-workspace-343.css?v=__CACHE__',s,count=1)
if norm(basei)!=norm(candi): raise SystemExit('INDEX_STRUCTURE_CHANGED')
print('STRUCTURE_ONLY_IMAGE_AND_CACHE_PASS')
print('BASE_CSS_SHA',hashlib.sha256((r/'base'/'singlepage-workspace-343.css').read_bytes()).hexdigest())
print('CAND_CSS_SHA',hashlib.sha256(cssp.read_bytes()).hexdigest())
print('BASE_INDEX_SHA',hashlib.sha256((r/'base'/'index.html').read_bytes()).hexdigest())
print('CAND_INDEX_SHA',hashlib.sha256(idxp.read_bytes()).hexdigest())
PY

cat > "$VERIFY/cards.html" <<'HTML'
<!doctype html><html><head><link rel="stylesheet" href="/candidate/singlepage-workspace-343.css"></head><body style="margin:20px;background:#fff"><div id="win" class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-win" style="width:116.8px;height:58px">WIN</div><div id="loss" class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss" style="width:116.8px;height:58px">LOSS</div><div id="pending" class="workspace-scorebar-cell workspace-scorebar-pending" style="width:116.8px;height:58px">PENDING</div><script>
(async()=>{for(const id of ['win','loss','pending']){const e=document.getElementById(id),bg=getComputedStyle(e).backgroundImage,m=bg.match(/data:image\/webp;base64,[A-Za-z0-9+/=]+/);if(!m)throw Error('NO_IMAGE_'+id);const im=new Image();im.src=m[0];await im.decode();if(im.naturalWidth!==234||im.naturalHeight!==116)throw Error('BAD_DIM_'+id+'_'+im.naturalWidth+'x'+im.naturalHeight)}document.documentElement.dataset.pass='yes'})().catch(e=>{document.documentElement.dataset.err=e.message});
</script></body></html>
HTML
(cd "$ROOT" && python3 -m http.server 8778 --bind 127.0.0.1 >"$VERIFY/server.log" 2>&1) & SPID=$!
trap 'kill $SPID 2>/dev/null || true' EXIT
sleep .5
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --virtual-time-budget=3000 http://127.0.0.1:8778/verify/cards.html > "$VERIFY/cards-dom.html"
grep -Fq 'data-pass="yes"' "$VERIFY/cards-dom.html" || { cat "$VERIFY/cards-dom.html"; echo CARD_IMAGE_BROWSER_DECODE_FAIL; exit 1; }
kill $SPID 2>/dev/null || true; trap - EXIT
echo CARD_IMAGE_BROWSER_DECODE_234X116_PASS

cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_EXTRA_MODULES; exit 1; }
echo DRY_RUN_79_RUNTIME_PASS

python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as rr:d=json.load(rr)
vs=d['result']['deployments'][0].get('versions') or []; vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
locked=pathlib.Path('/tmp/b46-realistic-bg-predeploy/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('PRODUCTION_MOVED_DURING_PREDEPLOY:'+locked+'->'+vid)
print('FINAL_RACE_READONLY_PASS',vid)
PY
echo BALL46_REALISTIC_SCOREBAR_BG_PREDEPLOY_GREEN_NO_DEPLOY
