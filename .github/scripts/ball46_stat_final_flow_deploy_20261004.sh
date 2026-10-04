#!/usr/bin/env bash
set -euo pipefail

ENGINE_NAME='nomadtips3-engine-343'
ENGINE_URL='https://nomadtips3-engine-343.mccarey-supon.workers.dev'
BALL46_DIRECT='https://ball46-production.mccarey-supon.workers.dev'
PUBLIC_URL='https://www.ball46.com'
ROOT='/tmp/b46-stat-final-flow'
PATCHER='.github/scripts/ball46_stat_final_flow_patch_20261004.py'
DEPLOYED=0
PRE_ENGINE_VERSION=''

rm -rf "$ROOT"
mkdir -p "$ROOT/before" "$ROOT/worker" "$ROOT/after"

rollback(){
  code=$?
  if [ "$DEPLOYED" = 1 ] && [ -n "${PRE_ENGINE_VERSION:-}" ]; then
    echo "VERIFY_FAILED_ROLLBACK_TO=$PRE_ENGINE_VERSION"
    npx --yes wrangler@4.92.0 versions deploy "$PRE_ENGINE_VERSION@100%" --name "$ENGINE_NAME" -y --message "Auto rollback Ball46 final-flow ${GITHUB_RUN_ID:-manual}" || true
  fi
  exit "$code"
}
trap rollback ERR

