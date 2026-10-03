#!/usr/bin/env bash
set -euo pipefail

ENGINE_NAME='nomadtips3-engine-343'
ENGINE_URL='https://nomadtips3-engine-343.mccarey-supon.workers.dev'
BALL46_DIRECT='https://ball46-production.mccarey-supon.workers.dev'
PUBLIC_URL='https://www.ball46.com'
EXPECTED_LIVE_SHA='531e87cbefb93749bd028014efa77f5b1b506eeb107e6f34cdf814e7f56adaf8'
ROOT='/tmp/b46-stat-ledger-v2'
PATCHER='.github/scripts/ball46_stat_ledger_v2_patch_20261003.py'
DEPLOYED=0
PRE_ENGINE_VERSION=''

rm -rf "$ROOT"
mkdir -p "$ROOT/before" "$ROOT/worker" "$ROOT/after"

rollback(){
  code=$?
  if [ "$DEPLOYED" = 1 ] && [ -n "${PRE_ENGINE_VERSION:-}" ]; then
    echo "VERIFY_FAILED_ROLLBACK_TO=$PRE_ENGINE_VERSION"
    npx --yes wrangler@4.92.0 versions deploy "$PRE_ENGINE_VERSION@100%" --name "$ENGINE_NAME" -y --message "Auto rollback Ball46 statistics ledger v2 ${GITHUB_RUN_ID:-manual}" || true
  fi
  exit "$code"
}
trap rollback ERR

# 1) Lock exact current Production Engine and capture its actual deployed module.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-stat-ledger-v2')
account=os.environ['CLOUDFLARE_ACCOUNT_ID']; token=os.environ['CLOUDFLARE_API_TOKEN']; worker='nomadtips3-engine-343'
if not account or not token: raise SystemExit('MISSING_CLOUDFLARE_CREDENTIALS')
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
if len(mods)!=1 or mods[0].get('name')!='index-bulk-recovery.js' or not mods[0].get('content_base64'): raise SystemExit('LIVE_MODULE_SHAPE_CHANGED')
raw=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest()
expected='531e87cbefb93749bd028014efa77f5b1b506eeb107e6f34cdf814e7f56adaf8'
if sha!=expected: raise SystemExit(f'PRODUCTION_SOURCE_MOVED:{sha}!={expected}')
if ver.get('compatibility_date')!='2026-09-09' or (ver.get('compatibility_flags') or []): raise SystemExit('COMPAT_CONFIG_MOVED')
actual=sorted([{k:b.get(k) for k in ('name','type','service','environment','class_name','namespace_id') if b.get(k) is not None} for b in (ver.get('bindings') or [])],key=lambda x:x.get('name',''))
names={x.get('name'):x for x in actual}
if names.get('ENGINE',{}).get('class_name')!='Nomad343Engine' or names.get('ENGINE',{}).get('type')!='durable_object_namespace': raise SystemExit('ENGINE_BINDING_MOVED:'+json.dumps(actual))
if names.get('HUB',{}).get('service')!='nomadtips3-5usd-hub-343': raise SystemExit('HUB_BINDING_MOVED:'+json.dumps(actual))
if names.get('FULL_MARKET',{}).get('service')!='nomadtips3-full-market-343-ball46': raise SystemExit('FULL_MARKET_BINDING_MOVED:'+json.dumps(actual))
if names.get('FIVEDOLLAR_API_KEY',{}).get('type')!='secret_text': raise SystemExit('SECRET_BINDING_MISSING')
root.joinpath('before/live-index.js').write_bytes(raw)
root.joinpath('before/version.txt').write_text(vid)
root.joinpath('before/meta.json').write_text(json.dumps({'version':vid,'sha256':sha,'main_module':ver.get('main_module'),'bindings':actual},indent=2,sort_keys=True))
print('PRODUCTION_LOCK_OK',vid,sha)
PY
PRE_ENGINE_VERSION="$(cat "$ROOT/before/version.txt")"
export PRE_ENGINE_VERSION

