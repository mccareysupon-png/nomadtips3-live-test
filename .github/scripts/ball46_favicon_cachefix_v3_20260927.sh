#!/usr/bin/env bash
set -euo pipefail

WWW="https://www.ball46.com"
WORKER="ball46-production"
TOKEN="ball46-tab-logo-20260927c"
ROOT="/tmp/b46-favicon-v3"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
rm -rf "$ROOT"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY"

# Lock exact live Worker version, runtime, bindings, asset-module names and schedules.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
r=pathlib.Path('/tmp/b46-favicon-v3')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
base=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production'
with urllib.request.urlopen(urllib.request.Request(base+'/deployments',headers=h),timeout=30) as x:p=json.load(x)
d=p['result']['deployments'][0]; vid=d['versions'][0]['version_id']; r.joinpath('pre-version.txt').write_text(vid)
print('PRE_VERSION='+vid)
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/workers/ball46-production/versions/{vid}?include=modules'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:q=json.load(x)
res=q.get('result') or {}; mods=res.get('modules') or []
main=res.get('main_module') or 'index.js'; m=next((x for x in mods if x.get('name')==main and x.get('content_base64')),None)
if not m: raise SystemExit('CURRENT_RUNTIME_MODULE_NOT_FOUND')
runtime=base64.b64decode(m['content_base64']); r.joinpath('runtime/index.js').write_bytes(runtime)
r.joinpath('runtime.sha').write_text(hashlib.sha256(runtime).hexdigest())
meta={k:res.get(k) for k in ['main_module','compatibility_date','compatibility_flags','bindings','assets','usage_model']}
r.joinpath('runtime-meta.json').write_text(json.dumps(meta,sort_keys=True,indent=2))
assetmods=[]
for x in mods:
    n=x.get('name') or ''
    if n.startswith('assets/'):
        assetmods.append(n[len('assets/'):])
r.joinpath('module-assets.txt').write_text('\n'.join(sorted(set(assetmods)))+'\n')
# Abort on any unexpected binding type rather than silently dropping it.
allowed={'assets','service'}; bad=[b for b in (res.get('bindings') or []) if b.get('type') not in allowed]
if bad: raise SystemExit('UNEXPECTED_BINDING_TYPES:'+json.dumps(bad))
try:
    with urllib.request.urlopen(urllib.request.Request(base+'/schedules',headers=h),timeout=30) as x:s=json.load(x)
    schedules=s.get('result') or []
except Exception as e:
    raise SystemExit('SCHEDULE_READ_FAILED:'+repr(e))
r.joinpath('schedules.json').write_text(json.dumps(schedules,sort_keys=True,indent=2))
print('RUNTIME_SHA='+hashlib.sha256(runtime).hexdigest())
print('MODULE_ASSETS='+json.dumps(sorted(set(assetmods))))
print('SCHEDULES='+json.dumps(schedules,sort_keys=True))
PY

# Build a broad filename inventory from multiple known Ball46 branches.
python3 - <<'PY'
from pathlib import Path
import json, os, urllib.request, urllib.parse
root=Path('/tmp/b46-favicon-v3'); paths=set()
local=Path('nomad-live-343')
if local.exists():
    for p in local.rglob('*'):
        if p.is_file(): paths.add(p.relative_to(local).as_posix())
refs=[
 'main','production/ball46-canonical','golden/ball46-stable-20260926',
 'work/ball46-logo-card-settings-odds-prod-safe-20260926','ops/ball46-odds-slot-20260927',
 'ops/ball46-live-content-stability-20260927','ops/ball46-menu-count-repair-20260927',
 'ops/ball46-signal-market-transparent-20260927','ops/ball46-signal-market-hide-text-20260927',
 'recovery/ball46-exact-0921-20260927','recovery/ball46-restore-good-0600-20260926',
 'work/ball46-home-default-10-prod-safe-20260925','work/ball46-contact-form-v1-20260927'
]
tok=os.environ.get('GH_TOKEN',''); h={'Accept':'application/vnd.github+json'}
if tok:h['Authorization']=f'Bearer {tok}'
api='https://api.github.com/repos/mccareysupon-png/nomadtips3-live-test'
for ref in refs:
    try:
        u=api+'/branches/'+urllib.parse.quote(ref,safe='')
        with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:b=json.load(r)
        sha=b['commit']['sha']
        with urllib.request.urlopen(urllib.request.Request(api+f'/git/trees/{sha}?recursive=1',headers=h),timeout=30) as r:t=json.load(r)
        n=0
        for x in t.get('tree') or []:
            p=x.get('path','')
            if x.get('type')=='blob' and p.startswith('nomad-live-343/'):
                paths.add(p[len('nomad-live-343/'):]); n+=1
        print('INVENTORY_REF',ref,n)
    except Exception as e:
        print('INVENTORY_REF_SKIP',ref,repr(e))
