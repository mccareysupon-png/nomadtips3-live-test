#!/usr/bin/env bash
set -euo pipefail
SRC='/tmp/b46-realistic-bg-deploy-source'
ROOT='/tmp/b46-realistic-bg-deploy'
CAND="$SRC/candidate"; BASE="$SRC/base"; RUNTIME="$SRC/runtime"; VERIFY="$ROOT/verify"
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
rm -rf "$ROOT"; mkdir -p "$VERIFY"

[ -d "$CAND" ] && [ -d "$BASE" ] && [ -f "$RUNTIME/index.js" ] || { echo ARTIFACT_LAYOUT_BAD; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = "79" ] || { echo CAND_NOT_79; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo BASE_NOT_79; exit 1; }

css_sha=$(sha256sum "$CAND/singlepage-workspace-343.css" | awk '{print $1}')
idx_sha=$(sha256sum "$CAND/index.html" | awk '{print $1}')
[ "$css_sha" = 'e4f35c62685a5963bc70a95809aecdfa8bc22dac67f999b6f83e2d168baf11d0' ] || { echo CAND_CSS_SHA_BAD:$css_sha; exit 1; }
[ "$idx_sha" = '408bd35dc6ad17720e835c83dd4983b1ee56986c9b60a5af6981a582bb9fb5ed' ] || { echo CAND_INDEX_SHA_BAD:$idx_sha; exit 1; }
[ "$(cat "$SRC/locked-version.txt")" = '9744a398-7260-40cd-9927-f7e7727f4275' ] || { echo ARTIFACT_LOCK_VERSION_BAD; exit 1; }
[ "$(cat "$SRC/runtime-sha.txt")" = 'f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed' ] || { echo ARTIFACT_RUNTIME_SHA_BAD; exit 1; }
echo ARTIFACT_CANDIDATE_LOCK_PASS "$css_sha" "$idx_sha"

python3 - <<'PY'
from pathlib import Path
import re,base64,hashlib
css=Path('/tmp/b46-realistic-bg-deploy-source/candidate/singlepage-workspace-343.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':'73e92cbccd9fc7af96571ac9f647d8e8a0aeb136de4352a4a28c404b40942497',
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':'9811deecc7a6fba27e2fb03408589f2cc6893a692b297cd2359cf9c007b3dbcc',
'.workspace-scorebar-cell.workspace-scorebar-pending':'def9d5165833c241e281d406e3a239ea06cba198df5fdc7cdd3388c8c18c0154'}
def clean(s): return ' '.join(re.sub(r'/\*.*?\*/',' ',s,flags=re.S).split())
for sel,expect in targets.items():
  hits=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
    if clean(m.group(1))!=sel: continue
    ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
    if len(ims)==1: hits.append(ims[0])
  if len(hits)!=1: raise SystemExit('CAND_IMAGE_RULE_BAD:'+sel+':'+str(len(hits)))
  got=hashlib.sha256(base64.b64decode(hits[0])).hexdigest()
  if got!=expect: raise SystemExit('CAND_IMAGE_HASH_BAD:'+sel+':'+got)
