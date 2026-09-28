#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
OLD='/tmp/b46-v5'
ROOT='/tmp/b46-scorebar-rebase'; CUR="$ROOT/current"; OUT="$ROOT/out"
rm -rf "$ROOT"; mkdir -p "$CUR" "$OUT"
[ -s "$OLD/paths.txt" ] || { echo OLD_PATHS_MISSING; exit 1; }
cp "$OLD/paths.txt" "$ROOT/paths.txt"
python3 - <<'PY'
import base64,hashlib,json,os,pathlib,urllib.request
R=pathlib.Path('/tmp/b46-scorebar-rebase');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js' or not mods[0].get('content_base64'): raise SystemExit('MODULE_BAD')
runtime=base64.b64decode(mods[0]['content_base64']);sha=hashlib.sha256(runtime).hexdigest()
expect=sorted([('ASSETS','assets',None,None),('ENGINE','service','nomadtips3-engine-343','production'),('FULL_MARKET','service','nomadtips3-full-market-343-ball46','production'),('HUB','service','nomadtips3-5usd-hub-343','production')]);got=sorted((b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or []))
if got!=expect: raise SystemExit('BINDINGS_BAD:'+repr(got))
ss=get(f'{api}/workers/scripts/{s}/schedules')['result'];ss=ss.get('schedules',[]) if isinstance(ss,dict) else (ss or []);cr=[x.get('cron') for x in ss if isinstance(x,dict) and x.get('cron')]
if cr!=['* * * * *']: raise SystemExit('CRON_BAD:'+repr(cr))
(R/'version.txt').write_text(vid);(R/'runtime-sha.txt').write_text(sha);(R/'runtime.js').write_bytes(runtime)
print('LATEST_PRODUCTION_LOCK',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
while IFS= read -r rel; do
  [ -n "$rel" ] || continue; mkdir -p "$CUR/$(dirname "$rel")"
  code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$CUR/$rel" -w '%{http_code}' "$DIRECT/$rel?rebase=$nonce-$RANDOM") || true
  [ "$code" = 200 ] || { echo "FETCH_FAIL:$rel:$code"; exit 1; }
done < "$ROOT/paths.txt"
[ "$(find "$CUR" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CUR_NOT_79; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib,json
R=Path('/tmp/b46-scorebar-rebase');cur=R/'current';old=Path('/tmp/b46-v5/candidate')
paths=[x.strip() for x in (R/'paths.txt').read_text().splitlines() if x.strip()];chg=[]
for p in paths:
 a=old/p;b=cur/p
 if not a.exists() or not b.exists(): chg.append({'path':p,'old':a.exists(),'current':b.exists()}); continue
 ha=hashlib.sha256(a.read_bytes()).hexdigest();hb=hashlib.sha256(b.read_bytes()).hexdigest()
 if ha!=hb: chg.append({'path':p,'old_sha':ha,'current_sha':hb})
(R/'out'/'changed-from-v5.json').write_text(json.dumps(chg,indent=2));print('CHANGED_FROM_V5',json.dumps(chg))
for p in ['dashboard-v2-stage3.js','singlepage-workspace-343.css','index.html']:
 print('CURRENT_SHA',p,hashlib.sha256((cur/p).read_bytes()).hexdigest())
PY
for ep in board signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?rebase=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-rebase/out')
for n in ['board','signals','statistics']:
 j=json.load(open(r/f'{n}.json'))
 if j.get('ok') is not True: raise SystemExit('API_BAD:'+n)
s=json.load(open(r/'signals.json'));p=[x for x in s.get('signals',[]) if str(x.get('status','')).upper()=='PENDING']
print('LATEST_API_COUNTS',{'pending':len(p),'signals':len(s.get('signals',[])),'stats':len(json.load(open(r/'statistics.json')).get('rows',[])),'fixtures':len(json.load(open(r/'board.json')).get('fixtures',[]))})
PY
echo BALL46_SCOREBAR_REBASE_SCAN_SUCCESS_NO_DEPLOY
