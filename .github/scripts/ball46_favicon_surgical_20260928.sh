#!/usr/bin/env bash
set -euo pipefail

ART="/tmp/b46-current-artifact"
ROOT="/tmp/b46-favicon-surgical"
AFTER="$ROOT/after"
VERIFY="$ROOT/verify"
RUNTIME="$ROOT/runtime"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
OLD_ICON='<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927c" type="image/svg+xml">'
rm -rf "$ROOT"
mkdir -p "$AFTER" "$VERIFY" "$RUNTIME"

# The downloaded artifact is the exact successful Odds deployment payload.
[ -d "$ART/after" ] || { echo ODDS_ARTIFACT_AFTER_MISSING; exit 1; }
[ -f "$ART/live-paths.txt" ] || { echo ODDS_ARTIFACT_PATHMAP_MISSING; exit 1; }
[ -f "$ART/runtime/index.js" ] || { echo ODDS_ARTIFACT_RUNTIME_MISSING; exit 1; }
[ "$(find "$ART/after" -type f | wc -l | tr -d ' ')" = 79 ] || { echo ODDS_ARTIFACT_ASSET_COUNT_BAD; exit 1; }
[ "$(grep -cve '^$' "$ART/live-paths.txt" | tr -d ' ')" = 79 ] || { echo ODDS_ARTIFACT_PATH_COUNT_BAD; exit 1; }
[ "$(sha256sum "$ART/runtime/index.js" | awk '{print $1}')" = "$EXPECTED_RUNTIME_SHA" ] || { echo ODDS_ARTIFACT_RUNTIME_BAD; exit 1; }
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$ART/after/odds-format-343.js" || { echo CURRENT_ODDS_MARKER_MISSING; exit 1; }

