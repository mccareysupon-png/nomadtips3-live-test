#!/usr/bin/env bash
set -euo pipefail

ENGINE_NAME='nomadtips3-engine-343'
ENGINE_URL='https://nomadtips3-engine-343.mccarey-supon.workers.dev'
BALL46_DIRECT='https://ball46-production.mccarey-supon.workers.dev'
PUBLIC_URL='https://www.ball46.com'
ROOT='/tmp/b46-stat-final-flow-v2'
PATCHER='.github/scripts/ball46_stat_final_flow_patch_20261004.py'
DEPLOYED=0
PRE_ENGINE_VERSION=''

rm -rf "$ROOT"; mkdir -p "$ROOT/before" "$ROOT/worker" "$ROOT/after"
rollback(){ code=$?; if [ "$DEPLOYED" = 1 ] && [ -n "${PRE_ENGINE_VERSION:-}" ]; then echo "VERIFY_FAILED_ROLLBACK_TO=$PRE_ENGINE_VERSION"; npx --yes wrangler@4.92.0 versions deploy "$PRE_ENGINE_VERSION@100%" --name "$ENGINE_NAME" -y --message "Auto rollback Ball46 final-flow-v2 ${GITHUB_RUN_ID:-manual}" || true; fi; exit "$code"; }
trap rollback ERR

