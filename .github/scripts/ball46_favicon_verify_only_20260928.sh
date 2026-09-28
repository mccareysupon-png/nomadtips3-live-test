#!/usr/bin/env bash
set -euo pipefail
ART="/tmp/b46-favicon-expected"
ROOT="/tmp/b46-favicon-verify-only"
DIRECT="https://ball46-production.mccarey-supon.workers.dev"
WWW="https://www.ball46.com"
EXPECTED_VERSION="a3a18050-6770-4a26-86c1-c5bf5bb857f2"
EXPECTED_RUNTIME_SHA="f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed"
rm -rf "$ROOT" && mkdir -p "$ROOT/direct" "$ROOT/www"

[ -f "$ART/after/index.html" ] || { echo EXPECTED_INDEX_MISSING; exit 1; }
[ -f "$ART/changed-assets.txt" ] || { echo EXPECTED_DIFF_RECORD_MISSING; exit 1; }
[ "$(cat "$ART/changed-assets.txt" | tr -d '\r')" = "index.html" ] || { echo EXPECTED_DIFF_NOT_ONE_FILE; exit 1; }
grep -Fq 'data-ball46-favicon="20260928"' "$ART/after/index.html" || { echo EXPECTED_FAVICON_MARKER_MISSING; exit 1; }

# Read-only lock: verification MUST NOT deploy or mutate anything.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-favicon-verify-only');a=os.environ['CLOUDFLARE_ACCOUNT_ID'];t=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {t}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{a}';script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100:raise SystemExit('VERIFY_MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];expected='a3a18050-6770-4a26-86c1-c5bf5bb857f2'
print('VERIFY_CURRENT_VERSION',vid)
if vid!=expected:raise SystemExit('VERIFY_VERSION_MOVED_NO_ACTION:'+vid)
v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'):raise SystemExit('VERIFY_RUNTIME_SHAPE_BAD')
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();print('VERIFY_RUNTIME_SHA',sha)
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed':raise SystemExit('VERIFY_RUNTIME_SHA_BAD')
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect):raise SystemExit('VERIFY_BINDINGS_BAD:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []):raise SystemExit('VERIFY_COMPAT_BAD')
ac=(v.get('assets') or {}).get('config') or {};exp={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exp}!=exp:raise SystemExit('VERIFY_ASSET_CONFIG_BAD')
s=get(f'{api}/workers/scripts/{script}/schedules')['result'];ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']:raise SystemExit('VERIFY_CRON_BAD')
print('VERIFY_RUNTIME_CONFIG_OK')
PY

# Allow CDN/asset propagation, but never redeploy. Require the exact candidate index bytes.
matched=0
for i in $(seq 1 15); do
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache, no-store' -H 'Pragma: no-cache' "$DIRECT/index.html?favicon-verify=${GITHUB_RUN_ID}-${i}-${RANDOM}" -o "$ROOT/direct/index-$i.html"
  got=$(sha256sum "$ROOT/direct/index-$i.html" | awk '{print $1}')
  exp=$(sha256sum "$ART/after/index.html" | awk '{print $1}')
  echo "DIRECT_INDEX_ATTEMPT=$i GOT=$got EXPECTED=$exp"
  if cmp -s "$ART/after/index.html" "$ROOT/direct/index-$i.html"; then cp "$ROOT/direct/index-$i.html" "$ROOT/direct/index.html"; matched=1; break; fi
  sleep 5
done
[ "$matched" = 1 ] || { echo DIRECT_INDEX_DID_NOT_PROPAGATE; exit 1; }
grep -Fq 'data-ball46-favicon="20260928"' "$ROOT/direct/index.html"
echo DIRECT_INDEX_FAVICON_OK

# Verify all 79 assets against the expected post-deploy candidate. No mutation occurs here.
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  out="$ROOT/direct/all/$rel"; mkdir -p "$(dirname "$out")"
  ok=0
  for n in 1 2 3; do
    curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache, no-store' "$DIRECT/$rel?favicon-all=${GITHUB_RUN_ID}-${n}-${RANDOM}" -o "$out"
    if cmp -s "$ART/after/$rel" "$out"; then ok=1; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] || { echo DIRECT_ASSET_MISMATCH:$rel; exit 1; }
done < "$ART/../b46-current-artifact/live-paths.txt" 2>/dev/null || true

# The artifact itself carries the source path list only if upload-artifact captured it outside expected folder.
PATHLIST="$ART/live-paths.txt"
if [ ! -f "$PATHLIST" ]; then
  # Reconstruct from the exact 79-file candidate tree; no repository inventory is used.
  (cd "$ART/after" && find . -type f -printf '%P\n' | sort) > "$ROOT/live-paths.txt"
  PATHLIST="$ROOT/live-paths.txt"
fi
[ "$(grep -cve '^$' "$PATHLIST" | tr -d ' ')" = 79 ] || { echo VERIFY_PATH_COUNT_BAD; exit 1; }
rm -rf "$ROOT/direct/all" && mkdir -p "$ROOT/direct/all"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  out="$ROOT/direct/all/$rel"; mkdir -p "$(dirname "$out")"
  ok=0
  for n in 1 2 3; do
    curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache, no-store' "$DIRECT/$rel?favicon-all=${GITHUB_RUN_ID}-${n}-${RANDOM}" -o "$out"
    if cmp -s "$ART/after/$rel" "$out"; then ok=1; break; fi
    sleep 2
  done
  [ "$ok" = 1 ] || { echo DIRECT_ASSET_MISMATCH:$rel; exit 1; }
