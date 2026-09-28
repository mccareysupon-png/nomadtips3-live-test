#!/usr/bin/env bash
set -euo pipefail
SRC='/tmp/b46-player-right-deploy-source'
ROOT='/tmp/b46-player-right-deploy'
CAND="$SRC/candidate"; BASE="$SRC/base"; RUNTIME="$SRC/runtime"; VERIFY="$ROOT/verify"
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
rm -rf "$ROOT"; mkdir -p "$VERIFY"

[ -d "$CAND" ] && [ -d "$BASE" ] && [ -f "$RUNTIME/index.js" ] || { echo ARTIFACT_LAYOUT_BAD; exit 1; }
[ "$(find "$CAND" -type f | wc -l | tr -d ' ')" = "79" ] || { echo CAND_NOT_79; exit 1; }
[ "$(find "$BASE" -type f | wc -l | tr -d ' ')" = "79" ] || { echo BASE_NOT_79; exit 1; }
css_sha=$(sha256sum "$CAND/singlepage-workspace-343.css" | awk '{print $1}')
idx_sha=$(sha256sum "$CAND/index.html" | awk '{print $1}')
[ "$css_sha" = '1e74660c292756a79ed1f0e765cf5c84a0c8a19b3b32017d2700b484f18a2dca' ] || { echo CAND_CSS_SHA_BAD:$css_sha; exit 1; }
[ "$idx_sha" = '56ec7f79cbc46f94a8a05662e0fa3473e88982ab5e39d10331282eea6b01c7aa' ] || { echo CAND_INDEX_SHA_BAD:$idx_sha; exit 1; }
[ "$(cat "$SRC/locked-version.txt")" = '4d89d911-ee45-41e3-b877-011d1701771d' ] || { echo ARTIFACT_LOCK_VERSION_BAD; exit 1; }
[ "$(cat "$SRC/runtime-sha.txt")" = 'f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed' ] || { echo ARTIFACT_RUNTIME_SHA_BAD; exit 1; }
echo ARTIFACT_CANDIDATE_LOCK_PASS "$css_sha" "$idx_sha"

python3 - <<'PY'
from pathlib import Path
from io import BytesIO
from PIL import Image
import re,base64,hashlib,json
css=Path('/tmp/b46-player-right-deploy-source/candidate/singlepage-workspace-343.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':('1487eca1e22d3ac68ca47036f24ac28dc72c2ae22687bca6a7635bc89e39be6c',0.62,0.36),
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':('cf76c103d9b09da518399401e22b6ff63257884af8c268540f4460dcbe559d40',0.54,0.28),
'.workspace-scorebar-cell.workspace-scorebar-pending':('e71d4ea10de0022ddfc4ae44c1546ba765fd034318fa865c82c90ed75420bfb2',0.54,0.24)}
for sel,(expect,left_expect,right_expect) in targets.items():
    hits=[]
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
        clean=re.sub(r'/\*.*?\*/','',m.group(1),flags=re.S)
        sels=[x.strip() for x in clean.split(',')]
        if sel not in sels or 'data:image/webp;base64,' not in m.group(2): continue
        ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
        if len(ims)==1: hits.append((ims[0],m.group(2)))
    if len(hits)!=1: raise SystemExit('CAND_IMAGE_RULE_BAD:'+sel+':'+str(len(hits)))
    b64,body=hits[0]; raw=base64.b64decode(b64)
    got=hashlib.sha256(raw).hexdigest()
    if got!=expect: raise SystemExit('CAND_IMAGE_HASH_BAD:'+sel+':'+got)
    im=Image.open(BytesIO(raw))
    if im.size!=(234,116): raise SystemExit('CAND_IMAGE_DIM_BAD:'+sel+':'+str(im.size))
    gm=re.search(r'linear-gradient\(90deg\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*\)',body,re.S)
    if not gm: raise SystemExit('CAND_OVERLAY_MISSING:'+sel)
    left,right=map(float,gm.groups())
    if abs(left-left_expect)>1e-9 or abs(right-right_expect)>1e-9 or not left>right: raise SystemExit('CAND_OVERLAY_BAD:'+sel+':'+str((left,right)))
print('CANDIDATE_MIRROR_HASH_AND_OVERLAY_PASS')
PY

