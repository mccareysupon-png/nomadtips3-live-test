#!/usr/bin/env bash
set -euo pipefail

WWW="https://www.ball46.com"
WORKER="ball46-production"
TOKEN="ball46-tab-logo-20260927b"
ROOT="/tmp/b46-favicon-fix"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
rm -rf "$ROOT"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY"

# 1) Lock the exact currently deployed Worker version and copy ONLY its runtime module.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-favicon-fix')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
d=p['result']['deployments'][0]; vid=d['versions'][0]['version_id']
root.joinpath('pre-version.txt').write_text(vid)
print('PRE_VERSION='+vid)
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/workers/ball46-production/versions/{vid}?include=modules'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:q=json.load(r)
res=q.get('result') or {}; mods=res.get('modules') or []
main=res.get('main_module') or 'index.js'
m=next((x for x in mods if x.get('name')==main and x.get('content_base64')),None)
if not m: raise SystemExit('CURRENT_RUNTIME_MODULE_NOT_FOUND')
runtime=base64.b64decode(m['content_base64'])
root.joinpath('runtime/index.js').write_bytes(runtime)
root.joinpath('runtime.sha').write_text(hashlib.sha256(runtime).hexdigest())
meta={k:res.get(k) for k in ['main_module','compatibility_date','bindings','assets','usage_model']}
root.joinpath('runtime-meta.json').write_text(json.dumps(meta,sort_keys=True,indent=2))
print('CURRENT_RUNTIME_LOCKED sha256='+hashlib.sha256(runtime).hexdigest())
PY

# 2) Build a candidate path list from the latest repository inventory, then mirror bytes from LIVE Production.
# Repository files are used only as filenames; their contents are NEVER deployed.
find nomad-live-343 -type f -printf '%P\n' | sort -u > "$ROOT/candidates.txt"
# Always include known public essentials even if branch inventory changes.
cat >> "$ROOT/candidates.txt" <<'EOF'
index.html
robots.txt
ball46-logo.svg
EOF
sort -u -o "$ROOT/candidates.txt" "$ROOT/candidates.txt"

nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
: > "$ROOT/live-paths.txt"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  case "$rel" in
    *.html|*.js|*.css|*.svg|*.json|*.txt|*.xml|*.png|*.webp|*.jpg|*.jpeg|*.ico|*.avif)
      mkdir -p "$BEFORE/$(dirname "$rel")"
      code=$(curl -sS -L --retry 3 --retry-all-errors --retry-delay 1 --max-time 30 \
        -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' \
        "$WWW/$rel?favicon-mirror=$nonce-${RANDOM}") || true
      if [ "$code" = 200 ] && [ -s "$BEFORE/$rel" ]; then
        echo "$rel" >> "$ROOT/live-paths.txt"
      else
        rm -f "$BEFORE/$rel"
      fi
      ;;
  esac
done < "$ROOT/candidates.txt"
sort -u -o "$ROOT/live-paths.txt" "$ROOT/live-paths.txt"

count=$(wc -l < "$ROOT/live-paths.txt" | tr -d ' ')
echo "MIRRORED_LIVE_ASSET_COUNT=$count"
# Historical production has ~69+ assets. Abort rather than deploy an incomplete mirror.
[ "$count" -ge 69 ] || { echo "LIVE_MIRROR_INCOMPLETE:$count"; exit 1; }

for required in index.html ball46-logo.svg dashboard-v2-stage3.js dashboard-v2.css singlepage-workspace-343.js signal-next.js odds-format-343.js; do
  grep -Fxq "$required" "$ROOT/live-paths.txt" || { echo "REQUIRED_LIVE_ASSET_MISSING:$required"; exit 1; }
done

# Discover same-origin static references from the mirrored text assets and require them if referenced.
python3 - <<'PY'
from pathlib import Path
import re
root=Path('/tmp/b46-favicon-fix'); before=root/'before'
paths=set(root.joinpath('live-paths.txt').read_text().splitlines())
refs=set()
for rel in list(paths):
    p=before/rel
    if p.suffix.lower() not in {'.html','.css','.js','.json','.xml','.txt'}: continue
    try:s=p.read_text(errors='ignore')
    except:continue
    for x in re.findall(r'''(?:src|href)\s*=\s*["']([^"']+)["']''',s,re.I):
        x=x.strip().split('#',1)[0].split('?',1)[0]
        if not x or x.startswith(('http://','https://','data:','mailto:','tel:','#')): continue
        x=x.lstrip('/').lstrip('./')
        if x and re.search(r'\.(?:html|js|css|svg|json|txt|xml|png|webp|jpg|jpeg|ico|avif)$',x,re.I): refs.add(x)
missing=sorted(x for x in refs if x not in paths)
root.joinpath('referenced-missing.txt').write_text('\n'.join(missing))
print('REFERENCED_NOT_IN_MIRROR=',missing)
if missing: raise SystemExit('REFERENCED_ASSET_MISSING')
PY

# 3) Health snapshot before change.
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-pre=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-pre=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-pre=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/board-before.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/signals-before.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');
if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');
if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');
console.log('PRE_HEALTH_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# 4) Copy exact live mirror, then modify ONE HTML tag only.
cp -a "$BEFORE/." "$AFTER/"
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/tmp/b46-favicon-fix/after/index.html'); s=p.read_text()
icons=re.findall(r'<link\b[^>]*rel=["\'](?:shortcut\s+)?icon["\'][^>]*>',s,re.I)
print('PRE_ICON_TAGS=',icons)
if len(icons)!=1: raise SystemExit(f'ICON_TAG_COUNT_UNEXPECTED:{len(icons)}')
old=icons[0]
if '/ball46-logo.svg' not in old: raise SystemExit('CURRENT_ICON_IS_NOT_APPROVED_BALL46_LOGO')
new='<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927b" type="image/svg+xml">'
s2=s.replace(old,new,1)
if s2==s: raise SystemExit('ICON_REPLACE_NOOP')
p.write_text(s2)
print('FAVICON_TAG_PATCHED')
PY

# Exact diff gate: ONLY index.html may differ.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-favicon-fix'); a=r/'before'; b=r/'after'; paths=r.joinpath('live-paths.txt').read_text().splitlines(); changed=[]
for rel in paths:
    if hashlib.sha256((a/rel).read_bytes()).digest()!=hashlib.sha256((b/rel).read_bytes()).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html']: raise SystemExit('DIFF_GATE_FAILED:'+repr(changed))
# Logo itself must remain byte-identical.
print('LOGO_SHA256='+hashlib.sha256((b/'ball46-logo.svg').read_bytes()).hexdigest())
PY

grep -Fq '<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927b" type="image/svg+xml">' "$AFTER/index.html"
[ "$(grep -Eio '<link[^>]+rel=["'"'](shortcut[[:space:]]+)?icon["'"'][^>]*>' "$AFTER/index.html" | wc -l)" -eq 1 ]

# 5) Rebuild using exact current runtime and exact mirrored live asset bytes.
cat > "$RUNTIME/wrangler.jsonc" <<EOF
{"name":"ball46-production","main":"./index.js","compatibility_date":"2026-09-09","no_bundle":true,"services":[{"binding":"ENGINE","service":"nomadtips3-engine-343","environment":"production"},{"binding":"FULL_MARKET","service":"nomadtips3-full-market-343-ball46","environment":"production"},{"binding":"HUB","service":"nomadtips3-5usd-hub-343","environment":"production"}],"assets":{"directory":"$AFTER","binding":"ASSETS","html_handling":"none","not_found_handling":"none","run_worker_first":true},"triggers":{"crons":["* * * * *"]}}
EOF
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc | tee "$ROOT/dry-run.log"
grep -Fq "Read $count files from the assets directory" "$ROOT/dry-run.log"

# 6) Race guard immediately before deploy: version AND key public assets must still be identical to locked baseline.
python3 - <<'PY'
import json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-favicon-fix')
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:p=json.load(x)
cur=p['result']['deployments'][0]['versions'][0]['version_id'];pre=r.joinpath('pre-version.txt').read_text().strip()
print('RACE_VERSION',cur,pre)
if cur!=pre:raise SystemExit('PRODUCTION_MOVED_ABORT')
PY
for rel in index.html ball46-logo.svg dashboard-v2-stage3.js singlepage-workspace-343.js signal-next.js odds-format-343.js; do
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?favicon-race=${GITHUB_RUN_ID}-${RANDOM}" -o "$ROOT/race-$RANDOM"
  last=$(ls -t "$ROOT"/race-* | head -1)
  [ "$(sha256sum "$last" | awk '{print $1}')" = "$(sha256sum "$BEFORE/$rel" | awk '{print $1}')" ] || { echo "PRODUCTION_ASSET_MOVED_ABORT:$rel"; exit 1; }
done
echo RACE_GUARD_PASS

# 7) Deploy.
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc | tee "$ROOT/deploy.log"
grep -Eq 'Uploaded ball46-production|Current Version ID:' "$ROOT/deploy.log"

# 8) Verify public site: only index differs; every other mirrored asset must remain byte-identical.
sleep 5
for pass in 1 2 3 4; do
  rm -rf "$VERIFY" && mkdir -p "$VERIFY"
  ok=1
  while IFS= read -r rel; do
    mkdir -p "$VERIFY/$(dirname "$rel")"
    if ! curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?favicon-verify=${GITHUB_RUN_ID}-${pass}-${RANDOM}" -o "$VERIFY/$rel"; then ok=0; break; fi
  done < "$ROOT/live-paths.txt"
  [ "$ok" = 1 ] || { sleep 2; continue; }
  if python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-favicon-fix'); exp=r/'after'; got=r/'verify'; bad=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    if hashlib.sha256((exp/rel).read_bytes()).digest()!=hashlib.sha256((got/rel).read_bytes()).digest(): bad.append(rel)
print('PUBLIC_MISMATCH=',bad)
raise SystemExit(0 if not bad else 1)
PY
  then break; fi
  [ "$pass" = 4 ] && exit 1
  sleep 2
done

grep -Fq '<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927b" type="image/svg+xml">' "$VERIFY/index.html"
[ "$(grep -Eio '<link[^>]+rel=["'"'](shortcut[[:space:]]+)?icon["'"'][^>]*>' "$VERIFY/index.html" | wc -l)" -eq 1 ]
[ "$(sha256sum "$VERIFY/ball46-logo.svg" | awk '{print $1}')" = "$(sha256sum "$BEFORE/ball46-logo.svg" | awk '{print $1}')" ]

curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/board-after.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/signals-after.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-fix/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');
if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');
if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');
console.log('POST_HEALTH_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_FAVICON_CACHEFIX_VERIFIED
