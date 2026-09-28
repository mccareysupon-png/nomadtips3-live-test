#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-realistic-bg-inspect'
rm -rf "$ROOT"; mkdir -p "$ROOT"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request
A=os.environ['CLOUDFLARE_ACCOUNT_ID']; T=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {T}','Accept':'application/json'}
api=f'https://api.cloudflare.com/client/v4/accounts/{A}'; s='ball46-production'
def get(u):
  with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r: return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0]
vs=d.get('versions') or []
if len(vs)!=1 or float(vs[0].get('percentage',0))!=100: raise SystemExit('MIXED_DEPLOYMENT')
vid=vs[0]['version_id']
v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result']
mods=v.get('modules') or []
if len(mods)!=1 or mods[0].get('name')!='index.js': raise SystemExit('RUNTIME_MODULE_BAD')
raw=base64.b64decode(mods[0]['content_base64']); sha=hashlib.sha256(raw).hexdigest()
print('PRODUCTION_VERSION',vid)
print('RUNTIME_SHA',sha)
print('BINDINGS',[(b.get('name'),b.get('type'),b.get('service'),b.get('environment')) for b in (v.get('bindings') or [])])
open('/tmp/b46-realistic-bg-inspect/version.txt','w').write(vid)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for f in singlepage-workspace-343.css index.html; do
  curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/$f?inspect=$nonce-$RANDOM" -o "$ROOT/$f"
done
python3 - <<'PY'
from pathlib import Path
import re,hashlib
r=Path('/tmp/b46-realistic-bg-inspect')
css=(r/'singlepage-workspace-343.css').read_text(errors='replace')
idx=(r/'index.html').read_text(errors='replace')
for sel in ['.workspace-scorebar-signal-result.outcome-win','.workspace-scorebar-signal-result.outcome-loss','.workspace-scorebar-pending']:
  m=re.search(re.escape(sel)+r'\s*\{(.*?)\}',css,re.S)
  if not m: raise SystemExit('SELECTOR_MISSING:'+sel)
  block=m.group(1)
  print('SELECTOR',sel,'WEBP',bool(re.search(r'data:image/webp;base64,',block)),'LEN',len(block))
refs=re.findall(r'singlepage-workspace-343\.css\?v=[^"\'<> ]+',idx)
print('CSS_CACHE_REFS',refs)
print('CSS_SHA',hashlib.sha256((r/'singlepage-workspace-343.css').read_bytes()).hexdigest())
print('INDEX_SHA',hashlib.sha256((r/'index.html').read_bytes()).hexdigest())
print('READ_ONLY_INSPECT_PASS')
PY
