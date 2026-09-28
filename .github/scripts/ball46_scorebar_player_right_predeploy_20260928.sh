#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-player-right-predeploy'
BASE="$ROOT/base"; CAND="$ROOT/candidate"; VERIFY="$ROOT/verify"; RUNTIME="$ROOT/runtime"
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
[ "$(wc -l < "$ROOT/paths.txt" | tr -d ' ')" = "79" ] || { echo PATH_LIST_NOT_79; exit 1; }

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
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
r=pathlib.Path('/tmp/b46-player-right-predeploy'); (r/'locked-version.txt').write_text(vid); (r/'runtime-sha.txt').write_text(sha); (r/'runtime'/'index.js').write_bytes(raw)
print('PRODUCTION_RUNTIME_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BASE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$BASE/$rel" -w '%{http_code}' "$DIRECT/$rel?playerright=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo BASE_FETCH_FAIL:$rel:$code; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo BASE_NOT_79; exit 1; }
cp -a "$BASE/." "$CAND/"

echo LIVE_ASSET_COPY_79_PASS

python3 - <<'PY'
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageOps, ImageChops
import re,base64,hashlib,json
r=Path('/tmp/b46-player-right-predeploy'); cssp=r/'candidate'/'singlepage-workspace-343.css'; idxp=r/'candidate'/'index.html'
basecss=(r/'base'/'singlepage-workspace-343.css').read_text(); css=basecss
idx=idxp.read_text(); baseidx=(r/'base'/'index.html').read_text()
targets=[
('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win','win'),
('.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss','loss'),
('.workspace-scorebar-cell.workspace-scorebar-pending','pending')]
proof={}

def rules(s):
    out=[]
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',s,re.S):
        rawsel=m.group(1); clean=re.sub(r'/\*.*?\*/','',rawsel,flags=re.S)
        sels=[x.strip() for x in clean.split(',')]
        out.append((m,sels,m.group(2)))
    return out

def get_target(s,sel):
    hits=[]
    for m,sels,body in rules(s):
        if sel in sels and 'data:image/webp;base64,' in body:
            hits.append((m,body))
    if len(hits)!=1: raise SystemExit(f'IMAGE_RULE_COUNT_BAD:{sel}:{len(hits)}')
    return hits[0]

for sel,name in targets:
    m,body=get_target(css,sel)
    imgs=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',body)
    if len(imgs)!=1: raise SystemExit(f'IMAGE_URI_COUNT_BAD:{name}:{len(imgs)}')
    raw=base64.b64decode(imgs[0]); im=Image.open(BytesIO(raw)).convert('RGB')
    if im.size!=(234,116): raise SystemExit(f'IMAGE_DIM_BAD:{name}:{im.size}')
    mirrored=ImageOps.mirror(im)
    buf=BytesIO(); mirrored.save(buf,'WEBP',lossless=True,method=6)
    newraw=buf.getvalue(); newb64=base64.b64encode(newraw).decode()
    # prove candidate decodes pixel-identical to a horizontal mirror of current Production image
    chk=Image.open(BytesIO(newraw)).convert('RGB')
    if ImageChops.difference(mirrored,chk).getbbox() is not None: raise SystemExit('MIRROR_PIXEL_PROOF_BAD:'+name)
    olduri='data:image/webp;base64,'+imgs[0]; newuri='data:image/webp;base64,'+newb64
    # recalc current rule and replace exactly one image URI in body
    m2,body2=get_target(css,sel)
    if body2.count(olduri)!=1: raise SystemExit('OLD_URI_NOT_UNIQUE_IN_RULE:'+name)
    newbody=body2.replace(olduri,newuri,1)
    css=css[:m2.start(2)]+newbody+css[m2.end(2):]
    proof[name]={'old_sha':hashlib.sha256(raw).hexdigest(),'new_sha':hashlib.sha256(newraw).hexdigest(),'w':234,'h':116}

# overlay direction proof: left side must be darker (higher alpha) than right side.
for sel,name in targets:
    _,body=get_target(css,sel)
    gm=re.search(r'linear-gradient\(90deg\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*\)',body,re.S)
    if not gm: raise SystemExit('OVERLAY_GRADIENT_NOT_FOUND:'+name)
    left,right=map(float,gm.groups())
    if not left>right: raise SystemExit(f'OVERLAY_DIRECTION_BAD:{name}:{left}:{right}')
    proof[name]['overlay_left_alpha']=left; proof[name]['overlay_right_alpha']=right
print('OVERLAY_LEFT_DARK_RIGHT_LIGHT_PASS',json.dumps({k:[v['overlay_left_alpha'],v['overlay_right_alpha']] for k,v in proof.items()}))

cssp.write_text(css)
refs=re.findall(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+',idx)
if len(refs)!=1: raise SystemExit('CSS_CACHE_REF_COUNT_'+str(len(refs)))
idx=idx.replace(refs[0],'singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a',1)
idxp.write_text(idx)
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]
changed=[p for p in paths if hashlib.sha256((r/'base'/p).read_bytes()).digest()!=hashlib.sha256((r/'candidate'/p).read_bytes()).digest()]
if sorted(changed)!=['index.html','singlepage-workspace-343.css']: raise SystemExit('DIFF_GATE_BAD:'+repr(changed))
print('EXACT_TWO_FILE_DIFF_PASS',changed)

# normalize the three image payloads to prove no CSS declaration except image bytes changed.
def normalize(s):
    for sel,_ in targets:
        m,body=get_target(s,sel)
        b=re.sub(r'data:image/webp;base64,[A-Za-z0-9+/=]+','data:image/webp;base64,__IMAGE__',body,count=1)
        s=s[:m.start(2)]+b+s[m.end(2):]
    return s
if normalize(basecss)!=normalize(css): raise SystemExit('CSS_NON_IMAGE_STRUCTURE_CHANGED')
ni=lambda s: re.sub(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+','singlepage-workspace-343.css?v=__CACHE__',s,count=1)
if ni(baseidx)!=ni(idx): raise SystemExit('INDEX_NON_CACHE_STRUCTURE_CHANGED')
print('STRUCTURE_ONLY_MIRRORED_IMAGES_AND_CACHE_PASS')
print('BASE_CSS_SHA',hashlib.sha256((r/'base'/'singlepage-workspace-343.css').read_bytes()).hexdigest())
print('CAND_CSS_SHA',hashlib.sha256(cssp.read_bytes()).hexdigest())
print('BASE_INDEX_SHA',hashlib.sha256((r/'base'/'index.html').read_bytes()).hexdigest())
print('CAND_INDEX_SHA',hashlib.sha256(idxp.read_bytes()).hexdigest())
(r/'mirror-proof.json').write_text(json.dumps(proof,indent=2))
PY

cat > "$VERIFY/cards.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/candidate/singlepage-workspace-343.css"><style>body{background:#111;margin:20px;display:flex;gap:8px}.workspace-scorebar-cell{width:116.8px!important;height:58px!important}</style></head><body><div id="win" class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-win"><div class="workspace-scorebar-meta"><b>WIN</b></div><div class="workspace-scorebar-match">South Korea · Uruguay</div><div class="workspace-scorebar-pick"><strong>OVER 4.25</strong></div></div><div id="loss" class="workspace-scorebar-cell workspace-scorebar-signal-result outcome-loss"><div class="workspace-scorebar-meta"><b>LOSS</b></div><div class="workspace-scorebar-match">South Korea · Uruguay</div><div class="workspace-scorebar-pick"><strong>UNDER 4.75</strong></div></div><div id="pending" class="workspace-scorebar-cell workspace-scorebar-pending"><div class="workspace-scorebar-meta"><b>PENDING</b></div><div class="workspace-scorebar-match">River Plate · Racing</div><div class="workspace-scorebar-pick"><strong>HOME 0.5</strong></div></div><script>(async()=>{for(const id of ['win','loss','pending']){const e=document.getElementById(id),bg=getComputedStyle(e).backgroundImage,m=bg.match(/data:image\/webp;base64,[A-Za-z0-9+/=]+/);if(!m)throw Error('NO_IMAGE_'+id);const im=new Image();im.src=m[0];await im.decode();if(im.naturalWidth!==234||im.naturalHeight!==116)throw Error('BAD_DIM_'+id)}document.documentElement.dataset.pass='yes'})().catch(e=>document.documentElement.dataset.err=e.message)</script></body></html>
HTML
(cd "$ROOT" && python3 -m http.server 8779 --bind 127.0.0.1 >"$VERIFY/server.log" 2>&1) & SPID=$!
trap 'kill $SPID 2>/dev/null || true' EXIT
sleep .5
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_MISSING; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --dump-dom --virtual-time-budget=3000 http://127.0.0.1:8779/verify/cards.html > "$VERIFY/cards-dom.html"
grep -Fq 'data-pass="yes"' "$VERIFY/cards-dom.html" || { echo CARD_IMAGE_BROWSER_DECODE_FAIL; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=500,120 --screenshot="$VERIFY/player-right-preview.png" http://127.0.0.1:8779/verify/cards.html >/dev/null 2>&1
kill $SPID 2>/dev/null || true; trap - EXIT
echo CARD_IMAGE_BROWSER_DECODE_234X116_PASS

for ep in board signals statistics; do
  curl -fsS --retry 3 "$DIRECT/api/engine/$ep?playerright=$nonce-$RANDOM" > "$VERIFY/$ep.json"
  python3 - "$VERIFY/$ep.json" <<'PY'
import json,sys
json.load(open(sys.argv[1]))
PY
done
echo SNAPSHOT_API_PASS

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
locked=pathlib.Path('/tmp/b46-player-right-predeploy/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('PRODUCTION_MOVED_DURING_PREDEPLOY:'+locked+'->'+vid)
print('FINAL_RACE_READONLY_PASS',vid)
PY

echo BALL46_PLAYER_RIGHT_PREDEPLOY_GREEN_NO_DEPLOY