# Exact-current-source lock. This keeps overnight repairs and rejects stale branch code.
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-stat-final-flow-v2');account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN'];worker='nomadtips3-engine-343';api=f'https://api.cloudflare.com/client/v4/accounts/{account}';h={'Authorization':f'Bearer {token}','Accept':'application/json'}
def getj(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:j=json.load(r)
  if isinstance(j,dict) and j.get('success') is False:raise SystemExit('CF_API_FAIL:'+json.dumps(j)[:600])
  return j
deps=getj(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments']; vs=deps[0].get('versions') or [];active=[str(v['version_id']) for v in vs if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if len(active)!=1:raise SystemExit('ACTIVE_VERSION_AMBIGUOUS:'+repr(active))
vid=active[0];ver=getj(f'{api}/workers/workers/{worker}/versions/{vid}?include=modules')['result'];mods=ver.get('modules') or [];target=[m for m in mods if m.get('name')=='index-bulk-recovery.js' and m.get('content_base64')]
if len(mods)!=1 or len(target)!=1:raise SystemExit('LIVE_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
raw=base64.b64decode(target[0]['content_base64']);text=raw.decode();sha=hashlib.sha256(raw).hexdigest()
for m in ('signal-ledger-v2-longterm','STAT_LEDGER_PREFIX = "stat:v2:row:"','LONG_TERM_NO_APPLICATION_EXPIRY','statisticsLedgerResponse','reconcileExternalFinal'):
  if m not in text:raise SystemExit('PRODUCTION_LEDGER_V2_MISSING:'+m)
if ver.get('compatibility_date')!='2026-09-09' or (ver.get('compatibility_flags') or []):raise SystemExit('COMPAT_CONFIG_MOVED')
actual=sorted([{k:b.get(k) for k in ('name','type','service','environment','class_name','namespace_id') if b.get(k) is not None} for b in (ver.get('bindings') or [])],key=lambda x:x.get('name',''));names={x.get('name'):x for x in actual}
if names.get('ENGINE',{}).get('class_name')!='Nomad343Engine' or names.get('ENGINE',{}).get('type')!='durable_object_namespace':raise SystemExit('ENGINE_BINDING_MOVED')
if names.get('HUB',{}).get('service')!='nomadtips3-5usd-hub-343' or names.get('FULL_MARKET',{}).get('service')!='nomadtips3-full-market-343-ball46':raise SystemExit('SERVICE_BINDING_MOVED')
if names.get('FIVEDOLLAR_API_KEY',{}).get('type')!='secret_text':raise SystemExit('SECRET_BINDING_MISSING')
a='if (u.pathname === "/referee" && request.method === "GET") {';b='    if (u.pathname === "/fixture-odds" && request.method === "GET") {';i=text.find(a);j=text.find(b,i)
if i<0 or j<0:raise SystemExit('REFEREE_BLOCK_MISSING')
refsha=hashlib.sha256(text[i:j].encode()).hexdigest();root.joinpath('before/live-index.js').write_bytes(raw);root.joinpath('before/version.txt').write_text(vid);root.joinpath('before/source-sha.txt').write_text(sha);root.joinpath('before/referee-block-sha.txt').write_text(refsha);root.joinpath('before/meta.json').write_text(json.dumps({'version':vid,'sha256':sha,'refereeBlockSha':refsha,'bindings':actual},indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,sha);print('REFEREE_BLOCK_SHA',refsha)
PY
PRE_ENGINE_VERSION=$(cat "$ROOT/before/version.txt"); PRE_SOURCE_SHA=$(cat "$ROOT/before/source-sha.txt"); export PRE_ENGINE_VERSION PRE_SOURCE_SHA

nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
curlj(){ local url="$1" out="$2"; curl -fsS -L --retry 4 --retry-all-errors --max-time 40 "$url" -o "$out"; }
curlj "$ENGINE_URL/health?probe=$nonce" "$ROOT/before/health.json"
curlj "$ENGINE_URL/registry?probe=$nonce" "$ROOT/before/registry.json"
curlj "$ENGINE_URL/settings?probe=$nonce" "$ROOT/before/settings.json"
curlj "$ENGINE_URL/board?probe=$nonce" "$ROOT/before/board.json"
curlj "$ENGINE_URL/signals?probe=$nonce" "$ROOT/before/signals.json"
curlj "$ENGINE_URL/statistics?limit=5000&probe=$nonce" "$ROOT/before/statistics.json"
curlj "$ENGINE_URL/ledger-health?probe=$nonce" "$ROOT/before/ledger-health.json"
curlj "$ENGINE_URL/bridge-health?probe=$nonce" "$ROOT/before/bridge-health.json"
curlj "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" "$ROOT/before/public-statistics.json"
REF_PRE_CODE=$(curl -sS -L --max-time 25 -o "$ROOT/before/referee.json" -w '%{http_code}' "$ENGINE_URL/referee?fixtureId=__flow_probe__&market=ft_ah&probe=$nonce" || true); echo "$REF_PRE_CODE" > "$ROOT/before/referee-code.txt"; [ -n "$REF_PRE_CODE" ] && [ "$REF_PRE_CODE" -lt 500 ]
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do curlj "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" "$ROOT/before/${p//\//_}"; done
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do echo "$(sha256sum "$ROOT/before/${p//\//_}"|awk '{print $1}') $p"; done > "$ROOT/before/frontend-sha.txt"

node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),b='/tmp/b46-stat-final-flow-v2/before/',load=n=>JSON.parse(fs.readFileSync(b+n));const h=load('health.json'),reg=load('registry.json'),set=load('settings.json'),board=load('board.json'),sig=load('signals.json'),st=load('statistics.json'),pub=load('public-statistics.json'),lh=load('ledger-health.json'),bh=load('bridge-health.json');
for(const [n,j] of Object.entries({registry:reg,settings:set,board,signals:sig,statistics:st,ledgerHealth:lh,bridgeHealth:bh}))if(j?.ok!==true)throw Error('PRE_'+n.toUpperCase()+'_NOT_OK');
if(h?.ok!==true&&!String(h?.lastError||'').includes('SQLITE_TOOBIG'))throw Error('PRE_HEALTH_UNEXPECTED:'+JSON.stringify(h));
if(st.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||st.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY'||pub.statisticsLedgerVersion!=='signal-ledger-v2-longterm')throw Error('PRE_LEDGER_CONTRACT_BAD');
if(!Array.isArray(st.rows)||!Array.isArray(sig.signals)||!Array.isArray(board.fixtures))throw Error('PRE_SHAPE_BAD');const ids=st.rows.map(x=>String(x?.id||''));if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('PRE_DUPLICATE_LEDGER_ID');
const boardIds=new Set(board.fixtures.map(x=>String(x?.fixtureId??x?.id??''))),missing=[...new Set(sig.signals.filter(x=>x?.status==='PENDING'&&!boardIds.has(String(x?.fixtureId))).map(x=>String(x.fixtureId)))],hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
fs.writeFileSync(b+'contract.json',JSON.stringify({ledgerTotal:Number(st.ledgerTotal),settledTotal:Number(st.total),pending:Number(st.pending),returned:st.rows.length,ids,missingPendingFixtures:missing,registryHash:hash(reg),settingsHash:hash(set),refereeCode:Number(fs.readFileSync(b+'referee-code.txt','utf8').trim()),preHealthOk:h?.ok===true,preHealthError:h?.lastError||null},null,2));
console.log('PRE_FLOW_STATE',{healthOk:h?.ok,lastError:h?.lastError||null,ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,missingPendingFixtures:missing.length,hubVersion:board.hubVersion,referee:board.referee||null});
NODE

python3 "$PATCHER" "$ROOT/before/live-index.js" "$ROOT/worker/index-bulk-recovery.js"; node --check "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'chunked-working-store-v1' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'missing-final-direct-v1' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'DIRECT_FINAL_FALLBACK' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'LEDGER_V2_ONLY' "$ROOT/worker/index-bulk-recovery.js"; grep -Fq 'signal-ledger-v2-longterm' "$ROOT/worker/index-bulk-recovery.js"
python3 - <<'PY'
from pathlib import Path
import hashlib
pre=Path('/tmp/b46-stat-final-flow-v2/before/live-index.js').read_text();post=Path('/tmp/b46-stat-final-flow-v2/worker/index-bulk-recovery.js').read_text();a='if (u.pathname === "/referee" && request.method === "GET") {';b='    if (u.pathname === "/fixture-odds" && request.method === "GET") {'
def block(s):
 i=s.find(a);j=s.find(b,i)
 if i<0 or j<0:raise SystemExit('REFEREE_BLOCK_MISSING_POST_PATCH')
 return s[i:j]
expected=Path('/tmp/b46-stat-final-flow-v2/before/referee-block-sha.txt').read_text().strip();got=hashlib.sha256(block(post).encode()).hexdigest()
if got!=expected or block(pre)!=block(post):raise SystemExit('REFEREE_LOGIC_CHANGED')
if 'this.ctx.storage.get("signals")' in post or 'this.ctx.storage.put("signals"' in post or 'this.ctx.storage.get("histories")' in post or 'this.ctx.storage.put("histories"' in post:raise SystemExit('LEGACY_SINGLE_VALUE_WORKING_STORE_REMAINS')
route='if (u.pathname === "/statistics" && request.method === "GET") {\n      await this.scanIfDue();\n      await this.syncStatisticsLedger();\n      return Response.json(await this.statisticsLedgerResponse(u.searchParams.get("limit")));\n    }'
if route not in post:raise SystemExit('LEDGER_ONLY_STATISTICS_ROUTE_MISSING')
print('REFEREE_LOGIC_UNTOUCHED_PASS',got);print('NO_LEGACY_SINGLE_VALUE_STORE_PASS');print('LEDGER_ONLY_STATISTICS_STATIC_PASS')
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
print('PREDEPLOY_RACE_GUARD_PASS',a[0],sha)
PY

npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.toml" | tee "$ROOT/after/deploy.txt"; DEPLOYED=1
scan_code=$(curl -sS -L --retry 2 --retry-all-errors --max-time 100 -X POST -o "$ROOT/after/scan.json" -w '%{http_code}' "$ENGINE_URL/scan?flow=${GITHUB_RUN_ID:-manual}-$(date +%s%N)" || true); [ -n "$scan_code" ] && [ "$scan_code" -lt 500 ]; sleep 3

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
curlj "$ENGINE_URL/health?probe=$nonce" "$ROOT/after/health.json"; curlj "$ENGINE_URL/registry?probe=$nonce" "$ROOT/after/registry.json"; curlj "$ENGINE_URL/settings?probe=$nonce" "$ROOT/after/settings.json"; curlj "$ENGINE_URL/board?probe=$nonce" "$ROOT/after/board.json"; curlj "$ENGINE_URL/signals?probe=$nonce" "$ROOT/after/signals.json"; curlj "$ENGINE_URL/statistics?limit=5000&probe=$nonce" "$ROOT/after/statistics.json"; curlj "$ENGINE_URL/ledger-health?probe=$nonce" "$ROOT/after/ledger-health.json"; curlj "$ENGINE_URL/bridge-health?probe=$nonce" "$ROOT/after/bridge-health.json"; curlj "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" "$ROOT/after/public-statistics.json"
REF_POST_CODE=$(curl -sS -L --max-time 25 -o "$ROOT/after/referee.json" -w '%{http_code}' "$ENGINE_URL/referee?fixtureId=__flow_probe__&market=ft_ah&probe=$nonce" || true); echo "$REF_POST_CODE" > "$ROOT/after/referee-code.txt"; [ -n "$REF_POST_CODE" ] && [ "$REF_POST_CODE" -lt 500 ]

node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),r='/tmp/b46-stat-final-flow-v2/',load=(side,n)=>JSON.parse(fs.readFileSync(r+side+'/'+n)),c=load('before','contract.json'),scan=load('after','scan.json'),h=load('after','health.json'),reg=load('after','registry.json'),set=load('after','settings.json'),board=load('after','board.json'),sig=load('after','signals.json'),st=load('after','statistics.json'),pub=load('after','public-statistics.json'),lh=load('after','ledger-health.json'),bh=load('after','bridge-health.json');
for(const [n,j] of Object.entries({scan,health:h,registry:reg,settings:set,board,signals:sig,statistics:st,ledgerHealth:lh,bridgeHealth:bh}))if(j?.ok!==true)throw Error('POST_'+n.toUpperCase()+'_NOT_OK:'+JSON.stringify(j).slice(0,300));
if(st.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||st.statisticsSource!=='LEDGER_V2_ONLY'||st.workingStoreVersion!=='chunked-working-store-v1'||st.finalReconcileVersion!=='missing-final-direct-v1'||st.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY')throw Error('POST_STATISTICS_CONTRACT_BAD');
if(bh.statisticsSource!=='LEDGER_V2_ONLY'||bh.workingStoreVersion!=='chunked-working-store-v1'||bh.finalReconcileVersion!=='missing-final-direct-v1')throw Error('POST_BRIDGE_CONTRACT_BAD');
if(Number(st.ledgerTotal)<c.ledgerTotal||Number(st.total)<c.settledTotal)throw Error('STAT_TOTAL_REGRESSION');const ids=st.rows.map(x=>String(x?.id||''));if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('POST_DUPLICATE_LEDGER_ID');if(c.ledgerTotal<=5000&&Number(st.ledgerTotal)<=5000){const have=new Set(ids),missing=c.ids.filter(x=>!have.has(x));if(missing.length)throw Error('PRE_LEDGER_IDS_MISSING:'+missing.slice(0,8).join(','));}
for(const x of st.rows){const q=String(x?.status||'').toUpperCase();if(q==='PENDING'&&x.result!=='LIVE')throw Error('PENDING_NOT_LIVE:'+x.id);if(q==='SETTLED'&&x.result==='LIVE')throw Error('SETTLED_STILL_LIVE:'+x.id)}
if(pub.statisticsSource!==st.statisticsSource||pub.statisticsLedgerVersion!==st.statisticsLedgerVersion||Number(pub.ledgerTotal)!==Number(st.ledgerTotal)||Number(pub.total)!==Number(st.total))throw Error('PUBLIC_DIRECT_MISMATCH');const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');if(hash(reg)!==c.registryHash)throw Error('REGISTRY_CHANGED');if(hash(set)!==c.settingsHash)throw Error('SETTINGS_CHANGED');if(board?.referee?.mode!=='BEST_OF_19_INPLAY'||!Array.isArray(board?.referee?.errors))throw Error('REFEREE_FLOW_SHAPE_CHANGED');const refCode=Number(fs.readFileSync(r+'after/referee-code.txt','utf8').trim());if(refCode>=500)throw Error('REFEREE_ROUTE_5XX');
console.log('FINAL_FLOW_VERIFY_PASS',{health:h.ok,ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,unresolved:st.unresolved,workingAllCount:sig.allCount,hubVersion:board.hubVersion,referee:board.referee,finalReconcile:scan.finalReconcile,workingStore:scan.workingStore});
NODE

nonce="${GITHUB_RUN_ID:-manual}-front-$(date +%s%N)"; while read -r sha p; do curlj "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" "$ROOT/after/${p//\//_}"; [ "$(sha256sum "$ROOT/after/${p//\//_}"|awk '{print $1}')" = "$sha" ] || { echo "FRONTEND_CHANGED:$p"; exit 1; }; done < "$ROOT/before/frontend-sha.txt"; echo FRONTEND_UNTOUCHED_PASS

npx --yes wrangler@4.92.0 deployments status --name "$ENGINE_NAME" --json > "$ROOT/after/deployment.json"
node - <<'NODE'
const fs=require('fs'),j=JSON.parse(fs.readFileSync('/tmp/b46-stat-final-flow-v2/after/deployment.json')),hits=[];function w(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(w);return}const id=x.version_id??x.versionId,p=Number(x.percentage??x.percent??x.traffic_percent??x.traffic);if(id&&Number.isFinite(p)&&p>=99.999)hits.push(String(id));Object.values(x).forEach(w)}w(j);const ids=[...new Set(hits)];if(ids.length!==1)throw Error('POST_VERSION_AMBIGUOUS:'+JSON.stringify(ids));console.log('PRODUCTION_ENGINE_VERSION',ids[0]);
NODE
DEPLOYED=0; trap - ERR; echo BALL46_STAT_FINAL_FLOW_V2_PRODUCTION_SUCCESS