done < "$PATHLIST"
echo DIRECT_ALL_79_MATCH_EXPECTED

# Prove the 78 non-index assets are unchanged from the pre-deploy snapshot captured in the deployment artifact.
[ -d "$ART/verify/live" ] || { echo PREDEPLOY_SNAPSHOT_MISSING; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib
art=Path('/tmp/b46-favicon-expected'); paths=[x.strip() for x in Path('/tmp/b46-favicon-verify-only/live-paths.txt').read_text().splitlines() if x.strip()] if Path('/tmp/b46-favicon-verify-only/live-paths.txt').exists() else sorted(str(p.relative_to(art/'after')) for p in (art/'after').rglob('*') if p.is_file())
bad=[]
for rel in paths:
  if rel=='index.html':continue
  a=art/'verify/live'/rel; b=art/'after'/rel
  if not a.exists() or hashlib.sha256(a.read_bytes()).digest()!=hashlib.sha256(b.read_bytes()).digest():bad.append(rel)
print('NON_INDEX_CHANGED_FROM_PREDEPLOY=',bad)
if bad:raise SystemExit('NON_INDEX_CHANGED:'+repr(bad))
PY
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$ART/after/odds-format-343.js"
echo NON_INDEX_78_UNCHANGED_AND_ODDS_PRESENT

# Verify the public custom domain and live browser behavior.
public_ok=0
for i in $(seq 1 10); do
  curl -fsS -L --retry 3 --max-time 30 -H 'Cache-Control: no-cache, no-store' "$WWW/index.html?favicon-www=${GITHUB_RUN_ID}-${i}-${RANDOM}" -o "$ROOT/www/index-$i.html"
  if grep -Fq 'data-ball46-favicon="20260928"' "$ROOT/www/index-$i.html"; then cp "$ROOT/www/index-$i.html" "$ROOT/www/index.html";public_ok=1;break;fi
  sleep 4
done
[ "$public_ok" = 1 ] || { echo WWW_FAVICON_NOT_PROPAGATED; exit 1; }
grep -Fq 'data-workspace-odds-slot' "$ROOT/www/index.html" || { echo WWW_ODDS_SLOT_MISSING; exit 1; }

chrome=$(command -v google-chrome || command -v chromium || true)
[ -n "$chrome" ] || { echo CHROME_NOT_FOUND; exit 1; }
"$chrome" --headless=new --no-sandbox --disable-gpu --remote-debugging-port=9227 --user-data-dir="$ROOT/chrome" "$WWW/index.html?status=live&favicon-verify=${GITHUB_RUN_ID}" >"$ROOT/chrome.log" 2>&1 & CPID=$!
trap 'kill $CPID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:9227/json > "$ROOT/pages.json" 2>/dev/null && break; sleep 1; done
sleep 7
node - <<'NODE'
const fs=require('fs');const p=JSON.parse(fs.readFileSync('/tmp/b46-favicon-verify-only/pages.json')).find(x=>x.type==='page');if(!p)throw Error('NO_PAGE');const ws=new WebSocket(p.webSocketDebuggerUrl);let id=0,m=new Map();ws.onmessage=e=>{const x=JSON.parse(e.data);if(x.id&&m.has(x.id)){const q=m.get(x.id);m.delete(x.id);x.error?q[1](Error(JSON.stringify(x.error))):q[0](x.result)}};const call=(method,params={})=>new Promise((a,b)=>{const n=++id;m.set(n,[a,b]);ws.send(JSON.stringify({id:n,method,params}))});(async()=>{await new Promise((a,b)=>{ws.onopen=a;ws.onerror=b});const ev=async e=>(await call('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result.value;const z=await ev(`(()=>{const f=document.querySelector('link[rel="icon"][data-ball46-favicon="20260928"]'),s=document.querySelector('[data-workspace-odds-slot]'),b=document.querySelector('[data-odds-format-button]');return {favicon:!!f,href:f?.getAttribute('href')||'',oddsDisplay:s?getComputedStyle(s).display:null,oddsH:s?.getBoundingClientRect().height||0,oddsBtn:b?.textContent||'',oddsApi:!!window.NOMAD343_ODDS}})()`);console.log('BROWSER_VERIFY',z);if(!z.favicon||!z.href.startsWith('data:image/svg+xml,')||z.oddsDisplay==='none'||z.oddsH<12||!z.oddsBtn.includes('DEC')||!z.oddsApi)throw Error('BROWSER_VERIFY_FAILED');for(const [f,l] of [['fractional','FRA'],['american','AM'],['decimal','DEC']]){const q=await ev(`(()=>{window.NOMAD343_ODDS.setFormat('${f}');return document.querySelector('[data-odds-format-button]')?.textContent||''})()`);if(!q.includes(l))throw Error('ODDS_SWITCH_'+f)}ws.close();process.exit(0)})().catch(e=>{console.error(e);process.exit(1)});
NODE
kill "$CPID" 2>/dev/null || true;trap - EXIT

nonce="${GITHUB_RUN_ID}-health-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?favicon-v=$nonce" -o "$ROOT/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?favicon-v=$nonce" -o "$ROOT/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?favicon-v=$nonce" -o "$ROOT/stats.json"
node - <<'NODE'
const fs=require('fs');const b=JSON.parse(fs.readFileSync('/tmp/b46-favicon-verify-only/board.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-favicon-verify-only/signals.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-favicon-verify-only/stats.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('FLOW_VERIFY_BAD');console.log('FLOW_VERIFY_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE

echo BALL46_FAVICON_VERIFY_ONLY_SUCCESS
