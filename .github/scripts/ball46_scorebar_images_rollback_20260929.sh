#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'; WWW='https://www.ball46.com'
SRC='/tmp/b46-imgpre'; BASE="$SRC/live"; SAVED_RUNTIME="$SRC/runtime/index.js"; LOCK="$SRC/production-lock.json"
DEPLOY_ROOT='/tmp/b46-scorebar-images-deploy'; ROOT='/tmp/b46-scorebar-images-rollback'; RUNTIME="$ROOT/runtime"; VERIFY="$ROOT/verify"
mkdir -p "$RUNTIME" "$VERIFY"
if [ ! -f "$DEPLOY_ROOT/deployed-version.txt" ]; then echo ROLLBACK_NOT_NEEDED_NO_DEPLOYED_VERSION; exit 0; fi
DEPLOYED_VERSION=$(cat "$DEPLOY_ROOT/deployed-version.txt")
[ -d "$BASE" ] && [ -f "$SAVED_RUNTIME" ] && [ -f "$LOCK" ] || { echo ROLLBACK_BASE_MISSING; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = '79' ] || { echo ROLLBACK_BASE_NOT_79; exit 1; }

# Ownership guard: never rollback over another deploy.
python3 - <<'PY'
import json,os,urllib.request
expected=open('/tmp/b46-scorebar-images-deploy/deployed-version.txt').read().strip();A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or [];cur=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
print('ROLLBACK_CURRENT_VERSION',cur,'EXPECTED_OWNED_VERSION',expected)
if cur!=expected: raise SystemExit('ROLLBACK_ABORT_PRODUCTION_MOVED:'+cur)
PY

cp "$SAVED_RUNTIME" "$RUNTIME/index.js"
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$BASE","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo ROLLBACK_DRY_NOT_79; exit 1; }
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/rollback-deploy.log"

python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request,time
root=pathlib.Path('/tmp/b46-scorebar-images-rollback');lock=json.load(open('/tmp/b46-imgpre/production-lock.json'));owned=open('/tmp/b46-scorebar-images-deploy/deployed-version.txt').read().strip();A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
vid=None
for _ in range(12):
 d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
 if len(vs)==1 and float(vs[0].get('percentage',0))==100 and vs[0]['version_id']!=owned:vid=vs[0]['version_id'];break
 time.sleep(2)
if not vid: raise SystemExit('ROLLBACK_NEW_VERSION_NOT_VISIBLE')
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest() if len(mods)==1 and mods[0].get('content_base64') else 'BAD'
if sha!=lock['runtime_sha256']: raise SystemExit('ROLLBACK_RUNTIME_BAD:'+sha)
root.joinpath('rollback-version.txt').write_text(vid);print('ROLLBACK_RUNTIME_PASS',vid,sha)
PY

for attempt in $(seq 1 12); do
 rm -rf "$ROOT/post";mkdir -p "$ROOT/post";ok=1;nonce="${GITHUB_RUN_ID:-manual}-rollback${attempt}-$(date +%s%N)"
 while IFS= read -r rel; do
  [ -n "$rel" ]||continue;mkdir -p "$ROOT/post/$(dirname "$rel")"
  code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 20 -H 'Cache-Control: no-cache' -o "$ROOT/post/$rel" -w '%{http_code}' "$DIRECT/$rel?scorebarimgrollback=$nonce-${RANDOM}")||true
  if [ "$code" != 200 ]||! cmp -s "$ROOT/post/$rel" "$BASE/$rel";then ok=0;break;fi
 done < <(cd "$BASE"&&find . -type f -printf '%P\n'|sort)
 [ "$ok" = 1 ]&&{ echo ROLLBACK_79_RESTORED;break; }
 [ "$attempt" = 12 ]&&{ echo ROLLBACK_PROPAGATION_FAIL;exit 1; };sleep 2
done
for ep in board signals statistics;do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?scorebarimgrollback=$(date +%s%N)" -o "$VERIFY/$ep.json";done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-images-rollback/verify')
for n in ['board','signals','statistics']:
 if json.load(open(r/f'{n}.json')).get('ok') is not True:raise SystemExit('ROLLBACK_API_BAD:'+n)
print('ROLLBACK_API_PASS')
PY
echo BALL46_SCOREBAR_IMAGES_ROLLBACK_PASS