for x in root.joinpath('module-assets.txt').read_text().splitlines():
    if x: paths.add(x)
paths.update({'index.html','robots.txt','sitemap.xml','ball46-logo.svg','ball46-favicon.svg'})
exts=('.html','.js','.css','.svg','.json','.txt','.xml','.png','.webp','.jpg','.jpeg','.ico','.avif','.gif')
paths=sorted(p for p in paths if p.lower().endswith(exts) and '..' not in p and not p.startswith('/'))
root.joinpath('candidates.txt').write_text('\n'.join(paths)+'\n')
print('CANDIDATE_COUNT='+str(len(paths)))
PY

# Mirror every candidate from live Production. Repository contents are never copied.
python3 - <<'PY'
from pathlib import Path
import concurrent.futures, os, time, urllib.request, urllib.error
root=Path('/tmp/b46-favicon-v3'); out=root/'before'; base='https://www.ball46.com/'
paths=root.joinpath('candidates.txt').read_text().splitlines(); nonce=os.environ.get('GITHUB_RUN_ID','run')+'-'+str(time.time_ns())
def get(rel):
    url=base+rel+'?favicon-v3='+nonce+'-'+str(abs(hash(rel)))
    try:
        req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'ball46-favicon-safe-mirror'})
        with urllib.request.urlopen(req,timeout=30) as r:
            if r.status!=200:return rel,False,r.status
            data=r.read()
        if not data:return rel,False,'empty'
        p=out/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);return rel,True,200
    except urllib.error.HTTPError as e:return rel,False,e.code
    except Exception as e:return rel,False,type(e).__name__
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex: results=list(ex.map(get,paths))
live=sorted(rel for rel,ok,_ in results if ok); missing=sorted((rel,code) for rel,ok,code in results if not ok)
root.joinpath('live-paths.txt').write_text('\n'.join(live)+'\n');root.joinpath('candidate-missing.json').write_text(__import__('json').dumps(missing,indent=2))
print('MIRRORED_INITIAL='+str(len(live)));print('CANDIDATE_MISSING='+repr(missing[:80]))
PY

# Recursively discover every same-origin asset referenced by mirrored HTML/CSS/JS and fetch it from live Production.
python3 - <<'PY'
from pathlib import Path
import concurrent.futures, os, re, time, urllib.request, urllib.error, urllib.parse
root=Path('/tmp/b46-favicon-v3'); out=root/'before'; base='https://www.ball46.com/'
paths=set(root.joinpath('live-paths.txt').read_text().splitlines()); nonce=os.environ.get('GITHUB_RUN_ID','run')+'-crawl-'+str(time.time_ns())
exts=r'(?:html|js|css|svg|json|txt|xml|png|webp|jpg|jpeg|ico|avif|gif)'
def refs_in(rel):
    p=out/rel
    if p.suffix.lower() not in {'.html','.css','.js','.json','.xml','.txt'}:return set()
    s=p.read_text(errors='ignore'); found=set()
    pats=[r'''(?:src|href)\s*=\s*["']([^"']+)["']''',r'''url\(\s*["']?([^"')]+)''',rf'''["']([^"']+\.{exts}(?:\?[^"']*)?)["']''']
    for pat in pats:
        for x in re.findall(pat,s,re.I):
            x=urllib.parse.unquote(str(x)).strip().split('#',1)[0].split('?',1)[0]
            if not x or x.startswith(('http://','https://','//','data:','mailto:','tel:','#')):continue
            x=x.lstrip('/').lstrip('./')
            if x and re.search(rf'\.{exts}$',x,re.I) and '..' not in x:found.add(x)
    return found
def fetch(rel):
    try:
        req=urllib.request.Request(base+rel+'?favicon-crawl='+nonce+'-'+str(abs(hash(rel))),headers={'Cache-Control':'no-cache','User-Agent':'ball46-favicon-safe-crawl'})
        with urllib.request.urlopen(req,timeout=30) as r:
            if r.status!=200:return rel,False
            data=r.read()
        if not data:return rel,False
        p=out/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);return rel,True
    except Exception:return rel,False
