#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
WWW='https://www.ball46.com'
OUT='/tmp/b46-scorebar-visual-diagnose'
rm -rf "$OUT"; mkdir -p "$OUT"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
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
pathlib.Path('/tmp/b46-scorebar-visual-diagnose/version.txt').write_text(vid)
pathlib.Path('/tmp/b46-scorebar-visual-diagnose/runtime-sha.txt').write_text(sha)
print('VISUAL_DIAG_RUNTIME_LOCK',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for rel in singlepage-workspace-343.css dashboard-v2-stage3.js index.html; do
 curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' "$DIRECT/$rel?diag=$nonce-$RANDOM" -o "$OUT/$rel"
done
python3 - <<'PY'
from pathlib import Path
import re,base64,hashlib,subprocess,sys
out=Path('/tmp/b46-scorebar-visual-diagnose');s=(out/'singlepage-workspace-343.css').read_text()
for n in ['singlepage-workspace-343.css','dashboard-v2-stage3.js','index.html']:
 print('LIVE_SHA',n,hashlib.sha256((out/n).read_bytes()).hexdigest())
loss=re.search(r'outcome-loss\{[^}]*url\("data:image/webp;base64,([^\"]+)',s)
pend_webp=re.search(r'workspace-scorebar-pending\{[^}]*url\("data:image/webp;base64,([^\"]+)',s)
pend_svg='workspace-scorebar-pending' in s and 'data:image/svg+xml' in s[s.find('workspace-scorebar-pending'):s.find('workspace-scorebar-pending')+2500]
if not loss: raise SystemExit('LOSS_WEBP_MISSING')
(out/'loss-live.webp').write_bytes(base64.b64decode(loss.group(1)))
print('LOSS_WEBP_BYTES',(out/'loss-live.webp').stat().st_size)
print('PENDING_WEBP_PRESENT',bool(pend_webp),'PENDING_SVG_PRESENT',pend_svg)
rc=subprocess.run(['ffmpeg','-v','error','-i',str(out/'loss-live.webp'),'-f','null','-'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
print('LOSS_FFMPEG_RC',rc.returncode)
if rc.returncode!=0: print('LOSS_FFMPEG_ERR',rc.stderr[:600].replace('\n',' | '))
PY
for ep in signals statistics; do curl -fsS -L --retry 4 --retry-all-errors --max-time 30 "$WWW/api/engine/$ep?diag=$nonce" -o "$OUT/$ep.json"; done
python3 - <<'PY'
import json,pathlib
r=pathlib.Path('/tmp/b46-scorebar-visual-diagnose')
s=json.load(open(r/'signals.json'));t=json.load(open(r/'statistics.json'))
p=[x for x in s.get('signals',[]) if str(x.get('status','')).upper()=='PENDING']
l=[x for x in t.get('rows',[]) if str(x.get('status','')).upper()=='SETTLED' and str(x.get('result','')).upper() in {'LOSS','HALF_LOSS'}]
print('LIVE_VISUAL_DATA',{'pending':len(p),'loss_settled':len(l)})
PY
echo BALL46_SCOREBAR_VISUAL_DIAGNOSE_SUCCESS_NO_DEPLOY
