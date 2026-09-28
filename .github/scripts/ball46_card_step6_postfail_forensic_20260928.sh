#!/usr/bin/env bash
set -euo pipefail
ROOT=/tmp/b46-step6-forensic
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
EXPECTED_RUNTIME_SHA='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
EXPECTED_CSS_SHA='160bdbf2b4200de1a76bd5891e06038eed050f592e2efa9d88ff4a64607343bc'
OLD='dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width'
NEW='dashboard-v2-tune.css?v=343-card-step6-20260928a'
rm -rf "$ROOT"; mkdir -p "$ROOT"
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
r=pathlib.Path('/tmp/b46-step6-forensic');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as x:return json.load(x)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_SHAPE_BAD:'+repr([m.get('name') for m in mods]))
sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest()
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
sched=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=sched.get('schedules',[]) if isinstance(sched,dict) else (sched or []);crons=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
obj={'version':vid,'number':v.get('number'),'runtime_sha256':sha,'modules':[m.get('name') for m in mods],'bindings':got,'crons':crons}
r.joinpath('meta.json').write_text(json.dumps(obj,indent=2))
print('CURRENT_META',obj)
if sha!='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed': raise SystemExit('RUNTIME_SHA_BAD')
if got!=sorted(expect): raise SystemExit('BINDINGS_BAD')
if crons!=['* * * * *']: raise SystemExit('CRON_BAD')
PY
for host in direct www; do
  if [ "$host" = direct ]; then base="$DIRECT"; else base="$WWW"; fi
  for n in 1 2 3; do
    nonce="${GITHUB_RUN_ID:-manual}-${host}-${n}-$(date +%s%N)"
    curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache, no-store, max-age=0' -H 'Pragma: no-cache' "$base/index.html?step6forensic=$nonce" -o "$ROOT/${host}-index-$n.html"
    curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache, no-store, max-age=0' -H 'Pragma: no-cache' "$base/dashboard-v2-tune.css?step6forensic=$nonce" -o "$ROOT/${host}-css-$n.css"
  done
done
python3 - <<'PY'
from pathlib import Path
import hashlib,json,re
r=Path('/tmp/b46-step6-forensic');old='dashboard-v2-tune.css?v=343-dashboard-v2-ui-tune-v5-market-width';new='dashboard-v2-tune.css?v=343-card-step6-20260928a';exp='160bdbf2b4200de1a76bd5891e06038eed050f592e2efa9d88ff4a64607343bc'
out={}
for host in ('direct','www'):
  rows=[]
  for n in (1,2,3):
    idx=(r/f'{host}-index-{n}.html').read_text(errors='replace');css=(r/f'{host}-css-{n}.css').read_bytes();m=re.findall(r'dashboard-v2-tune\.css\?v=[^"\']+',idx)
    row={'n':n,'index_sha':hashlib.sha256(idx.encode()).hexdigest(),'css_sha':hashlib.sha256(css).hexdigest(),'refs':m,'has_old':old in idx,'has_new':new in idx,'css_step6_marker':b'BALL46 CARD REBUILD STEP6 MOCKUP MATCH 20260928' in css}
    rows.append(row);print(host,row)
  out[host]=rows
r.joinpath('results.json').write_text(json.dumps(out,indent=2))
if any(x['css_sha']!=exp or not x['css_step6_marker'] for xs in out.values() for x in xs): raise SystemExit('CSS_NOT_STEP6_EVERYWHERE')
if all(x['has_new'] for xs in out.values() for x in xs): print('INDEX_PROPAGATED_NEW_EVERYWHERE')
elif all(x['has_old'] for xs in out.values() for x in xs): print('INDEX_STILL_OLD_EVERYWHERE')
else: print('INDEX_MIXED_PROPAGATION')
PY
# Read-only live flow check while diagnosing.
nonce="${GITHUB_RUN_ID:-manual}-flow-$(date +%s%N)"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/board?step6forensic=$nonce" -o "$ROOT/board.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/signals?step6forensic=$nonce" -o "$ROOT/signals.json"
curl -fsS -L --retry 3 --max-time 30 "$WWW/api/engine/statistics?step6forensic=$nonce" -o "$ROOT/stats.json"
node - <<'NODE'
const fs=require('fs'),b=JSON.parse(fs.readFileSync('/tmp/b46-step6-forensic/board.json')),s=JSON.parse(fs.readFileSync('/tmp/b46-step6-forensic/signals.json')),t=JSON.parse(fs.readFileSync('/tmp/b46-step6-forensic/stats.json'));if(b?.ok!==true||!Array.isArray(b.fixtures)||!Array.isArray(s.signals)||t?.ok!==true||!Array.isArray(t.rows))throw Error('FLOW_BAD');console.log('FLOW_OK',{fixtures:b.fixtures.length,signals:s.signals.length,stats:t.rows.length});
NODE
echo BALL46_STEP6_POSTFAIL_FORENSIC_COMPLETE
