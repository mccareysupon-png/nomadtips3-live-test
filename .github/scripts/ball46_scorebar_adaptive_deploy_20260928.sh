#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
TEMPLATE='/tmp/b46-template'; LIVE='/tmp/b46-v5'
[ -s "$TEMPLATE/paths.txt" ] || { echo TEMPLATE_PATHS_MISSING; exit 1; }
rm -rf "$LIVE" /tmp/b46-bg-pending /tmp/b46-bg-pending-deploy; mkdir -p "$LIVE/candidate"
cp "$TEMPLATE/paths.txt" "$LIVE/paths.txt"
START_VERSION=$(python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_MOVED:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_MOVED:'+repr(got))
print(vid)
PY
)
echo ADAPTIVE_START_VERSION "$START_VERSION"
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
 [ -n "$rel" ] || continue; mkdir -p "$LIVE/candidate/$(dirname "$rel")"; ok=0
 for attempt in $(seq 1 5); do code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$LIVE/candidate/$rel" -w '%{http_code}' "$DIRECT/$rel?adaptive=$nonce-$attempt-$RANDOM")||true; [ "$code" = 200 ]&&{ ok=1;break; };sleep 1;done
 [ "$ok" = 1 ] || { echo FETCH_FAIL:$rel; exit 1; }
done < "$LIVE/paths.txt"
[ "$(find "$LIVE/candidate" -type f | wc -l | tr -d ' ')" = '79' ] || { echo LIVE_NOT_79; exit 1; }
printf '%s  %s\n' 'aaa977a6a7b7e031426964f24834fd60ad4519a9821d244f797719b2f4355c4e' dashboard-v2-stage3.js 'deb16cdb601f5898f88aa0f84bfc7d989af9576a6b94ae33521fd67b7d60ac90' singlepage-workspace-343.css 'cec789ea440f0e9bf3ce7cf0db69d5d407649829ca142a0c16c7dc1fceb481b3' index.html | (cd "$LIVE/candidate" && sha256sum -c -) || { echo TARGET_FILES_CHANGED_BY_OTHER_WORK; exit 1; }
echo ADAPTIVE_TARGET_FILES_UNTOUCHED
cp .github/scripts/ball46_scorebar_bg_pending_predeploy_20260928.sh /tmp/adaptive-predeploy.sh
python3 - "$START_VERSION" <<'PY'
import sys
p='/tmp/adaptive-predeploy.sh';v=sys.argv[1];s=open(p).read().replace('9d68b06d-2f83-4b0f-958a-d4b0babf1857',v);open(p,'w').write(s)
PY
bash /tmp/adaptive-predeploy.sh
cp .github/scripts/ball46_scorebar_bg_pending_deploy_20260928.sh /tmp/adaptive-deploy.sh
python3 - "$START_VERSION" <<'PY'
import sys
p='/tmp/adaptive-deploy.sh';v=sys.argv[1];s=open(p).read().replace('0521b52a-3322-4ae9-99fb-e1ab160c77d2',v);open(p,'w').write(s)
PY
bash /tmp/adaptive-deploy.sh
echo BALL46_SCOREBAR_ADAPTIVE_DEPLOY_SUCCESS