for round_no in range(1,8):
    refs=set()
    for rel in list(paths):refs|=refs_in(rel)
    new=sorted(refs-paths)
    print('CRAWL_ROUND',round_no,'DISCOVERED',new)
    if not new:break
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:results=list(ex.map(fetch,new))
    added={rel for rel,ok in results if ok}; failed=sorted(rel for rel,ok in results if not ok)
    print('CRAWL_ADDED',sorted(added));print('CRAWL_FAILED',failed)
    paths|=added
    # A referenced local file that does not exist in Production is a hard stop.
    if failed: raise SystemExit('REFERENCED_LIVE_ASSET_MISSING:'+repr(failed))
else: raise SystemExit('CRAWL_DID_NOT_CONVERGE')
root.joinpath('live-paths.txt').write_text('\n'.join(sorted(paths))+'\n')
# Final reference closure check.
refs=set()
for rel in list(paths):refs|=refs_in(rel)
missing=sorted(refs-paths);print('FINAL_REFERENCED_MISSING=',missing)
if missing:raise SystemExit('REFERENCE_CLOSURE_FAILED')
print('FINAL_LIVE_ASSET_COUNT='+str(len(paths)))
PY

count=$(wc -l < "$ROOT/live-paths.txt" | tr -d ' ')
[ "$count" -ge 79 ] || { echo "LIVE_INVENTORY_TOO_SMALL:$count"; exit 1; }
for required in index.html ball46-logo.svg dashboard-v2-stage3.js dashboard-v2.css singlepage-workspace-343.js signal-next.js odds-format-343.js workspace-route-guard-343.js ui-sync-fixes-343.js ui-sync-fixes-343.css color-semantics-343.js color-semantics-343.css; do
  grep -Fxq "$required" "$ROOT/live-paths.txt" || { echo "REQUIRED_ASSET_MISSING:$required"; exit 1; }
done
while IFS= read -r required; do [ -z "$required" ] || grep -Fxq "$required" "$ROOT/live-paths.txt" || { echo "MODULE_ASSET_MISSING:$required"; exit 1; }; done < "$ROOT/module-assets.txt"

# Live API health before change.
nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-pre=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-pre=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-pre=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');console.log('PRE_HEALTH_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Copy exact live bytes and patch ONE favicon tag, keeping the approved logo file unchanged.
cp -a "$BEFORE/." "$AFTER/"
python3 - <<'PY'
from pathlib import Path
import re
p=Path('/tmp/b46-favicon-v3/after/index.html');s=p.read_text();icons=re.findall(r'<link\b[^>]*rel=["\'](?:shortcut\s+)?icon["\'][^>]*>',s,re.I)
print('PRE_ICON_TAGS=',icons)
if len(icons)!=1:raise SystemExit('ICON_TAG_COUNT_UNEXPECTED:'+str(len(icons)))
old=icons[0]
if '/ball46-logo.svg' not in old:raise SystemExit('APPROVED_LOGO_NOT_CURRENT_ICON')
new='<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927c" type="image/svg+xml">'
s2=s.replace(old,new,1)
if s2==s:raise SystemExit('FAVICON_PATCH_NOOP')
p.write_text(s2);print('FAVICON_PATCH_OK')
PY
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-favicon-v3');a=r/'before';b=r/'after';changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    if hashlib.sha256((a/rel).read_bytes()).digest()!=hashlib.sha256((b/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html']:raise SystemExit('DIFF_GATE_FAILED:'+repr(changed))
print('LOGO_SHA256='+hashlib.sha256((b/'ball46-logo.svg').read_bytes()).hexdigest())
PY

grep -Fq '<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927c" type="image/svg+xml">' "$AFTER/index.html"

# Generate Wrangler config from CURRENT version metadata/bindings/schedules, aborting on anything unexpected.
python3 - <<'PY'
from pathlib import Path
import json
r=Path('/tmp/b46-favicon-v3');meta=json.loads(r.joinpath('runtime-meta.json').read_text());sched=json.loads(r.joinpath('schedules.json').read_text())
services=[]
for b in meta.get('bindings') or []:
    if b.get('type')=='service':services.append({'binding':b['name'],'service':b['service'],**({'environment':b['environment']} if b.get('environment') else {})})
    elif b.get('type')=='assets':pass
    else:raise SystemExit('UNSUPPORTED_BINDING:'+repr(b))
crons=[]
for x in sched:
    c=x.get('cron') if isinstance(x,dict) else None
    if c:crons.append(c)
