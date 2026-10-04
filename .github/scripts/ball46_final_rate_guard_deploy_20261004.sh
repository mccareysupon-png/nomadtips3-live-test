#!/usr/bin/env bash
set -euo pipefail
ENGINE_NAME='nomadtips3-engine-343'; ENGINE_URL='https://nomadtips3-engine-343.mccarey-supon.workers.dev'; BALL46_DIRECT='https://ball46-production.mccarey-supon.workers.dev'; PUBLIC_URL='https://www.ball46.com'; ROOT='/tmp/b46-final-rate-guard'; PATCHER='.github/scripts/ball46_final_rate_guard_patch_20261004.py'; DEPLOYED=0; PRE_ENGINE_VERSION=''
rm -rf "$ROOT"; mkdir -p "$ROOT/before" "$ROOT/worker" "$ROOT/after"
rollback(){ code=$?; if [ "$DEPLOYED" = 1 ] && [ -n "${PRE_ENGINE_VERSION:-}" ]; then echo "VERIFY_FAILED_ROLLBACK_TO=$PRE_ENGINE_VERSION"; npx --yes wrangler@4.92.0 versions deploy "$PRE_ENGINE_VERSION@100%" --name "$ENGINE_NAME" -y --message "Auto rollback Ball46 final rate guard ${GITHUB_RUN_ID:-manual}" || true; fi; exit "$code"; }; trap rollback ERR
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-final-rate-guard');account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN'];worker='nomadtips3-engine-343';api=f'https://api.cloudflare.com/client/v4/accounts/{account}';h={'Authorization':f'Bearer {token}','Accept':'application/json'}
def getj(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
 if isinstance(j,dict) and j.get('success') is False:raise SystemExit('CF_API_FAIL:'+json.dumps(j)[:600])
 return j
d=getj(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments'];a=[str(v['version_id']) for v in (d[0].get('versions') or []) if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if len(a)!=1:raise SystemExit('ACTIVE_VERSION_AMBIGUOUS:'+repr(a))
vid=a[0];ver=getj(f'{api}/workers/workers/{worker}/versions/{vid}?include=modules')['result'];mods=ver.get('modules') or [];m=[x for x in mods if x.get('name')=='index-bulk-recovery.js' and x.get('content_base64')]
if len(mods)!=1 or len(m)!=1:raise SystemExit('LIVE_MODULE_SHAPE_CHANGED')
raw=base64.b64decode(m[0]['content_base64']);text=raw.decode();sha=hashlib.sha256(raw).hexdigest()
for marker in ('signal-ledger-v2-longterm','chunked-working-store-v1','missing-final-direct-v1','LEDGER_V2_ONLY','DIRECT_FINAL_FALLBACK'):
 if marker not in text:raise SystemExit('CURRENT_FINAL_FLOW_MISSING:'+marker)
if ver.get('compatibility_date')!='2026-09-09' or (ver.get('compatibility_flags') or []):raise SystemExit('COMPAT_CONFIG_MOVED')
binds=sorted([{k:b.get(k) for k in ('name','type','service','environment','class_name','namespace_id') if b.get(k) is not None} for b in (ver.get('bindings') or [])],key=lambda x:x.get('name',''));names={x.get('name'):x for x in binds}
if names.get('ENGINE',{}).get('class_name')!='Nomad343Engine' or names.get('HUB',{}).get('service')!='nomadtips3-5usd-hub-343' or names.get('FULL_MARKET',{}).get('service')!='nomadtips3-full-market-343-ball46' or names.get('FIVEDOLLAR_API_KEY',{}).get('type')!='secret_text':raise SystemExit('BINDINGS_MOVED')
a1='if (u.pathname === "/referee" && request.method === "GET") {';a2='    if (u.pathname === "/fixture-odds" && request.method === "GET") {';i=text.find(a1);j=text.find(a2,i)
if i<0 or j<0:raise SystemExit('REFEREE_BLOCK_MISSING')
refsha=hashlib.sha256(text[i:j].encode()).hexdigest();root.joinpath('before/live-index.js').write_bytes(raw);root.joinpath('before/version.txt').write_text(vid);root.joinpath('before/source-sha.txt').write_text(sha);root.joinpath('before/referee-sha.txt').write_text(refsha);root.joinpath('before/meta.json').write_text(json.dumps({'version':vid,'sha':sha,'refereeSha':refsha,'bindings':binds},indent=2))
print('PRODUCTION_LOCK_OK',vid,sha);print('REFEREE_BLOCK_SHA',refsha)
PY
PRE_ENGINE_VERSION=$(cat "$ROOT/before/version.txt"); PRE_SOURCE_SHA=$(cat "$ROOT/before/source-sha.txt"); export PRE_ENGINE_VERSION PRE_SOURCE_SHA
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"; curlj(){ curl -fsS -L --retry 3 --retry-all-errors --max-time 35 "$1" -o "$2"; }
curlj "$ENGINE_URL/health?probe=$nonce" "$ROOT/before/health.json"; curlj "$ENGINE_URL/registry?probe=$nonce" "$ROOT/before/registry.json"; curlj "$ENGINE_URL/settings?probe=$nonce" "$ROOT/before/settings.json"; curlj "$ENGINE_URL/board?probe=$nonce" "$ROOT/before/board.json"; curlj "$ENGINE_URL/statistics?limit=5000&probe=$nonce" "$ROOT/before/statistics.json"; curlj "$ENGINE_URL/bridge-health?probe=$nonce" "$ROOT/before/bridge-health.json"; curlj "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" "$ROOT/before/public-statistics.json"
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do curlj "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" "$ROOT/before/${p//\//_}"; done; for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do echo "$(sha256sum "$ROOT/before/${p//\//_}"|awk '{print $1}') $p"; done > "$ROOT/before/frontend-sha.txt"
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),b='/tmp/b46-final-rate-guard/before/',j=n=>JSON.parse(fs.readFileSync(b+n)),h=j('health.json'),r=j('registry.json'),s=j('settings.json'),board=j('board.json'),st=j('statistics.json'),pub=j('public-statistics.json'),bh=j('bridge-health.json');for(const [n,x] of Object.entries({health:h,registry:r,settings:s,board,statistics:st,bridgeHealth:bh}))if(x?.ok!==true)throw Error('PRE_'+n+'_NOT_OK');if(st.statisticsSource!=='LEDGER_V2_ONLY'||st.workingStoreVersion!=='chunked-working-store-v1'||st.finalReconcileVersion!=='missing-final-direct-v1'||st.statisticsLedgerVersion!=='signal-ledger-v2-longterm')throw Error('PRE_FLOW_CONTRACT_BAD');if(Number(pub.ledgerTotal)!==Number(st.ledgerTotal)||Number(pub.total)!==Number(st.total))throw Error('PRE_PUBLIC_DIRECT_MISMATCH');const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');fs.writeFileSync(b+'contract.json',JSON.stringify({ledgerTotal:Number(st.ledgerTotal),settled:Number(st.total),registryHash:hash(r),settingsHash:hash(s)},null,2));console.log('PRE_RATE_STATE',{ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,hubVersion:board.hubVersion,referee:board.referee});
NODE
python3 "$PATCHER" "$ROOT/before/live-index.js" "$ROOT/worker/index-bulk-recovery.js"; node --check "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'rate-limit-backoff-v1' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'FINAL_RECHECK_MAX_PER_SCAN = 1' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'LEDGER_V2_ONLY' "$ROOT/worker/index-bulk-recovery.js"
python3 - <<'PY'
from pathlib import Path
import hashlib
pre=Path('/tmp/b46-final-rate-guard/before/live-index.js').read_text();post=Path('/tmp/b46-final-rate-guard/worker/index-bulk-recovery.js').read_text();a='if (u.pathname === "/referee" && request.method === "GET") {';b='    if (u.pathname === "/fixture-odds" && request.method === "GET") {'
def block(s):
 i=s.find(a);j=s.find(b,i)
 if i<0 or j<0:raise SystemExit('REFEREE_BLOCK_MISSING_POST')
 return s[i:j]
expected=Path('/tmp/b46-final-rate-guard/before/referee-sha.txt').read_text().strip();got=hashlib.sha256(block(post).encode()).hexdigest()
if got!=expected or block(pre)!=block(post):raise SystemExit('REFEREE_LOGIC_CHANGED')
print('REFEREE_LOGIC_UNTOUCHED_PASS',got)
PY
cat > "$ROOT/wrangler.toml" <<'TOML'
name = "nomadtips3-engine-343"
main = "worker/index-bulk-recovery.js"
compatibility_date = "2026-09-09"
workers_dev = true
[observability]
enabled = true
[triggers]
crons = ["* * * * *"]
[[services]]
binding = "HUB"
service = "nomadtips3-5usd-hub-343"
environment = "production"
[[services]]
binding = "FULL_MARKET"
service = "nomadtips3-full-market-343-ball46"
environment = "production"
[[durable_objects.bindings]]
name = "ENGINE"
class_name = "Nomad343Engine"
[[migrations]]
tag = "v1"
new_sqlite_classes = ["Nomad343Engine"]
TOML
npx --yes wrangler@4.92.0 deploy --dry-run --config "$ROOT/wrangler.toml"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN'];api=f'https://api.cloudflare.com/client/v4/accounts/{account}';worker='nomadtips3-engine-343';h={'Authorization':f'Bearer {token}'}
def j(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=j(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments'];a=[str(v['version_id']) for v in (d[0].get('versions') or []) if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if a!=[os.environ['PRE_ENGINE_VERSION']]:raise SystemExit('PRODUCTION_MOVED_BEFORE_DEPLOY:'+repr(a))
v=j(f'{api}/workers/workers/{worker}/versions/{a[0]}?include=modules')['result'];m=[x for x in (v.get('modules') or []) if x.get('name')=='index-bulk-recovery.js' and x.get('content_base64')];sha=hashlib.sha256(base64.b64decode(m[0]['content_base64'])).hexdigest() if len(m)==1 else ''
if sha!=os.environ['PRE_SOURCE_SHA']:raise SystemExit('PRODUCTION_SOURCE_MOVED_BEFORE_DEPLOY:'+sha)
print('PREDEPLOY_RACE_GUARD_PASS',a[0])
PY
npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.toml" | tee "$ROOT/after/deploy.txt"; DEPLOYED=1
scan_code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 80 -X POST -o "$ROOT/after/scan.json" -w '%{http_code}' "$ENGINE_URL/scan?rate=${GITHUB_RUN_ID:-manual}-$(date +%s%N)" || true); [ -n "$scan_code" ] && [ "$scan_code" -lt 500 ]; sleep 2
nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"; curlj "$ENGINE_URL/health?probe=$nonce" "$ROOT/after/health.json"; curlj "$ENGINE_URL/registry?probe=$nonce" "$ROOT/after/registry.json"; curlj "$ENGINE_URL/settings?probe=$nonce" "$ROOT/after/settings.json"; curlj "$ENGINE_URL/board?probe=$nonce" "$ROOT/after/board.json"; curlj "$ENGINE_URL/statistics?limit=5000&probe=$nonce" "$ROOT/after/statistics.json"; curlj "$ENGINE_URL/bridge-health?probe=$nonce" "$ROOT/after/bridge-health.json"; curlj "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" "$ROOT/after/public-statistics.json"
node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),r='/tmp/b46-final-rate-guard/',j=(d,n)=>JSON.parse(fs.readFileSync(r+d+'/'+n)),c=j('before','contract.json'),scan=j('after','scan.json'),h=j('after','health.json'),reg=j('after','registry.json'),set=j('after','settings.json'),board=j('after','board.json'),st=j('after','statistics.json'),pub=j('after','public-statistics.json'),bh=j('after','bridge-health.json');for(const [n,x] of Object.entries({scan,health:h,registry:reg,settings:set,board,statistics:st,bridgeHealth:bh}))if(x?.ok!==true)throw Error('POST_'+n+'_NOT_OK:'+JSON.stringify(x).slice(0,300));if(st.statisticsSource!=='LEDGER_V2_ONLY'||st.workingStoreVersion!=='chunked-working-store-v1'||st.finalReconcileVersion!=='missing-final-direct-v1'||st.finalRateGuardVersion!=='rate-limit-backoff-v1')throw Error('POST_RATE_CONTRACT_BAD');if(bh.finalRateGuardVersion!=='rate-limit-backoff-v1')throw Error('POST_BRIDGE_RATE_MARKER_BAD');if(Number(st.ledgerTotal)<c.ledgerTotal||Number(st.total)<c.settled)throw Error('STAT_REGRESSION');if(Number(pub.ledgerTotal)!==Number(st.ledgerTotal)||Number(pub.total)!==Number(st.total))throw Error('PUBLIC_DIRECT_MISMATCH');const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');if(hash(reg)!==c.registryHash||hash(set)!==c.settingsHash)throw Error('SETTINGS_OR_REGISTRY_CHANGED');if(board?.referee?.mode!=='BEST_OF_19_INPLAY'||!Array.isArray(board?.referee?.errors)||board.referee.errors.length)throw Error('REFEREE_FLOW_NOT_CLEAN:'+JSON.stringify(board.referee));const f=scan.finalReconcile||{};if(f.rateLimited&&!(Number(f.backoffUntil)>Date.now()))throw Error('RATE_BACKOFF_NOT_ACTIVE');console.log('RATE_GUARD_VERIFY_PASS',{health:h.ok,ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,referee:board.referee,finalReconcile:f});
NODE
nonce="${GITHUB_RUN_ID:-manual}-front-$(date +%s%N)"; while read -r sha p; do curlj "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" "$ROOT/after/${p//\//_}"; [ "$(sha256sum "$ROOT/after/${p//\//_}"|awk '{print $1}')" = "$sha" ] || { echo "FRONTEND_CHANGED:$p"; exit 1; }; done < "$ROOT/before/frontend-sha.txt"; echo FRONTEND_UNTOUCHED_PASS
npx --yes wrangler@4.92.0 deployments status --name "$ENGINE_NAME" --json > "$ROOT/after/deployment.json"; node - <<'NODE'
const fs=require('fs'),j=JSON.parse(fs.readFileSync('/tmp/b46-final-rate-guard/after/deployment.json')),a=[];function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}const id=x.version_id??x.versionId,p=Number(x.percentage??x.percent??x.traffic_percent??x.traffic);if(id&&Number.isFinite(p)&&p>=99.999)a.push(String(id));Object.values(x).forEach(w)}w(j);const ids=[...new Set(a)];if(ids.length!==1)throw Error('POST_VERSION_AMBIGUOUS:'+JSON.stringify(ids));console.log('PRODUCTION_ENGINE_VERSION',ids[0]);
NODE
DEPLOYED=0; trap - ERR; echo BALL46_FINAL_RATE_GUARD_PRODUCTION_SUCCESS
