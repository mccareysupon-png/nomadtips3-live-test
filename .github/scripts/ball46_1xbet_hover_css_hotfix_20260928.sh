#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
ROOT="/tmp/b46-1xbet-hover-css"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
CLEAN="/tmp/b46-1xbet-hover-clean"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"
rm -rf "$ROOT" "$CLEAN"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$CLEAN"

# Lock CURRENT Production runtime/config. No old branch/site payload is used.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-hover-css')
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

python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt')
xs=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(xs)!=79 or len(set(xs))!=79: raise SystemExit('PATH_MAP_NOT_79')
need={'index.html','odds-format-343.js','dashboard-v2-stage3.js','full-market-bookmaker-343.js','signal.js','statistics.js'}
if not need.issubset(xs): raise SystemExit('REQUIRED_MISSING:'+repr(sorted(need-set(xs))))
Path('/tmp/b46-1xbet-hover-css/live-paths.txt').write_text('\n'.join(xs)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?b46-1xbet-hover=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$BEFORE/odds-format-343.js"
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$BEFORE/odds-format-343.js"
grep -Fq 'border-bottom:1px dotted currentColor' "$BEFORE/odds-format-343.js"
grep -Fq 'filter:brightness(.82)' "$BEFORE/odds-format-343.js"

# Health snapshot before CSS-only change.
nonce="${GITHUB_RUN_ID}-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46hover=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46hover=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46hover=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/stats-before.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_FLOW_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# CSS-only surgical replacement inside the existing 1xBet v2 presentation block.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-1xbet-hover-css/after/odds-format-343.js')
s=p.read_text()
old=".b46-1xbet-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border-bottom:1px dotted currentColor}.b46-1xbet-odds:hover,.b46-1xbet-odds:focus-visible{filter:brightness(.82);outline:none}"
new=".b46-1xbet-odds{color:inherit!important;text-decoration:none!important;font:inherit;font-weight:inherit;cursor:pointer;border:0!important;box-shadow:none!important}.b46-1xbet-odds:hover,.b46-1xbet-odds:focus-visible,.b46-1xbet-odds:active{filter:brightness(1.35);text-shadow:0 0 6px currentColor;outline:none}"
if s.count(old)!=1: raise SystemExit('OLD_CSS_SIGNATURE_COUNT_'+str(s.count(old)))
s=s.replace(old,new,1)
p.write_text(s)
PY

node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_1XBET_AFFILIATE_V2_20260928' "$AFTER/odds-format-343.js"
grep -Fq 'border:0!important;box-shadow:none!important' "$AFTER/odds-format-343.js"
grep -Fq '.b46-1xbet-odds:active{filter:brightness(1.35);text-shadow:0 0 6px currentColor;outline:none}' "$AFTER/odds-format-343.js"
! sed -n '/B46_1XBET_AFFILIATE_V2_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Fq 'border-bottom:1px dotted currentColor' || { echo DOTTED_UNDERLINE_REMAINS; exit 1; }
! sed -n '/B46_1XBET_AFFILIATE_V2_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Fq 'filter:brightness(.82)' || { echo DARK_HOVER_REMAINS; exit 1; }
! sed -n '/B46_1XBET_AFFILIATE_V2_20260928/,$p' "$AFTER/odds-format-343.js" | grep -Eq '\bfetch\s*\(|XMLHttpRequest|/api/' || { echo AFFILIATE_BLOCK_TOUCHES_NETWORK; exit 1; }

# Hard diff gate: only odds-format-343.js may change.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-1xbet-hover-css'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
  if hashlib.sha256((r/'before'/rel).read_bytes()).digest()!=hashlib.sha256((r/'after'/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['odds-format-343.js']: raise SystemExit('ONE_FILE_DIFF_FAILED:'+repr(changed))
PY
echo ONE_FILE_DIFF_GATE_PASS

cp "$RUNTIME/index.js" "$CLEAN/index.js"
cat > "$CLEAN/wrangler.jsonc" <<EOF
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
EOF
cd "$CLEAN"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry.log" || { echo DRY_EXTRA_MODULES; exit 1; }

# Race guard: abort if Production moved after snapshot.
python3 - <<'PY'
import json,os,pathlib,urllib.request
p=pathlib.Path('/tmp/b46-1xbet-hover-css/pre-version.txt').read_text().strip();a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
c=j['result']['deployments'][0]['versions'][0]['version_id'];print('RACE_VERSION',p,c)
if c!=p: raise SystemExit('PRODUCTION_MOVED')
PY

echo RACE_GUARD_PASS
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }

# Verify runtime remains one clean index.js with identical bytes.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-1xbet-hover-css');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vid=d['versions'][0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
print('POST_MODULES',[m.get('name') for m in mods])
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest(); pre=r.joinpath('runtime.sha').read_text().strip()
if sha!=pre: raise SystemExit('POST_RUNTIME_BYTES_CHANGED')
print('POST_RUNTIME_CLEAN',vid,sha)
PY

# Verify all 79 live assets equal target snapshot, then verify engine flow unchanged.
nonce="${GITHUB_RUN_ID}-post-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  cmp -s "$AFTER/$rel" "$VERIFY/post/$rel" || { echo POST_ASSET_MISMATCH:$rel; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_79_ASSETS_MATCH_TARGET

grep -Fq 'border:0!important;box-shadow:none!important' "$VERIFY/post/odds-format-343.js"
grep -Fq '.b46-1xbet-odds:active{filter:brightness(1.35);text-shadow:0 0 6px currentColor;outline:none}' "$VERIFY/post/odds-format-343.js"
! grep -Fq 'border-bottom:1px dotted currentColor' "$VERIFY/post/odds-format-343.js" || { echo POST_DOTTED_UNDERLINE_REMAINS; exit 1; }

nonce="${GITHUB_RUN_ID}-postflow-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?b46hover=$nonce" -o "$VERIFY/board-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?b46hover=$nonce" -o "$VERIFY/signals-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?b46hover=$nonce" -o "$VERIFY/stats-post.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/verify/board-post.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/verify/signals-post.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-1xbet-hover-css/verify/stats-post.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_FLOW_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_1XBET_HOVER_CSS_HOTFIX_VERIFIED