# 1) Lock the exact Production runtime/config that is online NOW.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-favicon-surgical')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
deps=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_DEPLOYMENT')
vs=deps[0].get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT:'+json.dumps(vs))
vid=vs[0]['version_id']; root.joinpath('pre-version.txt').write_text(vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(mods)!=1 or len(main)!=1: raise SystemExit('CURRENT_RUNTIME_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
runtime=base64.b64decode(main[0]['content_base64']); sha=hashlib.sha256(runtime).hexdigest()
expected_sha='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
if sha!=expected_sha: raise SystemExit('CURRENT_RUNTIME_SHA_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('CURRENT_BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('CURRENT_COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('CURRENT_ASSET_CONFIG_CHANGED:'+json.dumps(ac,sort_keys=True))
s=get(f'{api}/workers/scripts/{script}/schedules')['result']; ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if crons!=['* * * * *']: raise SystemExit('CURRENT_CRON_CHANGED:'+repr(crons))
root.joinpath('runtime-current.bin').write_bytes(runtime)
root.joinpath('runtime-meta.json').write_text(json.dumps({k:v.get(k) for k in ('main_module','compatibility_date','compatibility_flags','bindings','assets','usage_model')},indent=2,sort_keys=True))
root.joinpath('schedules.json').write_text(json.dumps(ss,indent=2,sort_keys=True))
print('CURRENT_PRODUCTION_LOCK_OK',vid,sha)
PY
cmp -s "$ART/runtime/index.js" "$ROOT/runtime-current.bin" || { echo ODDS_ARTIFACT_RUNTIME_NOT_CURRENT; exit 1; }

# 2) Prove every byte in the Odds artifact still equals CURRENT Production.
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/live/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?favicon-pre=$nonce-${RANDOM}" -o "$VERIFY/live/$rel"
  cmp -s "$ART/after/$rel" "$VERIFY/live/$rel" || { echo CURRENT_PRODUCTION_DIFFERS_FROM_ODDS_BASE:$rel; exit 1; }
done < "$ART/live-paths.txt"
echo CURRENT_79_ASSETS_MATCH_SUCCESSFUL_ODDS_BASE

# Health must be good before any candidate is built.
nonce="${GITHUB_RUN_ID:-manual}-health-pre-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-pre=$nonce" -o "$VERIFY/board-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-pre=$nonce" -o "$VERIFY/signals-pre.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-pre=$nonce" -o "$VERIFY/stats-pre.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/board-pre.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/signals-pre.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/stats-pre.json'));
if(b?.ok!==true||!Array.isArray(b.fixtures))throw Error('PRE_BOARD_BAD');
if(!Array.isArray(s.signals))throw Error('PRE_SIGNALS_BAD');
if(t?.ok!==true||!Array.isArray(t.rows))throw Error('PRE_STATS_BAD');
console.log('PRE_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

# 3) Candidate is a byte-for-byte copy of CURRENT Production, then ONE tag in index.html is changed.
cp -a "$ART/after/." "$AFTER/"
python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote, unquote
import re, xml.etree.ElementTree as ET
p=Path('/tmp/b46-favicon-surgical/after/index.html')
s=p.read_text()
old='<link rel="icon" href="/ball46-logo.svg?v=ball46-tab-logo-20260927c" type="image/svg+xml">'
if s.count(old)!=1: raise SystemExit('CURRENT_ICON_TARGET_COUNT:'+str(s.count(old)))
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/><text x="32" y="27" text-anchor="middle" font-family="Arial,sans-serif" font-size="19" font-weight="800" fill="#fff">ball</text><text x="32" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="31" font-weight="900" fill="#00d84a">46</text></svg>'''
uri='data:image/svg+xml,'+quote(svg,safe='')
new=f'<link rel="icon" href="{uri}" type="image/svg+xml" data-ball46-favicon="20260928">'
s2=s.replace(old,new,1)
if s2==s: raise SystemExit('FAVICON_REPLACE_NOOP')
p.write_text(s2)
# Parse the exact SVG payload back to prove it is valid XML and contains the intended brand text.
m=re.search(r'<link rel="icon" href="data:image/svg\+xml,([^"]+)" type="image/svg\+xml" data-ball46-favicon="20260928">',s2)
if not m: raise SystemExit('NEW_FAVICON_TAG_NOT_FOUND')
raw=unquote(m.group(1)); root=ET.fromstring(raw)
texts=[''.join(x.itertext()) for x in root.findall('{http://www.w3.org/2000/svg}text')]
if texts!=['ball','46']: raise SystemExit('FAVICON_TEXT_BAD:'+repr(texts))
print('FAVICON_INLINE_SVG_VALID',len(uri))
PY

# Exact diff gate: index.html and NOTHING ELSE.
python3 - <<'PY'
from pathlib import Path
import hashlib
art=Path('/tmp/b46-current-artifact/after'); after=Path('/tmp/b46-favicon-surgical/after')
paths=[x.strip() for x in Path('/tmp/b46-current-artifact/live-paths.txt').read_text().splitlines() if x.strip()]
changed=[]
for rel in paths:
    a=(art/rel).read_bytes(); b=(after/rel).read_bytes()
    if hashlib.sha256(a).digest()!=hashlib.sha256(b).digest(): changed.append(rel)
print('CHANGED_ASSETS=',changed)
if changed!=['index.html']: raise SystemExit('ONE_FILE_DIFF_GATE_FAILED:'+repr(changed))
Path('/tmp/b46-favicon-surgical/changed-assets.txt').write_text('\n'.join(changed)+'\n')
PY
cmp -s "$ART/after/odds-format-343.js" "$AFTER/odds-format-343.js" || { echo ODDS_FILE_CHANGED; exit 1; }
cmp -s "$ART/after/dashboard-v2-stage3.js" "$AFTER/dashboard-v2-stage3.js" || { echo DASHBOARD_FILE_CHANGED; exit 1; }
cmp -s "$ART/after/signal.js" "$AFTER/signal.js" || { echo SIGNAL_FILE_CHANGED; exit 1; }
cmp -s "$ART/after/statistics.js" "$AFTER/statistics.js" || { echo STATISTICS_FILE_CHANGED; exit 1; }
echo ONE_FILE_FAVICON_DIFF_GATE_PASS

# 4) Reuse the verified CURRENT one-module runtime. Config is allowed only after the exact-current checks above pass.
cp "$ROOT/runtime-current.bin" "$RUNTIME/index.js"
cat > "$RUNTIME/wrangler.jsonc" <<EOF
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
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/dry-run.log" || { echo DRY_RUN_EXTRA_MODULES; exit 1; }
echo DRY_RUN_PASS

# 5) Race guard immediately before deploy. Any Production movement aborts the operation.
python3 - <<'PY'
import json,os,pathlib,urllib.request
pre=pathlib.Path('/tmp/b46-favicon-surgical/pre-version.txt').read_text().strip()
a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{a}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
vs=j['result']['deployments'][0].get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('RACE_MIXED_DEPLOYMENT')
cur=vs[0]['version_id']; print('RACE_VERSION',pre,cur)
if cur!=pre: raise SystemExit('PRODUCTION_MOVED_ABORT')
PY
for rel in index.html odds-format-343.js dashboard-v2-stage3.js signal.js statistics.js singlepage-workspace-343.js; do
  tmp="$VERIFY/race-$(echo "$rel" | tr '/' '_')"
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?favicon-race=${GITHUB_RUN_ID}-${RANDOM}" -o "$tmp"
  cmp -s "$ART/after/$rel" "$tmp" || { echo RACE_ASSET_MOVED_ABORT:$rel; exit 1; }
done
echo RACE_GUARD_PASS

# 6) Deploy the one-file asset change with the verified current runtime/config.
npx --yes wrangler@4.92.0 deploy --config wrangler.jsonc 2>&1 | tee "$VERIFY/deploy.log"
! grep -Fq 'Attaching additional modules:' "$VERIFY/deploy.log" || { echo DEPLOY_EXTRA_MODULES; exit 1; }
echo DEPLOY_COMMAND_PASS

# 7) Verify runtime/config and all 79 public assets after deploy.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-favicon-surgical');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
    with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('POST_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('POST_RUNTIME_SHAPE_BAD:'+repr([m.get('name') for m in mods]))
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('POST_RUNTIME_SHA_BAD:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('POST_BINDINGS_BAD:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('POST_COMPAT_BAD')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp: raise SystemExit('POST_ASSET_CONFIG_BAD')
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('POST_CRON_BAD')
root.joinpath('post-version.txt').write_text(vid)
print('POST_RUNTIME_CONFIG_OK',vid,sha)
PY

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
mkdir -p "$VERIFY/post"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  mkdir -p "$VERIFY/post/$(dirname "$rel")"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?favicon-post=$nonce-${RANDOM}" -o "$VERIFY/post/$rel"
  cmp -s "$AFTER/$rel" "$VERIFY/post/$rel" || { echo POST_PUBLIC_ASSET_MISMATCH:$rel; exit 1; }
done < "$ART/live-paths.txt"
echo POST_79_ASSETS_MATCH_EXPECTED_CANDIDATE

# Explicitly prove the other 78 files are still byte-identical to the successful Odds production base.
python3 - <<'PY'
from pathlib import Path
import hashlib
art=Path('/tmp/b46-current-artifact/after'); post=Path('/tmp/b46-favicon-surgical/verify/post')
paths=[x.strip() for x in Path('/tmp/b46-current-artifact/live-paths.txt').read_text().splitlines() if x.strip()]
bad=[]
for rel in paths:
    if rel=='index.html': continue
    if hashlib.sha256((art/rel).read_bytes()).digest()!=hashlib.sha256((post/rel).read_bytes()).digest(): bad.append(rel)
print('NON_INDEX_CHANGED_AFTER_DEPLOY=',bad)
if bad: raise SystemExit('NON_INDEX_ASSET_CHANGED:'+repr(bad))
PY

# Public domain must serve the new inline favicon, while Odds control still works.
curl -fsS -L --retry 4 --max-time 30 -H 'Cache-Control: no-cache' "$WWW/index.html?favicon-public=${GITHUB_RUN_ID}-${RANDOM}" -o "$VERIFY/www-index.html"
grep -Fq 'data-ball46-favicon="20260928"' "$VERIFY/www-index.html" || { echo WWW_FAVICON_TAG_MISSING; exit 1; }
grep -Fq 'data-workspace-odds-slot' "$VERIFY/www-index.html" || { echo WWW_ODDS_SLOT_MISSING; exit 1; }

chrome=$(command -v google-chrome || command -v chromium || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9226 --user-data-dir="$VERIFY/chrome" "$WWW/index.html?status=live&favicon=${GITHUB_RUN_ID}" >"$VERIFY/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9226/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep 1; done
sleep 7
node - <<'NODE'
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/pages.json')).find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');
const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,m=new Map();
ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id&&m.has(x.id)){const q=m.get(x.id);m.delete(x.id);x.error?q[1](Error(JSON.stringify(x.error))):q[0](x.result)}};
const call=(method,params={})=>new Promise((a,b)=>{const n=++id;m.set(n,[a,b]);ws.send(JSON.stringify({id:n,method,params}))});
(async()=>{await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});const ev=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;
const z=await ev(`(()=>{const f=document.querySelector('link[rel="icon"][data-ball46-favicon="20260928"]');const s=document.querySelector('[data-workspace-odds-slot]');const b=document.querySelector('[data-odds-format-button]');return {favicon:!!f,href:f?.getAttribute('href')||'',oddsDisplay:s?getComputedStyle(s).display:null,oddsH:s?.getBoundingClientRect().height||0,oddsBtn:b?.textContent||'',oddsApi:!!window.NOMAD343_ODDS}})()`);
console.log('BROWSER_VERIFY',z);if(!z.favicon||!z.href.startsWith('data:image/svg+xml,')||z.oddsDisplay==='none'||z.oddsH<12||!z.oddsBtn.includes('DEC')||!z.oddsApi)throw Error('BROWSER_VERIFY_FAILED');
for(const [f,l] of [['fractional','FRA'],['american','AM'],['decimal','DEC']]){const q=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('${f}');return document.querySelector('[data-odds-format-button]')?.textContent||''})()`);if(!q.includes(l))throw Error('ODDS_SWITCH_'+f)}
ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
kill "$CPID" 2>/dev/null || true; trap - EXIT

nonce="${GITHUB_RUN_ID:-manual}-health-post-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-post=$nonce" -o "$VERIFY/board-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-post=$nonce" -o "$VERIFY/signals-post.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-post=$nonce" -o "$VERIFY/stats-post.json"
node - <<'NODE'
const fs=require('fs');
const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/board-post.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/signals-post.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-surgical/verify/stats-post.json'));
if(b?.ok!==true||!Array.isArray(b.fixtures))throw Error('POST_BOARD_BAD');
if(!Array.isArray(s.signals))throw Error('POST_SIGNALS_BAD');
if(t?.ok!==true||!Array.isArray(t.rows))throw Error('POST_STATS_BAD');
console.log('POST_FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_FAVICON_SURGICAL_VERIFIED