python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('PRE_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];locked=pathlib.Path('/tmp/b46-player-right-deploy-source/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('PRE_RACE_VERSION_MOVED:'+locked+'->'+vid)
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('PRE_RUNTIME_MODULE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();expect=pathlib.Path('/tmp/b46-player-right-deploy-source/runtime-sha.txt').read_text().strip()
if sha!=expect: raise SystemExit('PRE_RUNTIME_SHA_MOVED:'+sha)
print('PRE_RACE_RUNTIME_LOCK_PASS',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$ROOT/live/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$ROOT/live/$rel" -w '%{http_code}' "$DIRECT/$rel?playerrightdeploy=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo PRE_LIVE_FETCH_FAIL:$rel:$code; exit 1; }
done < "$SRC/paths.txt"
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-player-right-deploy-source');live=Path('/tmp/b46-player-right-deploy/live')
paths=[x for x in (r/'paths.txt').read_text().splitlines() if x]; changed=['index.html','singlepage-workspace-343.css']
for p in paths:
    a=hashlib.sha256((live/p).read_bytes()).hexdigest();b=hashlib.sha256((r/'base'/p).read_bytes()).hexdigest()
    if a!=b: raise SystemExit('LIVE_MOVED_BYTE:'+p+':'+a+'!='+b)
print('PRE_DEPLOY_79_BASE_BYTE_LOCK_PASS')
for p in paths:
    if p in changed: continue
    a=hashlib.sha256((r/'candidate'/p).read_bytes()).hexdigest();b=hashlib.sha256((r/'base'/p).read_bytes()).hexdigest()
    if a!=b: raise SystemExit('UNRELATED_CANDIDATE_CHANGED:'+p)
print('CANDIDATE_77_UNRELATED_BYTE_LOCK_PASS')
PY

cat > "$RUNTIME/wrangler-player-right.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$CAND","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler-player-right.jsonc 2>&1) | tee "$VERIFY/dry-run.log"
grep -Fq 'Read 79 files from the assets directory' "$VERIFY/dry-run.log" || { echo DEPLOY_DRY_NOT_79; exit 1; }
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DEPLOY_DRY_EXTRA_MODULES; exit 1; }
echo FINAL_DRY_RUN_PASS

python3 - <<'PY'
import json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{A}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as rr:d=json.load(rr)
vs=d['result']['deployments'][0].get('versions') or [];vid=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
locked=pathlib.Path('/tmp/b46-player-right-deploy-source/locked-version.txt').read_text().strip()
if vid!=locked: raise SystemExit('FINAL_RACE_ABORT:'+locked+'->'+vid)
print('FINAL_RACE_PASS',vid)
PY

echo DEPLOY_START_EXACT_VERIFIED_CANDIDATE
(cd "$RUNTIME" && npx --yes wrangler@4.92.0 deploy --config wrangler-player-right.jsonc 2>&1) | tee "$VERIFY/deploy.log"
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
    curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$DIRECT/$rel?postplayerright=$nonce-$i" -o "$VERIFY/direct-$rel" || true
    if cmp -s "$VERIFY/direct-$rel" "$CAND/$rel"; then ok=1; break; fi
    sleep 1
  done
  [ "$ok" = 1 ] || { echo POST_DIRECT_ASSET_MISMATCH:$rel; exit 1; }
done
echo POST_DIRECT_TARGET_ASSETS_PASS

python3 - <<'PY'
from pathlib import Path
from io import BytesIO
from PIL import Image
import re,base64,hashlib
css=Path('/tmp/b46-player-right-deploy/verify/direct-singlepage-workspace-343.css').read_text()
targets={
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win':('1487eca1e22d3ac68ca47036f24ac28dc72c2ae22687bca6a7635bc89e39be6c',0.62,0.36),
'.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss':('cf76c103d9b09da518399401e22b6ff63257884af8c268540f4460dcbe559d40',0.54,0.28),
'.workspace-scorebar-cell.workspace-scorebar-pending':('e71d4ea10de0022ddfc4ae44c1546ba765fd034318fa865c82c90ed75420bfb2',0.54,0.24)}
for sel,(expect,le,rex) in targets.items():
    hits=[]
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}',css,re.S):
        clean=re.sub(r'/\*.*?\*/','',m.group(1),flags=re.S); sels=[x.strip() for x in clean.split(',')]
        if sel not in sels or 'data:image/webp;base64,' not in m.group(2): continue
        ims=re.findall(r'data:image/webp;base64,([A-Za-z0-9+/=]+)',m.group(2))
        if len(ims)==1:hits.append((ims[0],m.group(2)))
    if len(hits)!=1: raise SystemExit('POST_IMAGE_RULE_BAD:'+sel)
    b64,body=hits[0];raw=base64.b64decode(b64);got=hashlib.sha256(raw).hexdigest()
    if got!=expect: raise SystemExit('POST_IMAGE_HASH_BAD:'+sel+':'+got)
    if Image.open(BytesIO(raw)).size!=(234,116): raise SystemExit('POST_IMAGE_DIM_BAD:'+sel)
    gm=re.search(r'linear-gradient\(90deg\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*,\s*rgba\([^)]*?,\s*([0-9.]+)\)\s*\)',body,re.S)
    left,right=map(float,gm.groups()) if gm else (-1,-1)
    if abs(left-le)>1e-9 or abs(right-rex)>1e-9 or not left>right: raise SystemExit('POST_OVERLAY_BAD:'+sel)
print('POST_MIRROR_HASH_DIM_OVERLAY_PASS')
PY

for ep in board signals statistics; do
  curl -fsSL --retry 4 --retry-all-errors --max-time 30 "$DIRECT/api/engine/$ep?postplayerright=$nonce" -o "$VERIFY/$ep.json"
done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-player-right-deploy/verify')
for n in ['board','signals','statistics']:
  j=json.load(open(r/f'{n}.json'))
  if j.get('ok') is not True: raise SystemExit('POST_API_BAD:'+n)
print('POST_API_HEALTH_PASS')
PY

public_ok=0
for i in $(seq 1 8); do
  if curl -fsSL --max-time 20 -H 'Cache-Control: no-cache,no-store' "$WWW/?postplayerright=$nonce-$i" | grep -Fq 'singlepage-workspace-343.css?v=343-scorebar-player-right-20260928a'; then public_ok=1; break; fi
  sleep 1
done
if [ "$public_ok" = 1 ]; then echo PUBLIC_CACHE_VISIBLE_PASS; else echo PUBLIC_CACHE_NOT_YET_VISIBLE_NONBLOCKING; fi

echo BALL46_PLAYER_RIGHT_DEPLOY_SUCCESS