cfg={'name':'ball46-production','main':'./index.js','compatibility_date':meta.get('compatibility_date') or '2026-09-09','no_bundle':True,'services':services,'assets':{'directory':'/tmp/b46-favicon-v3/after','binding':'ASSETS','html_handling':(meta.get('assets') or {}).get('config',{}).get('html_handling','none'),'not_found_handling':(meta.get('assets') or {}).get('config',{}).get('not_found_handling','none'),'run_worker_first':(meta.get('assets') or {}).get('config',{}).get('run_worker_first',True)}}
flags=meta.get('compatibility_flags')
if flags:cfg['compatibility_flags']=flags
if crons:cfg['triggers']={'crons':crons}
r.joinpath('runtime/wrangler.json').write_text(json.dumps(cfg,indent=2))
print('WRANGLER_CONFIG='+json.dumps(cfg,sort_keys=True))
PY
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.json | tee "$ROOT/dry-run.log"
grep -Fq "Read $count files from the assets directory" "$ROOT/dry-run.log"

# Race guard: exact Worker version must still be current immediately before deployment.
python3 - <<'PY'
import json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-favicon-v3');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:p=json.load(x)
cur=p['result']['deployments'][0]['versions'][0]['version_id'];pre=r.joinpath('pre-version.txt').read_text().strip();print('RACE_VERSION',cur,pre)
if cur!=pre:raise SystemExit('PRODUCTION_MOVED_ABORT')
PY
for rel in index.html ball46-logo.svg dashboard-v2-stage3.js singlepage-workspace-343.js signal-next.js odds-format-343.js workspace-route-guard-343.js; do
  tmp="$ROOT/race-$(echo "$rel" | tr '/ ' '__')"
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?favicon-race=${GITHUB_RUN_ID}-${RANDOM}" -o "$tmp"
  [ "$(sha256sum "$tmp" | awk '{print $1}')" = "$(sha256sum "$BEFORE/$rel" | awk '{print $1}')" ] || { echo "PRODUCTION_ASSET_MOVED_ABORT:$rel"; exit 1; }
done
echo RACE_GUARD_PASS

# Deploy the exact live mirror with only index.html changed.
npx --yes wrangler@4.92.0 deploy --config wrangler.json | tee "$ROOT/deploy.log"
grep -Eq 'Uploaded ball46-production|Current Version ID:' "$ROOT/deploy.log"

# Verify EVERY mirrored asset against expected bytes.
sleep 5
ok=0
for pass in 1 2 3 4; do
  rm -rf "$VERIFY" && mkdir -p "$VERIFY"
  while IFS= read -r rel; do
    mkdir -p "$VERIFY/$(dirname "$rel")"
    curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$WWW/$rel?favicon-verify=${GITHUB_RUN_ID}-${pass}-${RANDOM}" -o "$VERIFY/$rel" || break
  done < "$ROOT/live-paths.txt"
  if python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-favicon-v3');e=r/'after';g=r/'verify';bad=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    if not (g/rel).exists() or hashlib.sha256((e/rel).read_bytes()).digest()!=hashlib.sha256((g/rel).read_bytes()).digest():bad.append(rel)
print('PUBLIC_MISMATCH=',bad);raise SystemExit(0 if not bad else 1)
PY
  then ok=1;break;fi
  sleep 2
done
[ "$ok" = 1 ] || { echo PUBLIC_VERIFY_FAILED; exit 1; }

grep -Fq '<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927c" type="image/svg+xml">' "$VERIFY/index.html"
[ "$(sha256sum "$VERIFY/ball46-logo.svg" | awk '{print $1}')" = "$(sha256sum "$BEFORE/ball46-logo.svg" | awk '{print $1}')" ]

# Runtime hash after deploy must still be identical to pre-deploy runtime.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-favicon-v3');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:p=json.load(x)
vid=p['result']['deployments'][0]['versions'][0]['version_id'];print('POST_VERSION='+vid)
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/workers/ball46-production/versions/{vid}?include=modules'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:q=json.load(x)
res=q.get('result') or {};main=res.get('main_module') or 'index.js';m=next((x for x in res.get('modules') or [] if x.get('name')==main and x.get('content_base64')),None)
if not m:raise SystemExit('POST_RUNTIME_MISSING')
hashnow=hashlib.sha256(base64.b64decode(m['content_base64'])).hexdigest();hashpre=r.joinpath('runtime.sha').read_text().strip();print('POST_RUNTIME_SHA='+hashnow)
if hashnow!=hashpre:raise SystemExit('RUNTIME_CHANGED_UNEXPECTEDLY')
PY

# API health after change.
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-post=${GITHUB_RUN_ID}" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-v3/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');console.log('POST_HEALTH_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_FAVICON_V3_VERIFIED
