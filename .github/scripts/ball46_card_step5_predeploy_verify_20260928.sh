#!/usr/bin/env bash
set -euo pipefail

WORKER="ball46-production"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
SRC="/tmp/b46-step5-source"
ROOT="/tmp/b46-step5"
LIVE="$ROOT/current-live"
VERIFY="$ROOT/verify"
rm -rf "$ROOT"
mkdir -p "$LIVE" "$VERIFY"

# READ-ONLY CURRENT PRODUCTION DIAGNOSTIC. No deploy command exists in this file.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-step5')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'
script='ball46-production'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r:
        return json.load(r)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_DEPLOYMENT')
d=deps[0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:
    raise SystemExit('MIXED_OR_UNEXPECTED_DEPLOYMENT:'+json.dumps(vs,sort_keys=True))
vid=vs[0]['version_id']
root.joinpath('pre-version.txt').write_text(vid+'\n')
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
modinfo=[]
for m in mods:
    entry={'name':m.get('name'),'content_type':m.get('content_type')}
    if m.get('content_base64'):
        b=base64.b64decode(m['content_base64'])
        entry['size']=len(b); entry['sha256']=hashlib.sha256(b).hexdigest()
        if m.get('name')=='index.js': root.joinpath('current-index.js').write_bytes(b)
    modinfo.append(entry)
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']
schedules=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
crons=[x.get('cron') for x in schedules if isinstance(x,dict) and x.get('cron')]
meta={
 'deployment':d,
 'version_id':vid,
 'version_number':v.get('number'),
 'created_on':v.get('created_on'),
 'annotations':v.get('annotations') or {},
 'compatibility_date':v.get('compatibility_date'),
 'compatibility_flags':v.get('compatibility_flags') or [],
 'modules':modinfo,
 'bindings':v.get('bindings') or [],
 'assets':v.get('assets') or {},
 'crons':crons,
}
root.joinpath('current-production.json').write_text(json.dumps(meta,indent=2,sort_keys=True))
print('CURRENT_VERSION',vid)
print('VERSION_NUMBER',v.get('number'))
print('CREATED_ON',v.get('created_on'))
print('ANNOTATIONS',json.dumps(v.get('annotations') or {},sort_keys=True))
print('MODULES',json.dumps(modinfo,sort_keys=True))
print('COMPAT',v.get('compatibility_date'),v.get('compatibility_flags') or [])
print('BINDINGS',json.dumps(v.get('bindings') or [],sort_keys=True))
print('ASSETS_META',json.dumps(v.get('assets') or {},sort_keys=True))
print('CRONS',crons)
PY

# Compare every path from the last exact 79-file package against what CURRENT
# Production serves. This is diagnostic only; it does not assume the inventory is complete.
test -s "$SRC/live-paths.txt"
test -d "$SRC/after"
python3 - <<'PY'
from pathlib import Path
src=Path('/tmp/b46-step5-source')
paths=[x.strip() for x in src.joinpath('live-paths.txt').read_text().splitlines() if x.strip()]
if len(paths)!=79 or len(set(paths))!=79: raise SystemExit('REFERENCE_PATH_SET_BAD')
Path('/tmp/b46-step5/reference-live-paths.txt').write_text('\n'.join(paths)+'\n')
print('REFERENCE_PATHS',len(paths))
PY
nonce="${GITHUB_RUN_ID:-manual}-fresh-$(date +%s%N)"
: > "$ROOT/asset-drift.txt"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$LIVE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' \
    -o "$LIVE/$rel" -w '%{http_code}' "$DIRECT/$rel?step5-current=$nonce-${RANDOM}") || true
  if [ "$code" != 200 ] || [ ! -s "$LIVE/$rel" ]; then
    printf 'FETCH:%s:%s\n' "$code" "$rel" >> "$ROOT/asset-drift.txt"
    continue
  fi
  if ! cmp -s "$SRC/after/$rel" "$LIVE/$rel"; then
    printf 'CHANGED:%s\n' "$rel" >> "$ROOT/asset-drift.txt"
  fi
done < "$ROOT/reference-live-paths.txt"

python3 - <<'PY'
from pathlib import Path
import hashlib, json
r=Path('/tmp/b46-step5'); live=r/'current-live'; drift=r.joinpath('asset-drift.txt').read_text().splitlines()
css=live/'dashboard-v2-tune.css'
css_sha=hashlib.sha256(css.read_bytes()).hexdigest() if css.is_file() else None
out={'reference_paths':79,'fetched_files':sum(1 for p in live.rglob('*') if p.is_file()),'drift':drift,'target_css_sha256':css_sha}
r.joinpath('asset-comparison.json').write_text(json.dumps(out,indent=2,sort_keys=True))
print('ASSET_COMPARISON',json.dumps(out,sort_keys=True))
PY

# Read-only live flow check.
nonce="${GITHUB_RUN_ID:-manual}-health-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step5=$nonce" -o "$VERIFY/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step5=$nonce" -o "$VERIFY/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step5=$nonce" -o "$VERIFY/stats.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/board.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/signals.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-step5/verify/stats.json'));
if(b?.ok!==true||!Array.isArray(b.fixtures)) throw Error('BOARD_HEALTH_BAD');
if(!Array.isArray(s.signals)) throw Error('SIGNALS_HEALTH_BAD');
if(t?.ok!==true||!Array.isArray(t.rows)) throw Error('STATS_HEALTH_BAD');
const out={fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length};
fs.writeFileSync('/tmp/b46-step5/flow-counts.json',JSON.stringify(out,null,2));
console.log('LIVE_FLOW',out);
NODE

# Race guard: read-only diagnostic is valid only if Production did not move while inspected.
python3 - <<'PY'
import json, os, pathlib, urllib.request
r=pathlib.Path('/tmp/b46-step5'); pre=r.joinpath('pre-version.txt').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x: d=json.load(x)['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('RACE_DEPLOYMENT_SHAPE_CHANGED')
cur=vs[0]['version_id']
print('RACE_VERSION',pre,cur)
if cur!=pre: raise SystemExit('RACE_GUARD_FAILED_PRODUCTION_MOVED')
r.joinpath('race-guard.txt').write_text('PASS '+cur+'\n')
PY

echo CURRENT_PRODUCTION_DIAGNOSTIC_COMPLETE_NO_DEPLOY
