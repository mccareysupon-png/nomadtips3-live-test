#!/usr/bin/env bash
set -euo pipefail

ENGINE_NAME="nomadtips3-engine-343"
ENGINE_URL="https://nomadtips3-engine-343.mccarey-supon.workers.dev"
BALL46_DIRECT="https://ball46-production.mccarey-supon.workers.dev"
PUBLIC_URL="https://www.ball46.com"
SNAPSHOT_MODULE=".audit/ball46-stat-ledger-20261003/live-modules/index-bulk-recovery.js"
SNAPSHOT_SHA256="531e87cbefb93749bd028014efa77f5b1b506eeb107e6f34cdf814e7f56adaf8"
ROOT="/tmp/b46-ledger"
DEPLOYED=0
PRE_ENGINE_VERSION=""

: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID}"
: "${FIVEDOLLAR_API_KEY:?missing FIVEDOLLAR_API_KEY}"

test -s "$SNAPSHOT_MODULE"
[ "$(sha256sum "$SNAPSHOT_MODULE" | awk '{print $1}')" = "$SNAPSHOT_SHA256" ] || { echo SNAPSHOT_SHA_MISMATCH; exit 1; }
rm -rf "$ROOT"
mkdir -p "$ROOT"/{before,worker,after}

# Capture and lock the exact live Engine source/config. Stop if another backend change moved it.
python3 - <<'PY'
import base64, hashlib, json, os, pathlib, urllib.request
root=pathlib.Path('/tmp/b46-ledger')
account=os.environ['CLOUDFLARE_ACCOUNT_ID']; token=os.environ['CLOUDFLARE_API_TOKEN']; worker='nomadtips3-engine-343'
h={'Authorization':f'Bearer {token}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{account}'
def getj(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=30) as r: j=json.load(r)
    if isinstance(j,dict) and j.get('success') is False: raise SystemExit('CF_API_FAIL:'+json.dumps(j)[:800])
    return j
deps=getj(f'{api}/workers/scripts/{worker}/deployments')['result']['deployments']
if not deps: raise SystemExit('NO_CURRENT_ENGINE_DEPLOYMENT')
vs=deps[0].get('versions') or []
active=[str(v['version_id']) for v in vs if v.get('version_id') and float(v.get('percentage',0))>=99.999]
if len(active)!=1: raise SystemExit('ACTIVE_VERSION_AMBIGUOUS:'+repr(active))
vid=active[0]; ver=getj(f'{api}/workers/workers/{worker}/versions/{vid}?include=modules')['result']
mods=ver.get('modules') or []
if len(mods)!=1 or not mods[0].get('content_base64'): raise SystemExit('LIVE_MODULE_SHAPE_CHANGED')
raw=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest()
expected='531e87cbefb93749bd028014efa77f5b1b506eeb107e6f34cdf814e7f56adaf8'
if sha!=expected: raise SystemExit(f'PRODUCTION_SOURCE_MOVED:{sha}!={expected}')
if ver.get('main_module')!='index-bulk-recovery.js': raise SystemExit('MAIN_MODULE_MOVED:'+repr(ver.get('main_module')))
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

nonce="${GITHUB_RUN_ID:-manual}-pre-$(date +%s%N)"
for p in index.html signal.html statistics.html ball46-logo.svg; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?ledger=$nonce-$RANDOM" -o "$ROOT/before/${p//\//_}"
done
for ep in health signals statistics; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$ENGINE_URL/$ep?ledger=$nonce-$RANDOM" -o "$ROOT/before/$ep.json"
done
node - <<'NODE'
const fs=require('fs');
const h=JSON.parse(fs.readFileSync('/tmp/b46-ledger/before/health.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-ledger/before/signals.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-ledger/before/statistics.json'));
if(h?.ok!==true||s?.ok!==true||t?.ok!==true||!Array.isArray(s?.signals)||!Array.isArray(t?.rows))throw Error('PRE_API_UNHEALTHY');
const unresolved=Number(t?.unresolved||0);
if(Number(s?.allCount)!==Number(t.rows.length+s.signals.length+unresolved))throw Error('PRE_WORKING_SET_ACCOUNTING_MOVED');
fs.writeFileSync('/tmp/b46-ledger/before/counts.json',JSON.stringify({settled:t.rows.length,pending:s.signals.length,unresolved,workingTotal:s.allCount},null,2));
console.log('PRE_STATE',{settled:t.rows.length,pending:s.signals.length,unresolved,workingTotal:s.allCount,version:h.version});
NODE

# Build from the exact captured live module, not from an old source branch.
python3 .github/scripts/ball46_stat_ledger_patch_20261003.py "$SNAPSHOT_MODULE" "$ROOT/worker/index-bulk-recovery.js"
# First post-deploy scan must persist the pre-existing 1600 working set before the legacy cap can evict anything.
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-ledger/worker/index-bulk-recovery.js'); s=p.read_text()
old='''  async scan() {\n    const meta = await super.scan();\n    if (meta?.ok) {\n      const ledger = await this.syncStatisticsLedger();\n      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, ledgerWrites: ledger.writes };\n    }\n    return meta;\n  }'''
new='''  async scan() {\n    const beforeLedger = await this.syncStatisticsLedger();\n    const meta = await super.scan();\n    if (meta?.ok) {\n      const afterLedger = await this.syncStatisticsLedger();\n      return { ...meta, statisticsLedgerVersion: STAT_LEDGER_VERSION, ledgerWrites: beforeLedger.writes + afterLedger.writes };\n    }\n    return meta;\n  }'''
if s.count(old)!=1: raise SystemExit('SCAN_OVERRIDE_ANCHOR_COUNT:'+str(s.count(old)))
s=s.replace(old,new,1); p.write_text(s)
PY
node --check "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'var STAT_LEDGER_VERSION = "signal-ledger-v1";' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'const beforeLedger = await this.syncStatisticsLedger();' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'STAT_LEDGER_PREFIX + String(sig.id)' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'currentMinute' "$ROOT/worker/index-bulk-recovery.js"
grep -Fq 'currentScore' "$ROOT/worker/index-bulk-recovery.js"
echo PATCH_STATIC_GUARDS_PASS

cat > "$ROOT/worker/wrangler.toml" <<'TOML'
name = "nomadtips3-engine-343"
main = "index-bulk-recovery.js"
compatibility_date = "2026-09-09"
workers_dev = true

[observability]
enabled = true

[triggers]
crons = ["* * * * *"]

[[services]]
binding = "HUB"
service = "nomadtips3-5usd-hub-343"

[[services]]
binding = "FULL_MARKET"
service = "nomadtips3-full-market-343-ball46"

[[durable_objects.bindings]]
name = "ENGINE"
class_name = "Nomad343Engine"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Nomad343Engine"]
TOML

rollback() {
  code=$?
  if [ "$DEPLOYED" = 1 ] && [ -n "$PRE_ENGINE_VERSION" ]; then
    echo "VERIFY_FAILED_ROLLBACK_TO=$PRE_ENGINE_VERSION"
    npx --yes wrangler@4.92.0 versions deploy "$PRE_ENGINE_VERSION@100%" --name "$ENGINE_NAME" -y --message "Auto rollback Ball46 statistics ledger ${GITHUB_RUN_ID:-manual}" || true
  fi
  exit "$code"
}
trap rollback ERR

(cd "$ROOT/worker" && npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.toml)
(cd "$ROOT/worker" && npx --yes wrangler@4.92.0 deploy --config wrangler.toml)
DEPLOYED=1

# Explicitly migrate every still-accessible signal immediately. No fabricated backfill.
for n in 1 2 3 4 5; do
  code=$(curl -sS -L --max-time 45 -o "$ROOT/after/ledger-sync.json" -w '%{http_code}' -X POST -H "x-settlement-token: $FIVEDOLLAR_API_KEY" "$ENGINE_URL/ledger-sync") || code=000
  [ "$code" = 200 ] && break
  sleep 3
done
[ "$code" = 200 ] || { echo LEDGER_SYNC_FAILED_HTTP_$code; cat "$ROOT/after/ledger-sync.json" 2>/dev/null || true; false; }

nonce="${GITHUB_RUN_ID:-manual}-post-$(date +%s%N)"
for ep in health signals statistics ledger-health bridge-health; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 45 "$ENGINE_URL/$ep?ledger=$nonce-$RANDOM" -o "$ROOT/after/$ep.json"
done
curl -fsS -L --retry 4 --retry-all-errors --max-time 45 "$PUBLIC_URL/api/engine/statistics?ledger=$nonce" -o "$ROOT/after/public-statistics.json"
node - <<'NODE'
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/b46-ledger/before/counts.json'));
const sync=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/ledger-sync.json'));
const h=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/health.json'));
const s=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/signals.json'));
const t=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/statistics.json'));
const lh=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/ledger-health.json'));
const b=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/bridge-health.json'));
const pub=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/public-statistics.json'));
if(h?.ok!==true||s?.ok!==true||t?.ok!==true||lh?.ok!==true||b?.ok!==true||pub?.ok!==true)throw Error('POST_CORE_API_BAD');
if(t?.statisticsLedgerVersion!=='signal-ledger-v1'||lh?.version!=='signal-ledger-v1'||b?.statisticsLedgerVersion!=='signal-ledger-v1')throw Error('LEDGER_MARKER_MISSING');
if(!Array.isArray(t.rows)||!Array.isArray(t.liveRows))throw Error('LEDGER_STATS_SHAPE_BAD');
if(Number(t.total)!==t.rows.length)throw Error('TOTAL_ROW_MISMATCH');
if(Number(t.total)<Number(c.settled))throw Error(`SETTLED_REGRESSION:${t.total}<${c.settled}`);
if(Number(t.ledgerTotal)<Number(c.workingTotal))throw Error(`MIGRATION_INCOMPLETE:${t.ledgerTotal}<${c.workingTotal}`);
if(Number(pub.total)!==Number(t.total)||Number(pub.ledgerTotal)!==Number(t.ledgerTotal))throw Error('PUBLIC_DIRECT_STATS_MISMATCH');
const bad=t.liveRows.filter(x=>x.entryScore===undefined||x.entryMinute===undefined||x.currentScore===undefined||x.currentMinute===undefined);
if(bad.length)throw Error('LIVE_LEDGER_FIELDS_MISSING:'+bad.slice(0,3).map(x=>x.id).join(','));
console.log('LEDGER_VERIFY_PASS',{preSettled:c.settled,postSettled:t.total,ledgerTotal:t.ledgerTotal,pending:t.pending,syncWrites:sync.writes});
NODE

# Engine-only change: web assets must remain byte-identical.
for p in index.html signal.html statistics.html ball46-logo.svg; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$BALL46_DIRECT/$p?ledger=$nonce-$RANDOM" -o "$ROOT/after/${p//\//_}"
  before=$(sha256sum "$ROOT/before/${p//\//_}" | awk '{print $1}')
  after=$(sha256sum "$ROOT/after/${p//\//_}" | awk '{print $1}')
  [ "$before" = "$after" ] || { echo FRONTEND_CHANGED_$p; false; }
done
echo FRONTEND_UNTOUCHED_PASS

# Cross at least one scheduled scan and prove cumulative counts never moved backwards.
sleep 65
nonce="${GITHUB_RUN_ID:-manual}-stability-$(date +%s%N)"
curl -fsS -L --retry 4 --retry-all-errors --max-time 45 "$ENGINE_URL/statistics?ledger=$nonce" -o "$ROOT/after/statistics-stability.json"
node - <<'NODE'
const fs=require('fs');
const a=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/statistics.json'));
const b=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/statistics-stability.json'));
if(b?.ok!==true||b?.statisticsLedgerVersion!=='signal-ledger-v1')throw Error('STABILITY_API_BAD');
if(Number(b.total)<Number(a.total))throw Error(`TOTAL_DECREASED_AFTER_SCAN:${a.total}->${b.total}`);
if(Number(b.ledgerTotal)<Number(a.ledgerTotal))throw Error(`LEDGER_DECREASED:${a.ledgerTotal}->${b.ledgerTotal}`);
console.log('STABILITY_PASS',{firstTotal:a.total,laterTotal:b.total,firstLedger:a.ledgerTotal,laterLedger:b.ledgerTotal});
NODE

npx --yes wrangler@4.92.0 deployments status --name "$ENGINE_NAME" --json > "$ROOT/after/deployment.json"
node - <<'NODE'
const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/b46-ledger/after/deployment.json'));
const hits=[];function walk(x){if(!x||typeof x!=='object')return;if(Array.isArray(x)){x.forEach(walk);return}const id=x.version_id??x.versionId,p=Number(x.percentage??x.percent??x.traffic_percent??x.traffic);if(id&&Number.isFinite(p)&&p>=99.999)hits.push(String(id));Object.values(x).forEach(walk)}walk(j);const ids=[...new Set(hits)];if(ids.length!==1)throw Error('POST_VERSION_AMBIGUOUS:'+JSON.stringify(ids));fs.writeFileSync('/tmp/b46-ledger/after/final-version.txt',ids[0]);console.log('PRODUCTION_ENGINE_VERSION',ids[0]);
NODE

trap - ERR
printf 'BALL46_STAT_LEDGER_DEPLOY_SUCCESS\n'
cat "$ROOT/after/final-version.txt"
