#!/usr/bin/env bash
set -euo pipefail

DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
WORKER="ball46-production"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
ROOT="/tmp/b46-odds-visible"
BEFORE="$ROOT/before"
AFTER="$ROOT/after"
RUNTIME="$ROOT/runtime"
VERIFY="$ROOT/verify"
SCREENS="$ROOT/screens"
PATH_MAP=".github/scripts/ball46_current217_live_paths_20260928.txt"

rm -rf "$ROOT"
mkdir -p "$BEFORE" "$AFTER" "$RUNTIME" "$VERIFY" "$SCREENS"

# Lock the CURRENT Production version and its wiring. No old branch/config is used.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-odds-visible')
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
vid=vs[0]['version_id']; root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('RUNTIME_MODULE_SHAPE_CHANGED')
runtime=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('RUNTIME_SHA_CHANGED:'+sha)
root.joinpath('runtime/index.js').write_bytes(runtime); root.joinpath('runtime.sha').write_text(sha)
if v.get('compatibility_date')!='2026-09-09':raise SystemExit('COMPAT_DATE_CHANGED:'+repr(v.get('compatibility_date')))
if (v.get('compatibility_flags') or [])!=[]:raise SystemExit('COMPAT_FLAGS_CHANGED:'+repr(v.get('compatibility_flags')))
expect_bind=[
 {'name':'ASSETS','type':'assets','service':None,'environment':None},
 {'name':'ENGINE','type':'service','service':'nomadtips3-engine-343','environment':'production'},
 {'name':'FULL_MARKET','type':'service','service':'nomadtips3-full-market-343-ball46','environment':'production'},
 {'name':'HUB','type':'service','service':'nomadtips3-5usd-hub-343','environment':'production'},
]
def norm(bs):return sorted([{k:b.get(k) for k in ('name','type','service','environment')} for b in bs],key=lambda x:x['name'])
if norm(v.get('bindings') or [])!=sorted(expect_bind,key=lambda x:x['name']):raise SystemExit('BINDINGS_CHANGED:'+json.dumps(norm(v.get('bindings') or []),sort_keys=True))
ac=(v.get('assets') or {}).get('config') or {}; exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('ASSET_CONFIG_CHANGED:'+json.dumps(ac,sort_keys=True))
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']; schedules=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
crons=[x.get('cron') for x in schedules if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']:raise SystemExit('CRON_CHANGED:'+repr(crons))
meta={k:v.get(k) for k in ('main_module','compatibility_date','compatibility_flags','bindings','assets','usage_model')}
root.joinpath('runtime-meta.json').write_text(json.dumps(meta,indent=2,sort_keys=True)); root.joinpath('schedules.json').write_text(json.dumps(schedules,indent=2,sort_keys=True))
print('CURRENT_PRODUCTION_LOCK_OK',vid,sha)
PY

# Mirror exactly the known 79 live asset paths from the CURRENT direct Worker.
python3 - <<'PY'
from pathlib import Path
p=Path('.github/scripts/ball46_current217_live_paths_20260928.txt')
paths=[x.strip() for x in p.read_text().splitlines() if x.strip()]
if len(paths)!=79 or len(set(paths))!=79:raise SystemExit('PATH_MAP_NOT_79')
required={'index.html','odds-format-343.js','brand-clean-header-343.css','singlepage-workspace-343.css','dashboard-v2-stage3.js','signal.js','statistics.js'}
if not required.issubset(paths):raise SystemExit('PATH_MAP_REQUIRED_MISSING:'+repr(sorted(required-set(paths))))
Path('/tmp/b46-odds-visible/live-paths.txt').write_text('\n'.join(paths)+'\n')
print('PATH_MAP_OK=79')
PY

nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$BEFORE/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' -o "$BEFORE/$rel" -w '%{http_code}' "$DIRECT/$rel?odds-visible-baseline=$nonce-${RANDOM}") || true
  [ "$code" = 200 ] || { echo "LIVE_ASSET_FETCH_FAILED:$code:$rel"; exit 1; }
  [ -s "$BEFORE/$rel" ] || { echo "LIVE_ASSET_EMPTY:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
cp -a "$BEFORE/." "$AFTER/"

# Prove the prior surgical Odds feature is the thing we are revealing.
grep -Fq 'data-workspace-odds-slot' "$BEFORE/index.html"
grep -Fq 'odds-format-343.js?v=343-odds-under-logo-surgical-20260928a' "$BEFORE/index.html"
grep -Fq "const STORAGE_KEY='nomad343_odds_format_v1';" "$BEFORE/odds-format-343.js"
grep -Fq "const FORMATS={decimal:'DEC',fractional:'FRA',american:'AM'};" "$BEFORE/odds-format-343.js"
grep -Fq '.workspace-brand-meta{display:none!important}' "$BEFORE/brand-clean-header-343.css"
! grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$BEFORE/odds-format-343.js" || { echo VISIBILITY_PATCH_ALREADY_PRESENT; exit 1; }

# Health before change.
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?odds-visible-pre=$nonce" -o "$ROOT/board-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?odds-visible-pre=$nonce" -o "$ROOT/signals-before.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?odds-visible-pre=$nonce" -o "$ROOT/stats-before.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/board-before.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/signals-before.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/stats-before.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('PRE_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('PRE_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('PRE_STATS_BAD');console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# ONE-FILE presentation patch only. Keep current card footprint: desktop 58px, mobile 48px.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-odds-visible/after/odds-format-343.js'); s=p.read_text()
anchor='  document.head.appendChild(s);'
if s.count(anchor)!=1:raise SystemExit('STYLE_APPEND_ANCHOR_COUNT:'+str(s.count(anchor)))
css="""  /* B46_ODDS_VISIBILITY_20260928: presentation only; preserves current brand-card outer height. */
  s.textContent+=`.workspace.singlepage>.left-rail .workspace-brand-card{height:58px!important;min-height:58px!important;max-height:58px!important}.workspace.singlepage>.left-rail .workspace-brand-row{height:42px!important;min-height:42px!important;max-height:42px!important}.workspace.singlepage>.left-rail .workspace-brand-card>.workspace-brand-meta[data-workspace-odds-slot]{display:flex!important;height:16px!important;min-height:16px!important;max-height:16px!important;padding:0 10px 0 12px!important;border-top:1px solid var(--line)!important;align-items:center!important;justify-content:flex-start!important;overflow:visible!important}.workspace-brand-meta[data-workspace-odds-slot] .odds-format-control{height:15px!important;min-height:15px!important;width:100%!important}.workspace-brand-meta[data-workspace-odds-slot] .odds-format-button{height:15px!important;min-height:15px!important;line-height:15px!important;padding:0!important;font-size:7px!important;font-weight:800!important;letter-spacing:.06em!important;text-align:left!important}@media(max-width:760px){.workspace.singlepage>.left-rail .workspace-brand-card{height:48px!important;min-height:48px!important;max-height:48px!important}.workspace.singlepage>.left-rail .workspace-brand-row{height:34px!important;min-height:34px!important;max-height:34px!important}.workspace.singlepage>.left-rail .workspace-brand-card>.workspace-brand-meta[data-workspace-odds-slot]{display:flex!important;height:14px!important;min-height:14px!important;max-height:14px!important;padding:0 9px 0 11px!important}.workspace-brand-meta[data-workspace-odds-slot] .odds-format-control{height:13px!important;min-height:13px!important;width:100%!important;position:relative!important;left:auto!important;right:auto!important;top:auto!important;transform:none!important}.workspace-brand-meta[data-workspace-odds-slot] .odds-format-button{height:13px!important;min-height:13px!important;line-height:13px!important;width:100%!important;font-size:6.5px!important}}`;
"""
s=s.replace(anchor,css+anchor,1)
p.write_text(s)
PY

node --check "$AFTER/odds-format-343.js"
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$AFTER/odds-format-343.js"

# Hard diff gate: exactly ONE current Production asset may differ.
python3 - <<'PY'
from pathlib import Path
import hashlib
r=Path('/tmp/b46-odds-visible'); changed=[]
for rel in r.joinpath('live-paths.txt').read_text().splitlines():
    a=(r/'before'/rel).read_bytes(); b=(r/'after'/rel).read_bytes()
    if hashlib.sha256(a).digest()!=hashlib.sha256(b).digest():changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['odds-format-343.js']:raise SystemExit('ONE_FILE_DIFF_GATE_FAILED:'+repr(changed))
r.joinpath('changed-assets.txt').write_text('\n'.join(changed)+'\n')
PY
echo ONE_FILE_DIFF_GATE_PASS

# Generate Wrangler config from CURRENT locked metadata only.
python3 - <<'PY'
from pathlib import Path
import json
r=Path('/tmp/b46-odds-visible'); meta=json.loads(r.joinpath('runtime-meta.json').read_text()); sched=json.loads(r.joinpath('schedules.json').read_text())
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
cfg={'name':'ball46-production','main':'./index.js','compatibility_date':meta['compatibility_date'],'no_bundle':True,'services':services,
     'assets':{'directory':'/tmp/b46-odds-visible/after','binding':'ASSETS','html_handling':ac.get('html_handling','none'),'not_found_handling':ac.get('not_found_handling','none'),'run_worker_first':bool(ac.get('run_worker_first',True))},
     'triggers':{'crons':crons}}
r.joinpath('wrangler.jsonc').write_text(json.dumps(cfg,indent=2,sort_keys=True))
print('WRANGLER_CONFIG='+json.dumps(cfg,sort_keys=True))
PY
cp "$RUNTIME/index.js" "$ROOT/index.js"

npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.jsonc" --dry-run

# Race guard: Production version must still be the same snapshot immediately before deploy.
python3 - <<'PY'
import json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-odds-visible'); pre=root.joinpath('pre-version.txt').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
cur=j['result']['deployments'][0]['versions'][0]['version_id']; print('RACE_VERSION',pre,cur)
if cur!=pre:raise SystemExit('RACE_VERSION_CHANGED')
PY

# Byte race-check the only file we will change plus index/runtime-sensitive anchors.
nonce="${GITHUB_RUN_ID:-manual}-race-$(date +%s%N)"
for rel in index.html odds-format-343.js brand-clean-header-343.css singlepage-workspace-343.css; do
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$ROOT/race-$rel"
  cmp -s "$BEFORE/$rel" "$ROOT/race-$rel" || { echo "RACE_ASSET_CHANGED:$rel"; exit 1; }
done
echo RACE_GUARD_PASS

npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.jsonc"

# Post-lock: runtime/config remain unchanged.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-odds-visible')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']; h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vid=d['versions'][0]['version_id']; print('POST_VERSION='+vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js':raise SystemExit('POST_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest(); print('POST_RUNTIME_SHA='+sha)
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('POST_RUNTIME_CHANGED')
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('POST_BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('POST_COMPAT_CHANGED')
sraw=get(f'{api}/workers/scripts/{script}/schedules')['result']; sched=sraw.get('schedules',[]) if isinstance(sraw,dict) else (sraw or [])
if [x.get('cron') for x in sched if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('POST_CRON_CHANGED')
print('POST_CONFIG_LOCK_PASS')
PY

# Verify all 79 Production asset bytes equal the staged set.
nonce="${GITHUB_RUN_ID:-manual}-verify-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-${RANDOM}" -o "$VERIFY/$rel"
  cmp -s "$AFTER/$rel" "$VERIFY/$rel" || { echo "POST_ASSET_MISMATCH:$rel"; exit 1; }
done < "$ROOT/live-paths.txt"
echo POST_ALL_79_ASSETS_MATCH

# Flow health after change.
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?odds-visible-post=$nonce" -o "$ROOT/board-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?odds-visible-post=$nonce" -o "$ROOT/signals-after.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?odds-visible-post=$nonce" -o "$ROOT/stats-after.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/board-after.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/signals-after.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/stats-after.json'));
if(b?.ok!==true||!Array.isArray(b?.fixtures))throw Error('POST_BOARD_BAD');if(!Array.isArray(s?.signals))throw Error('POST_SIGNALS_BAD');if(t?.ok!==true||!Array.isArray(t?.rows))throw Error('POST_STATS_BAD');console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# Browser proof: visible under logo, current outer card height preserved, and all formats still work.
chrome=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
rm -rf "$ROOT/chrome"
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9223 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&odds-visible=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome.log" 2>&1 &
CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9223/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done
sleep 8
node - <<'NODE'
const fs=require('fs');const pages=JSON.parse(fs.readFileSync('/tmp/b46-odds-visible/pages.json'));const p=pages.find(x=>x.type==='page');if(!p)throw Error('NO_CHROME_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const {ok,fail}=pending.get(m.id);pending.delete(m.id);m.error?fail(Error(JSON.stringify(m.error))):ok(m.result)}};
const call=(method,params={})=>new Promise((ok,fail)=>{const n=++id;pending.set(n,{ok,fail});ws.send(JSON.stringify({id:n,method,params}))});
(async()=>{await new Promise((ok,fail)=>{ws.onopen=ok;ws.onerror=fail});
 const ev=async expr=>{const r=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value};
 const base=await ev(`(()=>{const slot=document.querySelector('[data-workspace-odds-slot]'),btn=document.querySelector('[data-odds-format-button]'),card=document.querySelector('.workspace-brand-card'),row=document.querySelector('.workspace-brand-row');const sr=slot?.getBoundingClientRect(),br=btn?.getBoundingClientRect(),cr=card?.getBoundingClientRect(),rr=row?.getBoundingClientRect();return {display:slot?getComputedStyle(slot).display:null,slotH:sr?.height||0,btnH:br?.height||0,cardH:cr?.height||0,rowH:rr?.height||0,btn:btn?.textContent||'',inSlot:!!btn&&slot?.contains(btn),api:!!window.NOMAD343_ODDS}})()`);
 console.log('ODDS_VISIBLE_BASE',base);if(base.display==='none'||base.slotH<12||base.slotH>18||base.cardH<56||base.cardH>60||base.rowH<32||!base.inSlot||!base.api||!base.btn.includes('DEC'))throw Error('ODDS_VISIBILITY_GEOMETRY_BAD');
 const fra=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('fractional');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);if(!fra.btn.includes('FRA')||fra.stored!=='fractional')throw Error('FRA_SWITCH_BAD');
 const am=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('american');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);if(!am.btn.includes('AM')||am.stored!=='american')throw Error('AM_SWITCH_BAD');
 const dec=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('decimal');return {btn:document.querySelector('[data-odds-format-button]')?.textContent,stored:localStorage.getItem('nomad343_odds_format_v1')}})()`);if(!dec.btn.includes('DEC')||dec.stored!=='decimal')throw Error('DEC_SWITCH_BAD');
 console.log('ODDS_SWITCHES_OK',fra,am,dec);ws.close();process.exit(0)})().catch(e=>{console.error(e);try{ws.close()}catch{}process.exit(1)});
NODE
"$chrome" --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1440,1000 --virtual-time-budget=10000 --screenshot="$SCREENS/odds-visible-under-logo.png" "$WWW/index.html?status=live&odds-visible-shot=${GITHUB_RUN_ID:-manual}" >"$ROOT/chrome-shot.log" 2>&1
test -s "$SCREENS/odds-visible-under-logo.png"
kill "$CPID" 2>/dev/null || true
trap - EXIT

echo BALL46_ODDS_VISIBILITY_HOTFIX_VERIFIED