# 2) Capture the complete current 1,600-record working set BEFORE cutover.
nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
for ep in health signals statistics; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep?ledger2=$nonce-$RANDOM" -o "$ROOT/before/$ep.json"
done
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?ledger2=$nonce-$RANDOM" -o "$ROOT/before/${p//\//_}"
done
node - <<'NODE'
const fs=require('fs'),root='/tmp/b46-stat-ledger-v2/before/';
const h=JSON.parse(fs.readFileSync(root+'health.json')),s=JSON.parse(fs.readFileSync(root+'signals.json')),t=JSON.parse(fs.readFileSync(root+'statistics.json'));
if(h?.ok!==true||s?.ok!==true||t?.ok!==true||!Array.isArray(s?.signals)||!Array.isArray(t?.rows))throw Error('PRE_API_UNHEALTHY');
const unresolved=Number(t?.unresolved||0);if(unresolved!==0)throw Error('PRE_UNRESOLVED_NOT_CAPTURED:'+unresolved);
const rows=[...t.rows,...s.signals],ids=new Set(rows.map(x=>String(x?.id||'')));
if(ids.has('')||ids.size!==rows.length)throw Error('PRE_DUPLICATE_OR_MISSING_IDS');
if(Number(s?.allCount)!==rows.length)throw Error(`PRE_WORKING_SET_ACCOUNTING:${s?.allCount}!=${rows.length}`);
fs.writeFileSync('/tmp/b46-stat-ledger-v2/before/import.json',JSON.stringify({rows}));
fs.writeFileSync('/tmp/b46-stat-ledger-v2/before/contract.json',JSON.stringify({settled:t.rows.length,pending:s.signals.length,workingTotal:rows.length,ids:[...ids],markets:[...new Set(rows.map(x=>String(x?.market||'')))].filter(Boolean)},null,2));
console.log('PRE_STATE',{settled:t.rows.length,pending:s.signals.length,workingTotal:rows.length,markets:[...new Set(rows.map(x=>x.market))].length});
NODE
for p in index.html signal.html statistics.html statistics-next.js ball46-logo.svg; do echo "$(sha256sum "$ROOT/before/${p//\//_}"|awk '{print $1}') $p"; done > "$ROOT/before/frontend-sha.txt"

# 3) Build only from the exact deployed Engine module, never an old branch source.
python3 "$PATCHER" "$ROOT/before/live-index.js" "$ROOT/worker/index-bulk-recovery.js"
node --check "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'signal-ledger-v2-longterm' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'LONG_TERM_NO_APPLICATION_EXPIRY' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'STAT_LEDGER_PREFIX = "stat:v2:row:"' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'result="LIVE"' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'const nonSettled = signals.filter' "$ROOT/worker/index-bulk-recovery.js"
if grep -Fq 'const capped = signals.slice(-MAX_SIGNALS);' "$ROOT/worker/index-bulk-recovery.js"; then echo OLD_DESTRUCTIVE_CAP_STILL_PRESENT; exit 1; fi
echo PATCH_STATIC_GUARDS_PASS

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

# 4) Dry-run, then deploy Engine only.
npx --yes wrangler@4.92.0 deploy --dry-run --config "$ROOT/wrangler.toml"
npx --yes wrangler@4.92.0 deploy --config "$ROOT/wrangler.toml" | tee "$ROOT/after/deploy.txt"
DEPLOYED=1

# 5) Seed the ledger with the exact pre-cutover working set, then sync current live state.
node - <<'NODE'
const fs=require('fs');
const body=fs.readFileSync('/tmp/b46-stat-ledger-v2/before/import.json');
const token=process.env.FIVEDOLLAR_API_KEY,base='https://nomadtips3-engine-343.mccarey-supon.workers.dev';
if(!token)throw Error('MISSING_SETTLEMENT_TOKEN');
(async()=>{
  const r=await fetch(base+'/ledger-import',{method:'POST',headers:{'content-type':'application/json','x-settlement-token':token},body});
  const text=await r.text();if(!r.ok)throw Error(`LEDGER_IMPORT_HTTP_${r.status}:${text.slice(0,400)}`);const j=JSON.parse(text);if(j?.ok!==true||j?.version!=='signal-ledger-v2-longterm')throw Error('LEDGER_IMPORT_BAD:'+text.slice(0,600));console.log('LEDGER_IMPORT',j);
  const s=await fetch(base+'/ledger-sync',{method:'POST',headers:{'content-type':'application/json','x-settlement-token':token},body:'{}'});const st=await s.text();if(!s.ok)throw Error(`LEDGER_SYNC_HTTP_${s.status}:${st.slice(0,400)}`);const sj=JSON.parse(st);if(sj?.ok!==true)throw Error('LEDGER_SYNC_BAD:'+st.slice(0,600));console.log('LEDGER_SYNC',sj);
})().catch(e=>{console.error(e);process.exit(1)});
NODE

# 6) Verify direct Engine + public Ball46 API contract and every captured ID.
nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/statistics?limit=5000&ledger2=$nonce" -o "$ROOT/after/statistics.json"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/signals?ledger2=$nonce" -o "$ROOT/after/signals.json"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/ledger-health?ledger2=$nonce" -o "$ROOT/after/ledger-health.json"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$PUBLIC_URL/api/engine/statistics?limit=5000&ledger2=$nonce" -o "$ROOT/after/public-statistics.json"
node - <<'NODE'
const fs=require('fs'),b='/tmp/b46-stat-ledger-v2/';
const c=JSON.parse(fs.readFileSync(b+'before/contract.json')),t=JSON.parse(fs.readFileSync(b+'after/statistics.json')),p=JSON.parse(fs.readFileSync(b+'after/public-statistics.json')),s=JSON.parse(fs.readFileSync(b+'after/signals.json')),h=JSON.parse(fs.readFileSync(b+'after/ledger-health.json'));
for(const [name,j] of Object.entries({direct:t,public:p,health:h}))if(j?.ok!==true)throw Error(name.toUpperCase()+'_NOT_OK');
if(t.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||p.statisticsLedgerVersion!=='signal-ledger-v2-longterm'||h.version!=='signal-ledger-v2-longterm')throw Error('LEDGER_VERSION_MISMATCH');
if(t.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY'||h.retention!=='LONG_TERM_NO_APPLICATION_EXPIRY')throw Error('RETENTION_CONTRACT_MISSING');
if(Number(t.ledgerTotal)<Number(c.workingTotal))throw Error(`LEDGER_TOTAL_REGRESSION:${t.ledgerTotal}<${c.workingTotal}`);
if(Number(t.total)<Number(c.settled))throw Error(`SETTLED_HISTORY_REGRESSION:${t.total}<${c.settled}`);
if(Number(t.ledgerTotal)!==Number(h.ledgerTotal)||Number(t.total)!==Number(h.settledTotal))throw Error('META_STATISTICS_MISMATCH');
const rows=Array.isArray(t.rows)?t.rows:[],ids=new Set(rows.map(x=>String(x?.id||'')));
const missing=c.ids.filter(id=>!ids.has(String(id)));if(missing.length)throw Error('PRE_CUTOVER_IDS_MISSING:'+missing.slice(0,12).join(','));
const markets=new Set(rows.map(x=>String(x?.market||'')));const missingMarkets=c.markets.filter(m=>!markets.has(m));if(missingMarkets.length)throw Error('MARKETS_MISSING:'+missingMarkets.join(','));
const live=rows.filter(x=>String(x?.status||'').toUpperCase()==='PENDING');
if(Number(c.pending)>0&&live.length===0)throw Error('LIVE_ROWS_MISSING');
for(const x of live.slice(0,100)){if(x.result!=='LIVE')throw Error('LIVE_RESULT_SHAPE_BAD');if(x.signalEntryMinute===undefined)throw Error('ENTRY_MINUTE_NOT_PRESERVED')}
const pending=Array.isArray(s?.signals)?s.signals:[];if(Number(c.pending)>0&&!pending.some(x=>x?.mirrorMinute!=null||x?.mirrorScore!=null))throw Error('LIVE_MIRROR_NOT_FLOWING_TO_SIGNALS');
if(Number(p.ledgerTotal)!==Number(t.ledgerTotal)||Number(p.total)!==Number(t.total))throw Error('PUBLIC_DIRECT_MISMATCH');
console.log('LEDGER_V2_VERIFY_PASS',{ledgerTotal:t.ledgerTotal,settled:t.total,pending:t.pending,returned:t.returned,markets:c.markets.length,liveRows:live.length});
NODE

# 7) Prove frontend/UI assets were untouched by this backend deployment.
nonce="${GITHUB_RUN_ID:-manual}-guard-$(date +%s%N)"
while read -r sha p; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?ledger2=$nonce-$RANDOM" -o "$ROOT/after/${p//\//_}"
  [ "$(sha256sum "$ROOT/after/${p//\//_}"|awk '{print $1}')" = "$sha" ] || { echo "FRONTEND_CHANGED:$p"; exit 1; }
done < "$ROOT/before/frontend-sha.txt"
echo FRONTEND_UNTOUCHED_PASS

# 8) Capture the final active Engine version and require one 100% deployment.
npx --yes wrangler@4.92.0 deployments status --name "$ENGINE_NAME" --json > "$ROOT/after/deployment.json"
node - <<'NODE'
const fs=require('fs'),j=JSON.parse(fs.readFileSync('/tmp/b46-stat-ledger-v2/after/deployment.json'));const hits=[];
function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return}const id=x.version_id??x.versionId,p=Number(x.percentage??x.percent??x.traffic_percent??x.traffic);if(id&&Number.isFinite(p)&&p>=99.999)hits.push(String(id));Object.values(x).forEach(walk)}walk(j);const ids=[...new Set(hits)];if(ids.length!==1)throw Error('POST_VERSION_AMBIGUOUS:'+JSON.stringify(ids));console.log('PRODUCTION_ENGINE_VERSION',ids[0]);
NODE

DEPLOYED=0
trap - ERR
echo BALL46_STAT_LEDGER_V2_PRODUCTION_SUCCESS