print('CANDIDATE_THREE_IMAGE_HASH_PASS')
PY

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('PRE_MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; locked=pathlib.Path('/tmp/b46-realistic-bg-deploy-source/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('PRE_RACE_VERSION_MOVED:'+locked+'->'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('PRE_RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest(); expect=pathlib.Path('/tmp/b46-realistic-bg-deploy-source/runtime-sha.txt').read_text().strip()
if sha!=expect: raise SystemExit('PRE_RUNTIME_SHA_MOVED:'+sha)
print('PRE_RACE_RUNTIME_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$ROOT/live/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$ROOT/live/$rel" -w '%{http_code}' "$DIRECT/$rel?realbgdeploy=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo PRE_LIVE_FETCH_FAIL:$rel:$code; exit 1; }
done < "$SRC/paths.txt"
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-realistic-bg-deploy-source'); live=Path('/tmp/b46-realistic-bg-deploy/live')
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]
changed=['index.html','singlepage-workspace-343.css']
for p in paths:
  a=hashlib.sha256((live/p).read_bytes()).hexdigest(); b=hashlib.sha256((r/'base'/p).read_bytes()).hexdigest()
  if a!=b: raise SystemExit('LIVE_MOVED_BYTE:'+p+':'+a+'!='+b)
print('PRE_DEPLOY_79_BASE_BYTE_LOCK_PASS')
for p in paths:
  if p in changed: continue
  a=hashlib.sha256((r/'candidate'/p).read_bytes()).hexdigest(); b=hashlib.sha256((r/'base'/p).read_bytes()).hexdigest()
  if a!=b: raise SystemExit('UNRELATED_CANDIDATE_CHANGED:'+p)
print('CANDIDATE_77_UNRELATED_BYTE_LOCK_PASS')
PY

cat > "$RUNTIME/wrangler-realbg-deploy.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler-realbg-deploy.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DEPLOY_DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DEPLOY_DRY_EXTRA_MODULES; exit 1; }
echo FINAL_DRY_RUN_PASS

python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as rr:d=json.load(rr)
vs=d['result']['deployments'][0].get('versions') or [];vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
locked=pathlib.Path('/tmp/b46-realistic-bg-deploy-source/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('FINAL_RACE_ABORT:'+locked+'->'+vid)
print('FINAL_RACE_PASS',vid)
PY

echo DEPLOY_START_EXACT_VERIFIED_CANDIDATE
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --config wrangler-realbg-deploy.jsonc 2>&1) | tee "$VERIFY/deploy.log"
newvid=$(grep -oE 'Current Version ID: [0-9a-f-]+' "$VERIFY/deploy.log" | tail -1 | awk '{print $4}')
[ -n "$newvid" ] || { echo NEW_VERSION_NOT_FOUND; exit 1; }
echo DEPLOY_NEW_VERSION "$newvid"

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('POST_RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_SHA_BAD:'+sha)
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')])
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('POST_BINDINGS_BAD:'+repr(got))
print('POST_RUNTIME_BINDINGS_PASS',vid,sha)
PY

for rel in index.html singlepage-workspace-343.css; do
  ok=0
  for i in $(seq 1 12); do
    curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$DIRECT/$rel?postrealbg=$nonce-$i" -o "$VERIFY/direct-$rel" || true
    if cmp -s "$VERIFY/direct-$rel" "$CAND/$rel"; then ok=1; break; fi
    sleep 1
  done
  [ "$ok" = 1 ] || { echo POST_DIRECT_ASSET_MISMATCH:$rel; exit 1; }
done
echo POST_DIRECT_TARGET_ASSETS_PASS

python3 - <<'PY'
from pathlib import Path
import re,base64,hashlib
css=Path('/tmp/b46-realistic-bg-deploy/verify/direct-singlepage-workspace-343.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':'73e92cbccd9fc7af96571ac9f647d8e8a0aeb136de4352a4a28c404b40942497',
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':'9811deecc7a6fba27e2fb03408589f2cc6893a692b297cd2359cf9c007b3dbcc',
'.workspace-scorebar-cell.workspace-scorebar-pending':'def9d5165833c241e281d406e3a239ea06cba198df5fdc7cdd3388c8c18c0154'}
def clean(s):return ' '.join(re.sub(r'/\*.*?\*/',' ',s,flags=re.S).split())
for sel,expect in targets.items():
  hits=[]
  for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
    if clean(m.group(1))!=sel:continue
    ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
    if len(ims)==1:hits.append(ims[0])
  if len(hits)!=1:raise SystemExit('POST_IMAGE_RULE_BAD:'+sel)
  got=hashlib.sha256(base64.b64decode(hits[0])).hexdigest()
  if got!=expect:raise SystemExit('POST_IMAGE_HASH_BAD:'+sel+':'+got)
print('POST_THREE_IMAGE_HASH_PASS')
PY

for ep in board signals statistics; do
  curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?postrealbg=$nonce" -o "$VERIFY/$ep.json"
done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-realistic-bg-deploy/verify')
for n in ['board','signals','statistics']:
  j=json.load(open(r/f'{n}.json'))
  if j.get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
print('POST_API_HEALTH_PASS')
PY

# Public-site cache check is informative only; direct Worker is deployment truth.
public_ok=0
for i in $(seq 1 8); do
  if curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$WWW/?postrealbg=$nonce-$i" | grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-realistic-player-bg-20260928a'; then public_ok=1; break; fi
  sleep 1
done
if [ "$public_ok" = 1 ]; then echo PUBLIC_CACHE_VISIBLE_PASS; else echo PUBLIC_CACHE_NOT_YET_VISIBLE_NONBLOCKING; fi

echo BALL46_REALISTIC_SCOREBAR_BG_DEPLOY_SUCCESS