# Lock the exact currently active Production Engine. Never deploy a branch copy over newer live work.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-stat-final-flow')
account=os.environ['CLOUDFLARE_ACCOUNT_ID']; token=os.environ['CLOUDFLARE_API_TOKEN']; worker='nomadtips3-engine-343'
h={'Authorization':f'Bearer {token}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{account}'
def getj(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r:j=json.load(r)
    if isinstance(j,dict) and j.get('success') is False: raise SystemExit('CF_API_FAIL:'+json.dumps(j)[:800])
    return j
deps=getj(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_ENGINE_DEPLOYMENT')
versions=deps[0].get('versions') or []
active=[str(v['version_id']) for v in versions if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if len(active)!=1: raise SystemExit('ACTIVE_VERSION_AMBIGUOUS:'+repr(active))
vid=active[0]; ver=getj(f'{api}/workers/workers/{worker}/versions/{vid}?include=modules')['result']
mods=ver.get('modules') or []
target=[m for m in mods if m.get('name')=='index-bulk-recovery.js' and m.get('content_base64')]
if len(mods)!=1 or len(target)!=1: raise SystemExit('LIVE_MODULE_SHAPE_CHANGED:'+repr([m.get('name') for m in mods]))
raw=base64.b64decode(target[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest(); text=raw.decode('utf-8')
for marker in ('signal-ledger-v2-longterm','STAT_LEDGER_PREFIX = "stat:v2:row:"','LONG_TERM_NO_APPLICATION_EXPIRY','statisticsLedgerResponse','reconcileExternalFinal'):
    if marker not in text: raise SystemExit('PRODUCTION_LEDGER_V2_MISSING:'+marker)
if ver.get('compatibility_date')!='2026-09-09' or (ver.get('compatibility_flags') or []): raise SystemExit('COMPAT_CONFIG_MOVED')
actual=sorted([{k:b.get(k) for k in ('name','type','service','environment','class_name','namespace_id') if b.get(k) is not None} for b in (ver.get('bindings') or [])],key=lambda x:x.get('name',''))
names={x.get('name'):x for x in actual}
if names.get('ENGINE',{}).get('class_name')!='Nomad343Engine' or names.get('ENGINE',{}).get('type')!='durable_object_namespace': raise SystemExit('ENGINE_BINDING_MOVED:'+json.dumps(actual))
if names.get('HUB',{}).get('service')!='nomadtips3-5usd-hub-343': raise SystemExit('HUB_BINDING_MOVED:'+json.dumps(actual))
if names.get('FULL_MARKET',{}).get('service')!='nomadtips3-full-market-343-ball46': raise SystemExit('FULL_MARKET_BINDING_MOVED:'+json.dumps(actual))
if names.get('FIVEDOLLAR_API_KEY',{}).get('type')!='secret_text': raise SystemExit('SECRET_BINDING_MISSING')
ledger_at=text.find('var STAT_LEDGER_PREFIX = "stat:v2:row:"')
if ledger_at<0: raise SystemExit('LEDGER_BOUNDARY_MISSING')
prefix_sha=hashlib.sha256(raw[:ledger_at]).hexdigest()
root.joinpath('before/live-index.js').write_bytes(raw)
root.joinpath('before/version.txt').write_text(vid)
root.joinpath('before/source-sha.txt').write_text(sha)
root.joinpath('before/referee-prefix-sha.txt').write_text(prefix_sha)
root.joinpath('before/meta.json').write_text(json.dumps({'version':vid,'sha256':sha,'prefixSha256':prefix_sha,'main_module':ver.get('main_module'),'bindings':actual},indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,sha)
print('REFEREE_CORE_PREFIX_SHA',prefix_sha)
PY
PRE_ENGINE_VERSION="$(cat "$ROOT/before/version.txt")"
PRE_SOURCE_SHA="$(cat "$ROOT/before/source-sha.txt")"
export PRE_ENGINE_VERSION PRE_SOURCE_SHA

# Capture current data contracts and front bytes before touching Production.
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
for ep in health registry settings board signals 'statistics?limit=5000' ledger-health bridge-health; do
  name="${ep//[?=&]/_}"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep&probe=$nonce" -o "$ROOT/before/$name.json" 2>/dev/null || \
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep?probe=$nonce" -o "$ROOT/before/$name.json"
done
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" -o "$ROOT/before/public-statistics.json"
REF_PRE_CODE=$(curl -sS -L --max-time 25 -o "$ROOT/before/referee.json" -w '%{http_code}' "$ENGINE_URL/referee?fixtureId=__flow_probe__&market=ft_ah&probe=$nonce" || true)
echo "$REF_PRE_CODE" > "$ROOT/before/referee-code.txt"
if [ -z "$REF_PRE_CODE" ] || [ "$REF_PRE_CODE" -ge 500 ]; then echo "REFEREE_PRE_UNHEALTHY:$REF_PRE_CODE"; exit 1; fi
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" -o "$ROOT/before/${p//\//_}"
done
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do echo "$(sha256sum "$ROOT/before/${p//\//_}"|awk '{print $1}') $p"; done > "$ROOT/before/frontend-sha.txt"

node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),b='/tmp/b46-stat-final-flow/before/';
const load=n=>JSON.parse(fs.readFileSync(b+n));
const h=load('health.json'),reg=load('registry.json'),set=load('settings.json'),board=load('board.json'),sig=load('signals.json'),st=load('statistics_limit_5000.json'),pub=load('public-statistics.json'),lh=load('ledger-health.json'),bh=load('bridge-health.json');
for(const [n,j] of Object.entries({health:h,registry:reg,settings:set,board,signals:sig,statistics:st,ledgerHealth:lh,bridgeHealth:bh}))if(j?.ok!==true)throw Error('PRE_'+n.toUpperCase()+'_NOT_OK');
if(st.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||st.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY')throw Error('PRE_NOT_LONGTERM_LEDGER_V2');
if(pub.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||Number(pub.ledgerTotal)!==Number(st.ledgerTotal))throw Error('PRE_PUBLIC_DIRECT_MISMATCH');
if(!Array.isArray(st.rows)||!Array.isArray(sig.signals)||!Array.isArray(board.fixtures))throw Error('PRE_SHAPE_BAD');
const ids=st.rows.map(x=>String(x?.id||''));if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('PRE_LEDGER_DUPLICATE_ID');
const boardIds=new Set(board.fixtures.map(x=>String(x?.fixtureId??x?.id??'')));
const pending=(sig.signals||[]).filter(x=>x?.status==='PENDING');
const missing=[...new Set(pending.filter(x=>!boardIds.has(String(x?.fixtureId))).map(x=>String(x.fixtureId)))];
const canonical=x=>JSON.stringify(x,Object.keys(x||{}).sort());
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
fs.writeFileSync(b+'contract.json',JSON.stringify({ledgerTotal:Number(st.ledgerTotal),settledTotal:Number(st.total),pending:Number(st.pending),unresolved:Number(st.unresolved||0),returned:st.rows.length,ids,missingPendingFixtures:missing,registryHash:hash(reg),settingsHash:hash(set),refereeCode:Number(fs.readFileSync(b+'referee-code.txt','utf8').trim())},null,2));
console.log('PRE_FLOW_STATE',{ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,returned:st.rows.length,missingPendingFixtures:missing.length,refereeHttp:Number(fs.readFileSync(b+'referee-code.txt','utf8').trim())});
NODE

# Patch only the V2 wrapper. The entire base Engine prefix (including referee) must remain byte-identical.
python3 "$PATCHER" "$ROOT/before/live-index.js" "$ROOT/worker/index-bulk-recovery.js"
node --check "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'missing-final-direct-v1' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'DIRECT_FINAL_FALLBACK' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'statisticsSource:"LEDGER_V2_ONLY"' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'signal-ledger-v2-longterm' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'STAT_LEDGER_PREFIX = "stat:v2:row:"' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'LONG_TERM_NO_APPLICATION_EXPIRY' "$ROOT/worker/index-bulk-recovery.js"
python3 - <<'PY'
from pathlib import Path
import hashlib
b=Path('/tmp/b46-stat-final-flow/before/live-index.js').read_bytes(); a=Path('/tmp/b46-stat-final-flow/worker/index-bulk-recovery.js').read_bytes(); marker=b'var STAT_LEDGER_PREFIX = "stat:v2:row:"'
ib=b.find(marker); ia=a.find(marker)
if ib<0 or ia<0: raise SystemExit('LEDGER_BOUNDARY_MISSING_POST_PATCH')
pre=hashlib.sha256(b[:ib]).hexdigest(); post=hashlib.sha256(a[:ia]).hexdigest(); expected=Path('/tmp/b46-stat-final-flow/before/referee-prefix-sha.txt').read_text().strip()
if pre!=expected or post!=expected: raise SystemExit(f'REFEREE_CORE_CHANGED:{pre}:{post}:{expected}')
text=a.decode()
route='if(u.pathname==="/statistics"&&request.method==="GET"){\n      await this.scanIfDue();await this.syncStatisticsLedger();return Response.json(await this.statisticsLedgerResponse(u.searchParams.get("limit")));\n    }'
if route not in text: raise SystemExit('LEDGER_ONLY_STATISTICS_ROUTE_MISSING')
print('REFEREE_CORE_UNTOUCHED_PASS',post)
print('LEDGER_ONLY_ROUTE_STATIC_PASS')
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

# Race guard: if another repair moved Production while this workflow was preparing, stop without deployment.
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN'];worker='nomadtips3-engine-343';api=f'https://api.cloudflare.com/client/v4/accounts/{account}';h={'Authorization':f'Bearer {token}','Accept':'application/json'}
def getj(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
deps=getj(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments'];active=[str(v['version_id']) for v in (deps[0].get('versions') or []) if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if active!=[os.environ['PRE_ENGINE_VERSION']]:raise SystemExit('PRODUCTION_MOVED_BEFORE_DEPLOY:'+repr(active))
ver=getj(f'{api}/workers/workers/{worker}/versions/{active[0]}?include=modules')['result'];mods=ver.get('modules') or [];target=[m for m in mods if m.get('name')=='index-bulk-recovery.js' and m.get('content_base64')]
if len(target)!=1:raise SystemExit('PRODUCTION_MODULE_MOVED_BEFORE_DEPLOY')
sha=hashlib.sha256(base64.b64decode(target[0]['content_base64'])).hexdigest()
if sha!=os.environ['PRE_SOURCE_SHA']:raise SystemExit('PRODUCTION_SOURCE_MOVED_BEFORE_DEPLOY:'+sha)
print('PREDEPLOY_RACE_GUARD_PASS',active[0],sha)
PY

npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.toml" | tee "$ROOT/after/deploy.txt"
DEPLOYED=1

# Execute one normal scan so the new fallback can process a bounded first batch immediately.
scan_code=$(curl -sS -L --retry 3 --retry-all-errors --max-time 45 -X POST -o "$ROOT/after/scan.json" -w '%{http_code}' "$ENGINE_URL/scan?flow=${GITHUB_RUN_ID:-manual}-$(date +%s%N)" || true)
if [ "$scan_code" -ge 500 ] || [ -z "$scan_code" ]; then echo "POST_SCAN_UNHEALTHY:$scan_code"; exit 1; fi
sleep 2

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
for ep in health registry settings board signals 'statistics?limit=5000' ledger-health bridge-health; do
  name="${ep//[?=&]/_}"
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep&probe=$nonce" -o "$ROOT/after/$name.json" 2>/dev/null || \
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep?probe=$nonce" -o "$ROOT/after/$name.json"
done
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$PUBLIC_URL/api/engine/statistics?limit=5000&probe=$nonce" -o "$ROOT/after/public-statistics.json"
REF_POST_CODE=$(curl -sS -L --max-time 25 -o "$ROOT/after/referee.json" -w '%{http_code}' "$ENGINE_URL/referee?fixtureId=__flow_probe__&market=ft_ah&probe=$nonce" || true)
echo "$REF_POST_CODE" > "$ROOT/after/referee-code.txt"
if [ -z "$REF_POST_CODE" ] || [ "$REF_POST_CODE" -ge 500 ]; then echo "REFEREE_POST_UNHEALTHY:$REF_POST_CODE"; exit 1; fi

node - <<'NODE'
const fs=require('fs'),crypto=require('crypto'),root='/tmp/b46-stat-final-flow/';
const load=(side,n)=>JSON.parse(fs.readFileSync(root+side+'/'+n));const c=load('before','contract.json');
const h=load('after','health.json'),reg=load('after','registry.json'),set=load('after','settings.json'),board=load('after','board.json'),sig=load('after','signals.json'),st=load('after','statistics_limit_5000.json'),pub=load('after','public-statistics.json'),lh=load('after','ledger-health.json'),bh=load('after','bridge-health.json');
for(const [n,j] of Object.entries({health:h,registry:reg,settings:set,board,signals:sig,statistics:st,ledgerHealth:lh,bridgeHealth:bh}))if(j?.ok!==true)throw Error('POST_'+n.toUpperCase()+'_NOT_OK');
if(st.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||st.statisticsSource!=='LEDGER_V2_ONLY'||st.finalReconcileVersion!=='missing-final-direct-v1'||st.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY')throw Error('POST_STATISTICS_CONTRACT_BAD');
if(bh.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||bh.statisticsSource!=='LEDGER_V2_ONLY'||bh.finalReconcileVersion!=='missing-final-direct-v1')throw Error('POST_BRIDGE_MARKER_BAD');
if(Number(st.ledgerTotal)<Number(c.ledgerTotal))throw Error(`LEDGER_TOTAL_REGRESSION:${st.ledgerTotal}<${c.ledgerTotal}`);
if(Number(st.total)<Number(c.settledTotal))throw Error(`SETTLED_TOTAL_REGRESSION:${st.total}<${c.settledTotal}`);
if(!Array.isArray(st.rows)||!Array.isArray(sig.signals))throw Error('POST_ROWS_BAD');
const ids=st.rows.map(x=>String(x?.id||''));if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error('POST_LEDGER_DUPLICATE_ID');
if(Number(c.ledgerTotal)<=5000&&Number(st.ledgerTotal)<=5000){const have=new Set(ids),missing=c.ids.filter(id=>!have.has(id));if(missing.length)throw Error('PRE_LEDGER_IDS_MISSING:'+missing.slice(0,10).join(','));}
for(const r of st.rows){const status=String(r?.status||'').toUpperCase();if(status==='PENDING'&&r?.result!=='LIVE')throw Error('PENDING_NOT_LIVE:'+r.id);if(status==='SETTLED'&&r?.result==='LIVE')throw Error('SETTLED_STILL_LIVE:'+r.id);}
if(pub.statisticsLedgerVersion!==st.statisticsLedgerVersion||pub.statisticsSource!==st.statisticsSource||Number(pub.ledgerTotal)!==Number(st.ledgerTotal)||Number(pub.total)!==Number(st.total))throw Error('PUBLIC_DIRECT_STATISTICS_MISMATCH');
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
if(hash(reg)!==c.registryHash)throw Error('REGISTRY_CHANGED');if(hash(set)!==c.settingsHash)throw Error('SETTINGS_CHANGED');
const refCode=Number(fs.readFileSync(root+'after/referee-code.txt','utf8').trim());if(refCode>=500)throw Error('REFEREE_ROUTE_5XX');
let scan={};try{scan=load('after','scan.json')}catch{}if(scan?.ok!==true)throw Error('POST_SCAN_NOT_OK');
console.log('FINAL_FLOW_VERIFY_PASS',{ledgerTotal:st.ledgerTotal,settled:st.total,pending:st.pending,unresolved:st.unresolved,returned:st.rows.length,refereeHttp:refCode,finalReconcileVersion:st.finalReconcileVersion,scanFinalReconcile:scan.finalReconcile||null});
NODE

# Frontend must remain byte-identical; this is an Engine-only repair.
nonce="${GITHUB_RUN_ID:-manual}-front-$(date +%s%N)"
while read -r sha p; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?probe=$nonce-$RANDOM" -o "$ROOT/after/${p//\//_}"
  [ "$(sha256sum "$ROOT/after/${p//\//_}"|awk '{print $1}')" = "$sha" ] || { echo "FRONTEND_CHANGED:$p"; exit 1; }
done < "$ROOT/before/frontend-sha.txt"
echo FRONTEND_UNTOUCHED_PASS

# Final active version: exactly one 100% deployment.
npx --yes wrangler@4.92.0 deployments status --name "$ENGINE_NAME" --json > "$ROOT/after/deployment.json"
node - <<'NODE'
const fs=require('fs'),j=JSON.parse(fs.readFileSync('/tmp/b46-stat-final-flow/after/deployment.json'));const hits=[];
function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return}const id=x.version_id??x.versionId,p=Number(x.percentage??x.percent??x.traffic_percent??x.traffic);if(id&&Number.isFinite(p)&&p>=99.999)hits.push(String(id));Object.values(x).forEach(walk)}walk(j);const ids=[...new Set(hits)];if(ids.length!==1)throw Error('POST_VERSION_AMBIGUOUS:'+JSON.stringify(ids));console.log('PRODUCTION_ENGINE_VERSION',ids[0]);
NODE

DEPLOYED=0
trap - ERR
echo BALL46_STAT_FINAL_FLOW_PRODUCTION_SUCCESS
