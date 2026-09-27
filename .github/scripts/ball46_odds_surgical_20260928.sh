#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
WORKER="ball46-production"
EXPECTED_VERSION="dae0283d-ce00-4730-8ba4-cf51745f926f"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
EXPECTED_INDEX_SHA="875811988aa09f590dc352fa7690d433fda15bfe23ce64476cd776a26d62fbd3"
EXPECTED_ODDS_SHA="26caa0ea54f136ea728bf105b3176e02aabc4114fc92f710db9e49158a83d5fe"
TOKEN="343-odds-under-logo-surgical-20260928a"
ROOT="/tmp/b46-odds-surgical"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
SCREENS="$ROOT/screens"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"

rm -rf "$ROOT"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$SCREENS"

# Lock exact currently deployed Production version/runtime/config before touching assets.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-odds-surgical')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'
script='ball46-production'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r:return json.load(r)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps:raise SystemExit('NO_CURRENT_DEPLOYMENT')
d=deps[0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('UNEXPECTED_DEPLOYMENT_SHAPE:'+json.dumps(vs))
vid=vs[0]['version_id']; expected='dae0283d-ce00-4730-8ba4-cf51745f926f'
if vid!=expected:raise SystemExit(f'PRODUCTION_VERSION_MOVED:{vid}!={expected}')
root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('RUNTIME_MODULE_SHAPE_CHANGED')
runtime=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('RUNTIME_SHA_CHANGED:'+sha)
root.joinpath('runtime/index.js').write_bytes(runtime);root.joinpath('runtime.sha').write_text(sha)
if v.get('compatibility_date')!='2026-09-09':raise SystemExit('COMPAT_DATE_CHANGED:'+repr(v.get('compatibility_date')))
if (v.get('compatibility_flags') or [])!=[]:raise SystemExit('COMPAT_FLAGS_CHANGED:'+repr(v.get('compatibility_flags')))
expect_bind=[
 {'name':'ASSETS','type':'assets','service':None,'environment':None},
 {'name':'ENGINE','type':'service','service':'nomadtips3-engine-343','environment':'production'},
 {'name':'FULL_MARKET','type':'service','service':'nomadtips3-full-market-343-ball46','environment':'production'},
 {'name':'HUB','type':'service','service':'nomadtips3-5usd-hub-343','environment':'production'},
]
def norm_bind(bs):
    return sorted([{k:b.get(k) for k in ('name','type','service','environment')} for b in bs],key=lambda x:x['name'])
if norm_bind(v.get('bindings') or [])!=sorted(expect_bind,key=lambda x:x['name']):raise SystemExit('BINDINGS_CHANGED:'+json.dumps(norm_bind(v.get('bindings') or []),sort_keys=True))
asset_cfg=(v.get('assets') or {}).get('config') or {}
expect_asset={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:asset_cfg.get(k) for k in expect_asset}!=expect_asset:raise SystemExit('ASSET_CONFIG_CHANGED:'+json.dumps(asset_cfg,sort_keys=True))
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']
schedules=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
crons=[x.get('cron') for x in schedules if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']:raise SystemExit('CRON_CHANGED:'+repr(crons))
meta={k:v.get(k) for k in ('main_module','compatibility_date','compatibility_flags','bindings','assets','usage_model')}
root.joinpath('runtime-meta.json').write_text(json.dumps(meta,indent=2,sort_keys=True));root.joinpath('schedules.json').write_text(json.dumps(schedules,indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,sha)
PY

# Validate path map and mirror every byte from the CURRENT direct Worker only.
python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt')
paths=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(paths)!=79:raise SystemExit('PATH_COUNT_CHANGED:'+str(len(paths)))
if len(set(paths))!=79:raise SystemExit('DUPLICATE_PATHS')
required={'index.html','odds-format-343.js','dashboard-v2-stage3.js','signal.js','statistics.js','singlepage-workspace-343.js','workspace-route-guard-343.js'}
if not required.issubset(paths):raise SystemExit('REQUIRED_PATH_MISSING:'+repr(sorted(required-set(paths))))
Path('/tmp/b46-odds-surgical/live-paths.txt').write_text('\n'.join(paths)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?odds-baseline=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_ASSET_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "LIVE_ASSET_EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"

[ "$(sha256sum "$BEFORE/index.html" | awk '{print $1}')" = "$EXPECTED_INDEX_SHA" ] || { echo CURRENT_INDEX_HASH_MOVED; exit 1; }
[ "$(sha256sum "$BEFORE/odds-format-343.js" | awk '{print $1}')" = "$EXPECTED_ODDS_SHA" ] || { echo CURRENT_ODDS_HASH_MOVED; exit 1; }
cp -a "$BEFORE/." "$AFTER/"
(cd "$BEFORE" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$ROOT/before-sha256.txt"

# Read-only live flow health before change.
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?odds-pre=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?odds-pre=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?odds-pre=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Surgical patch: exactly index.html + existing frontend-only odds formatter.
python3 - <<'PY'
from pathlib import Path
root=Path('/tmp/b46-odds-surgical/after')
ip=root/'index.html';s=ip.read_text()
old='<div class="workspace-brand-meta"><span>LIVE WORKSPACE</span><b>BULK · DEC</b></div>'
new='<div class="workspace-brand-meta" data-workspace-odds-slot aria-label="Odds display format"></div>'
if s.count(old)!=1:raise SystemExit('BRAND_SLOT_TARGET_COUNT:'+str(s.count(old)))
s=s.replace(old,new,1)
if 'odds-format-343.js' in s:raise SystemExit('ODDS_FORMAT_ALREADY_LOADED')
marker='<script src="dashboard-v2-stage3.js?v=343-market-detail-20260922a" defer></script>'
if s.count(marker)!=1:raise SystemExit('DASHBOARD_SCRIPT_TARGET_COUNT:'+str(s.count(marker)))
s=s.replace(marker,marker+'<script src="odds-format-343.js?v=343-odds-under-logo-surgical-20260928a" defer></script>',1)
ip.write_text(s)

jp=root/'odds-format-343.js';j=jp.read_text()
a="    root.querySelectorAll?.('td.odds').forEach(convertDirectElement);"
b="    root.querySelectorAll?.('td.odds').forEach(convertDirectElement);\n    root.querySelectorAll?.('.market-prices strong').forEach(convertDirectElement);\n    root.querySelectorAll?.('.feature-signal-meta span').forEach(convertOddsLabel);"
if j.count(a)!=1:raise SystemExit('APPLY_TARGET_COUNT:'+str(j.count(a)))
j=j.replace(a,b,1)
a="  const host=document.querySelector('.topbar-inner');if(!host)return;"
b="  const host=document.querySelector('[data-workspace-odds-slot]')||document.querySelector('.topbar-inner');if(!host)return;"
if j.count(a)!=1:raise SystemExit('HOST_TARGET_COUNT:'+str(j.count(a)))
j=j.replace(a,b,1)
anchor="function convertLiveInline(el){\n  if(!el.dataset.nomadOddsRaw){const p=parseAt(el.textContent);if(!p)return;el.dataset.nomadOddsRaw=p.raw;el.dataset.nomadOddsPrefix=p.prefix;el.dataset.nomadOddsSuffix=p.suffix}\n  setElementText(el,`${el.dataset.nomadOddsPrefix||''}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);\n}\n"
addon="""function convertOddsLabel(el){
  if(!el.dataset.nomadOddsRaw){const m=String(el.textContent||'').match(/^(\\s*Odds\\s+)([0-9]+(?:\\.[0-9]+)?)(.*)$/i);if(!m)return;el.dataset.nomadOddsRaw=m[2];el.dataset.nomadOddsPrefix=m[1];el.dataset.nomadOddsSuffix=m[3]}
  setElementText(el,`${el.dataset.nomadOddsPrefix||'Odds '}${format(el.dataset.nomadOddsRaw)}${el.dataset.nomadOddsSuffix||''}`);
}
"""
if j.count(anchor)!=1:raise SystemExit('LABEL_ANCHOR_COUNT:'+str(j.count(anchor)))
j=j.replace(anchor,anchor+addon,1)
style_anchor='  document.head.appendChild(s);'
context_style="""  s.textContent+=`.workspace-brand-meta .odds-format-control{position:relative!important;flex:1 1 auto!important;width:100%!important;min-width:0!important}.workspace-brand-meta .odds-format-button{height:27px!important;width:100%!important;padding:0!important;text-align:left!important;color:var(--muted)!important;font-size:7px!important;letter-spacing:.07em!important}.workspace-brand-meta .odds-format-button:hover,.workspace-brand-meta .odds-format-button:focus-visible{color:var(--text)!important}.workspace-brand-meta .odds-format-menu{position:fixed!important;right:auto!important;min-width:148px!important;padding:4px!important;background:var(--panel)!important;border:1px solid var(--line)!important;box-shadow:0 10px 28px rgba(0,0,0,.18)!important}.workspace-brand-meta .odds-format-menu button{color:var(--muted)!important;background:transparent!important;font-size:8px!important}.workspace-brand-meta .odds-format-menu button:hover,.workspace-brand-meta .odds-format-menu button.active{background:var(--panel-2)!important;color:var(--text)!important}`;\n"""
if j.count(style_anchor)!=1:raise SystemExit('STYLE_ANCHOR_COUNT:'+str(j.count(style_anchor)))
j=j.replace(style_anchor,context_style+style_anchor,1)
click="  button.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open))});"
click_new="""  const placeMenu=()=>{if(!host.matches('[data-workspace-odds-slot]'))return;const r=button.getBoundingClientRect();menu.style.left=`${Math.round(r.left)}px`;menu.style.top=`${Math.round(r.bottom+3)}px`;menu.style.right='auto'};
  button.addEventListener('click',e=>{e.stopPropagation();const open=menu.hidden;menu.hidden=!open;button.setAttribute('aria-expanded',String(open));if(open)placeMenu()});"""
if j.count(click)!=1:raise SystemExit('CLICK_ANCHOR_COUNT:'+str(j.count(click)))
j=j.replace(click,click_new,1)
jp.write_text(j)
PY

node --check "$AFTER/odds-format-343.js"
grep -Fq 'data-workspace-odds-slot' "$AFTER/index.html"
grep -Fq "odds-format-343.js?v=$TOKEN" "$AFTER/index.html"
grep -Fq "const STORAGE_KEY='nomad343_odds_format_v1';" "$AFTER/odds-format-343.js"
grep -Fq "const FORMATS={decimal:'DEC',fractional:'FRA',american:'AM'};" "$AFTER/odds-format-343.js"

python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-odds-surgical');a=r/'before';b=r/'after';changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    if hashlib.sha256((a/rel).read_bytes()).digest()!=hashlib.sha256((b/rel).read_bytes()).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html','odds-format-343.js']:raise SystemExit('DIFF_GATE_FAILED:'+repr(changed))
r.joinpath('changed-assets.txt').write_text('\n'.join(changed)+'\n')
PY
(cd "$AFTER" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$ROOT/after-sha256.txt"
echo SURGICAL_DIFF_GATE_PASS

# Generate deployment config from the locked CURRENT metadata, never from an old branch.
python3 - <<'PY'
from pathlib import Path
import json
r=Path('/tmp/b46-odds-surgical');meta=json.loads(r.joinpath('runtime-meta.json').read_text());sched=json.loads(r.joinpath('schedules.json').read_text())
services=[]
for b in meta.get('bindings') or []:
    if b.get('type')=='service':
        x={'binding':b['name'],'service':b['service']}
        if b.get('environment'):x['environment']=b['environment']
        services.append(x)
    elif b.get('type')=='assets':pass
    else:raise SystemExit('UNSUPPORTED_BINDING:'+repr(b))
crons=[x.get('cron') for x in sched if isinstance(x,dict) and x.get('cron')]
ac=(meta.get('assets') or {}).get('config') or {}
cfg={'name':'ball46-production','main':'./index.js','compatibility_date':meta['compatibility_date'],'no_bundle':True,'services':services,'assets':{'directory':'/tmp/b46-odds-surgical/after','binding':'ASSETS','html_handling':ac.get('html_handling','none'),'not_found_handling':ac.get('not_found_handling','none'),'run_worker_first':bool(ac.get('run_worker_first',True))},'triggers':{'crons':crons}}
r.joinpath('runtime/wrangler.jsonc').write_text(json.dumps(cfg,indent=2))
print('WRANGLER_CONFIG='+json.dumps(cfg,sort_keys=True))
PY
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc | tee "$ROOT/dry-run.log"

# Race guard immediately before deploy: version and all 79 bytes must still be the locked baseline.
python3 - <<'PY'
import json, os, pathlib, urllib.request
r=pathlib.Path('/tmp/b46-odds-surgical');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:p=json.load(x)
vs=p['result']['deployments'][0].get('versions') or []
cur=vs[0]['version_id'] if len(vs)==1 and float(vs[0].get('percentage',0))==100 else 'MIXED'
pre=r.joinpath('pre-version.txt').read_text().strip();print('RACE_VERSION',cur,pre)
if cur!=pre:raise SystemExit('PRODUCTION_MOVED_BEFORE_DEPLOY')
PY

nonce="${GITHUB_RUN_ID:-manual}-race-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/race/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?odds-race=$nonce-${RANDOM}" -o "$VERIFY/race/$rel"
  [ "$(sha256sum "$VERIFY/race/$rel" | awk '{print $1}')" = "$(sha256sum "$BEFORE/$rel" | awk '{print $1}')" ] || { echo "RACE_ASSET_MOVED:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
echo RACE_GUARD_PASS

# Deploy current runtime + current 79 assets with only the approved two-file patch.
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc | tee "$ROOT/deploy.log"
grep -Eq 'Uploaded ball46-production|Current Version ID:' "$ROOT/deploy.log"

# Post-deploy lock: runtime, bindings, asset config and cron must remain identical.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
r=pathlib.Path('/tmp/b46-odds-surgical');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('POST_DEPLOYMENT_MIXED')
vid=vs[0]['version_id'];r.joinpath('post-version.txt').write_text(vid);print('POST_VERSION='+vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_MODULE_CHANGED')
raw=base64.b64decode(mods[0].get('content_base64') or '');sha=hashlib.sha256(raw).hexdigest();print('POST_RUNTIME_SHA='+sha)
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('POST_RUNTIME_SHA_CHANGED')
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or [])!=[]:raise SystemExit('POST_COMPAT_CHANGED')
def norm(bs):return sorted([{k:b.get(k) for k in ('name','type','service','environment')} for b in bs],key=lambda x:x['name'])
expect=[{'name':'ASSETS','type':'assets','service':None,'environment':None},{'name':'ENGINE','type':'service','service':'nomadtips3-engine-343','environment':'production'},{'name':'FULL_MARKET','type':'service','service':'nomadtips3-full-market-343-ball46','environment':'production'},{'name':'HUB','type':'service','service':'nomadtips3-5usd-hub-343','environment':'production'}]
if norm(v.get('bindings') or [])!=sorted(expect,key=lambda x:x['name']):raise SystemExit('POST_BINDINGS_CHANGED')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('POST_ASSET_CONFIG_CHANGED')
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or []);cr=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if cr!=['* * * * *']:raise SystemExit('POST_CRON_CHANGED:'+repr(cr))
print('POST_CONFIG_LOCK_PASS')
PY

# Verify every current asset byte equals the staged result. Retry for propagation.
ok=0
for pass in 1 2 3 4; do
  rm -rf "$VERIFY/live" && mkdir -p "$VERIFY/live"
  bad=0
  nonce="${GITHUB_RUN_ID:-manual}-post-${pass}-$(date +%s%N)"
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    mkdir -p "$VERIFY/live/$(dirname "$rel")"
    if ! curl -fsS -L --retry 3 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?odds-post=$nonce-${RANDOM}" -o "$VERIFY/live/$rel"; then bad=1; break; fi
    if [ "$(sha256sum "$VERIFY/live/$rel" | awk '{print $1}')" != "$(sha256sum "$AFTER/$rel" | awk '{print $1}')" ]; then echo "POST_ASSET_MISMATCH:$rel:pass=$pass"; bad=1; break; fi
  done < "$ROOT/live-paths.txt"
  if [ "$bad" = 0 ]; then ok=1; break; fi
  sleep 3
done
[ "$ok" = 1 ] || { echo POST_ASSET_VERIFY_FAILED; exit 1; }
echo POST_ALL_79_ASSETS_MATCH

# Read-only flow health after deploy: schema must still be healthy; counts may naturally change live.
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?odds-post=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?odds-post=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?odds-post=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Browser proof: control renders under logo and DEC -> FRA -> AM switches without API/wiring changes.
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
rm -rf "$ROOT/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9222 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&odds-surgical=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome.log" 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9222/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done
sleep 8
node - <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-odds-surgical/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_CHROME_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {ok,fail}=pending.get(m.id);pending.delete(m.id);m.error?fail(Error(JSON.stringify(m.error))):ok(m.result)}};
const call=(method,params={})=>new Promise((ok,fail)=>{const n=++id;pending.set(n,{ok,fail});ws.send(JSON.stringify({id:n,method,params}))});
(async()=>{await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
 const ev=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
 const base=await ev(`(()=>{const slot=document.querySelector('[data-workspace-odds-slot]');const btn=document.querySelector('[data-odds-format-button]');return {slot:!!slot,btn:btn?.textContent||'',inSlot:!!btn&&slot?.contains(btn),api:!!window.NOMAD343_ODDS,old:slot?.textContent.includes('LIVE WORKSPACE')||slot?.textContent.includes('BULK · DEC')}})()`);
 console.log('ODDS_BROWSER_BASE',base);if(!base.slot||!base.inSlot||!base.api||base.old||!base.btn.includes('DEC'))throw Error('ODDS_BASE_RENDER_BAD');
 const fra=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('fractional');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);console.log('ODDS_FRA',fra);if(!fra.btn.includes('FRA')||fra.stored!=='fractional')throw Error('FRA_SWITCH_BAD');
 const am=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('american');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);console.log('ODDS_AM',am);if(!am.btn.includes('AM')||am.stored!=='american')throw Error('AM_SWITCH_BAD');
 const dec=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('decimal');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);console.log('ODDS_DEC',dec);if(!dec.btn.includes('DEC')||dec.stored!=='decimal')throw Error('DEC_SWITCH_BAD');
 ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1200 --virtual-time-budget=10000 --screenshot="$SCREENS/odds-under-logo.png" "$WWW/index.html?status=live&odds-shot=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome-shot.log" 2>&1
test -s "$SCREENS/odds-under-logo.png"
kill "$CPID" 2>/dev/null || true
trap - EXIT

echo BALL46_ODDS_SURGICAL_DEPLOY_VERIFIED
