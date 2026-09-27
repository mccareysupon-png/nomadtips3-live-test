#!/usr/bin/env bash
set -euo pipefail
WWW="https://www.ball46.com"
PATH_SOURCE_SHA="6276320261cdc10a3835b27e81850c3d4f17f126"
MARKER="BALL46_SIGNAL_MARKET_TRANSPARENT_20260927"
rm -rf /tmp/b46-assets /tmp/b46-before /tmp/b46-runtime /tmp/b46-after /tmp/screens
mkdir -p /tmp/b46-assets /tmp/b46-runtime /tmp/screens
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
vid=p['result']['deployments'][0]['versions'][0]['version_id'];pathlib.Path('/tmp/pre-version.txt').write_text(vid);print('PRE_VERSION='+vid)
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/workers/ball46-production/versions/{vid}?include=modules'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
mods=(p.get('result') or {}).get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('RUNTIME_UNEXPECTED')
runtime=base64.b64decode(mods[0]['content_base64']);pathlib.Path('/tmp/b46-runtime/index.js').write_bytes(runtime);pathlib.Path('/tmp/runtime.sha').write_text(hashlib.sha256(runtime).hexdigest())
PY
python3 - <<'PY'
import json,os,pathlib,urllib.request
h={'Authorization':f"Bearer {os.environ['GH_TOKEN']}",'Accept':'application/vnd.github+json'}
sha='6276320261cdc10a3835b27e81850c3d4f17f126'
with urllib.request.urlopen(urllib.request.Request(f'https://api.github.com/repos/mccareysupon-png/nomadtips3-live-test/git/trees/{sha}?recursive=1',headers=h),timeout=30) as r:p=json.load(r)
pre='nomad-live-343/';paths=sorted(x['path'][len(pre):] for x in p['tree'] if x.get('type')=='blob' and x.get('path','').startswith(pre))
if len(paths)!=69:raise SystemExit(f'PATH_COUNT_CHANGED:{len(paths)}')
pathlib.Path('/tmp/asset-paths.txt').write_text('\n'.join(paths)+'\n')
PY
nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "/tmp/b46-assets/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "/tmp/b46-assets/$rel" -w '%{http_code}' "$WWW/$rel?signal-market-base=$nonce-$(date +%s%N)") || true
  [ "$code" = 200 ] || { echo "ASSET_FETCH_${code}:$rel"; exit 1; }
done < /tmp/asset-paths.txt
cp -a /tmp/b46-assets /tmp/b46-before
grep -Fq 'class="signal-market-toolbar"' /tmp/b46-assets/index.html
grep -Fq 'class="signal-market-chip' /tmp/b46-assets/index.html
! grep -Fq "$MARKER" /tmp/b46-assets/index.html
python3 - <<'PY'
from pathlib import Path
import hashlib
root=Path('/tmp/b46-assets');before=Path('/tmp/b46-before');p=root/'index.html';s=p.read_text()
marker='BALL46_SIGNAL_MARKET_TRANSPARENT_20260927'
style='''<style data-ball46-signal-market-transparent>\n/* BALL46_SIGNAL_MARKET_TRANSPARENT_20260927 — presentation only */\nbody[data-workspace-view="signal"] .signal-market-toolbar{background:transparent!important;border-color:transparent!important;border-width:0!important;box-shadow:none!important;}\nbody[data-workspace-view="signal"] .signal-market-chip{background:transparent!important;border-color:transparent!important;box-shadow:none!important;}\nbody[data-workspace-view="signal"] .signal-market-chip:hover,body[data-workspace-view="signal"] .signal-market-chip:focus-visible,body[data-workspace-view="signal"] .signal-market-chip.active{background:transparent!important;border-color:transparent!important;box-shadow:none!important;}\n</style>'''
if s.count('</head>')!=1:raise SystemExit('HEAD_MARKER_BAD')
s=s.replace('</head>',style+'</head>',1);p.write_text(s)
changed=[]
for rel in Path('/tmp/asset-paths.txt').read_text().splitlines():
    if hashlib.sha256((before/rel).read_bytes()).digest()!=hashlib.sha256((root/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html']:raise SystemExit('DIFF_GATE_FAILED:'+repr(changed))
PY
grep -Fq "$MARKER" /tmp/b46-assets/index.html
cat > /tmp/b46-runtime/wrangler.jsonc <<'EOF'
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"/tmp/b46-assets","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd /tmp/b46-runtime
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc
python3 - <<'PY'
import json,os,pathlib,urllib.request
h={'Authorization':f"Bearer {os.environ['CLOUDFLARE_API_TOKEN']}",'Accept':'application/json'};a=os.environ['CLOUDFLARE_ACCOUNT_ID']
with urllib.request.urlopen(urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments',headers=h),timeout=30) as r:p=json.load(r)
cur=p['result']['deployments'][0]['versions'][0]['version_id'];pre=pathlib.Path('/tmp/pre-version.txt').read_text().strip();print('RACE',cur,pre)
if cur!=pre:raise SystemExit('PRODUCTION_MOVED')
PY
for f in index.html dashboard-v2-stage3.js v2-shared.css odds-format-343.js; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$f?race=${GITHUB_RUN_ID}-$(date +%s%N)" -o "/tmp/race-$f"
  [ "$(sha256sum "/tmp/race-$f" | awk '{print $1}')" = "$(sha256sum "/tmp/b46-before/$f" | awk '{print $1}')" ] || { echo "RACE_ASSET_MOVED:$f"; exit 1; }
done
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc | tee /tmp/deploy.log
grep -Eq 'Uploaded ball46-production|Current Version ID:' /tmp/deploy.log
sleep 5
ok=0
for pass in 1 2 3 4; do
  rm -rf /tmp/b46-after && mkdir -p /tmp/b46-after
  while IFS= read -r rel; do [ -n "$rel" ] || continue; mkdir -p "/tmp/b46-after/$(dirname "$rel")"; curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?verify=${GITHUB_RUN_ID}-${pass}-$(date +%s%N)" -o "/tmp/b46-after/$rel"; done < /tmp/asset-paths.txt
  if python3 - <<'PY'
from pathlib import Path
import hashlib
w=Path('/tmp/b46-assets');g=Path('/tmp/b46-after');bad=[]
for rel in Path('/tmp/asset-paths.txt').read_text().splitlines():
    if hashlib.sha256((w/rel).read_bytes()).digest()!=hashlib.sha256((g/rel).read_bytes()).digest():bad.append(rel)
print('WWW_ASSET_MISMATCH=',bad);raise SystemExit(0 if not bad else 1)
PY
  then ok=1;break;fi
  sleep 2
done
[ "$ok" = 1 ] || exit 1
grep -Fq "$MARKER" /tmp/b46-after/index.html
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || exit 1
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1000 --virtual-time-budget=12000 --screenshot=/tmp/screens/signal-market-transparent.png "$WWW/signal.html?verify=${GITHUB_RUN_ID}" >/tmp/chrome.log 2>&1
test -s /tmp/screens/signal-market-transparent.png
echo SIGNAL_MARKET_TRANSPARENT_VERIFIED