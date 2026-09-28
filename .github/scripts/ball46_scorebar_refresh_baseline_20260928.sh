#!/usr/bin/env bash
set -euo pipefail
OUT=/tmp/b46-scorebar-refresh
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
rm -rf "$OUT" && mkdir -p "$OUT"
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
root=pathlib.Path('/tmp/b46-scorebar-refresh')
a=os.environ['CLOUDFLARE_ACCOUNT_ID']; t=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {t}','Accept':'application/json'}; api=f'https://api.cloudflare.com/client/v4/accounts/{a}'; script='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{script}/deployments')['result']['deployments'][0]; vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']; v=get(f'{api}/workers/workers/{script}/versions/{vid}?include=modules')['result']; mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING')
sha=hashlib.sha256(base64.b64decode(main[0]['content_base64'])).hexdigest()
exp='f961c641bb726f042f3d2e4a53e23363f68aa8497092f8071900b398cfb076ed'
if sha!=exp: raise SystemExit('RUNTIME_CHANGED:'+sha)
expect=[('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]
got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=sorted(expect): raise SystemExit('BINDINGS_CHANGED:'+repr(got))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_CHANGED')
ac=(v.get('assets') or {}).get('config') or {}; exac={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:ac.get(k) for k in exac}!=exac: raise SystemExit('ASSET_CONFIG_CHANGED:'+repr(ac))
s=get(f'{api}/workers/scripts/{script}/schedules')['result']; ss=s.get('schedules',[]) if isinstance(s,dict) else (s or [])
if [x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]!=['* * * * *']: raise SystemExit('CRON_CHANGED')
root.joinpath('production-lock.json').write_text(json.dumps({'version':vid,'runtime_sha256':sha,'bindings':got,'assets_config':ac,'cron':'* * * * *'},indent=2))
print('REFRESH_PRODUCTION_LOCK_OK',vid,sha)
PY
nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
for rel in index.html dashboard-v2-stage3.js dashboard-v2-tune.css singlepage-workspace-343.js singlepage-workspace-343.css odds-format-343.js; do
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$DIRECT/$rel?$nonce-$RANDOM" -o "$OUT/$rel"
  sha256sum "$OUT/$rel" >> "$OUT/key-assets.sha256"
done
grep -Fq 'BALL46_SCOREBAR_6X4_20260928' "$OUT/dashboard-v2-stage3.js" || { echo SCOREBAR_6X4_MARKER_MISSING; exit 1; }
grep -Fq 'B46_ODDS_VISIBILITY_20260928' "$OUT/odds-format-343.js" || { echo ODDS_MARKER_MISSING; exit 1; }
grep -Fq '343-card-step6-20260928a' "$OUT/index.html" || { echo STEP6_INDEX_CACHEBUSTER_MISSING; exit 1; }
grep -Fq 'BALL46_CARD_STEP6_20260928' "$OUT/dashboard-v2-tune.css" || { echo STEP6_CSS_MARKER_MISSING; exit 1; }
echo REFRESH_KEY_MARKERS_OK
for ep in board signals statistics; do curl -fsS -L --retry 3 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?baseline=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-refresh')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('FLOW_BAD:'+n)
print('REFRESH_FLOW_OK',len(json.load(open(r/'board.json')).get('fixtures') or []),len(json.load(open(r/'signals.json')).get('signals') or []),len(json.load(open(r/'statistics.json')).get('statistics') or []))
PY
node - <<'NODE'
const fs=require('fs');
const {execSync}=require('child_process');
try{require.resolve('playwright')}catch(e){execSync('npm -s install --no-save playwright@1.55.0',{stdio:'inherit'})}
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch({headless:true});const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto('https://www.ball46.com/?baseline_refresh='+Date.now(),{waitUntil:'networkidle',timeout:60000});await p.waitForTimeout(2500);const x=await p.evaluate(()=>{const cards=[...document.querySelectorAll('[data-ball46-workspace-scorebar] .scorebar-mini,[data-ball46-workspace-scorebar] [data-scorebar-fixture-id]')];const root=document.querySelector('[data-ball46-workspace-scorebar]');return {count:root?root.children.length:cards.length,text:root?root.innerText:'',odds:!!window.NOMAD343_ODDS,favicon:!!document.querySelector('link[data-ball46-favicon="20260928"]'),step6:[...document.styleSheets].some(s=>(s.href||'').includes('343-card-step6-20260928a'))};});console.log('REFRESH_BROWSER',x);if(x.count!==10)throw new Error('SCOREBAR_COUNT_'+x.count);if(!x.odds||!x.favicon||!x.step6)throw new Error('REGRESSION_MARKER');fs.writeFileSync('/tmp/b46-scorebar-refresh/browser.json',JSON.stringify(x,null,2));await b.close();console.log('REFRESH_BASELINE_SUCCESS_NO_DEPLOY');})().catch(e=>{console.error(e);process.exit(1)});
NODE
