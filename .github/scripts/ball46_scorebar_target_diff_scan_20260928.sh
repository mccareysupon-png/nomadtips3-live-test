#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'; OLD='/tmp/b46-template'; ROOT='/tmp/b46-target-diff'; CUR="$ROOT/current"
rm -rf "$ROOT"; mkdir -p "$CUR"
python3 - <<'PY'
import base64,hashlib,json,os,urllib.request,pathlib
R=pathlib.Path('/tmp/b46-target-diff');A=os.environ['CLOUDFLARE_ACCOUNT_ID'];T=os.environ['CLOUDFLARE_API_TOKEN'];h={'Authorization':f'Bearer {T}','Accept':'application/json'};api=f'https://api.cloudflare.com/client/v4/accounts/{A}';s='ball46-production'
def get(u):
 with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:return json.load(r)
d=get(f'{api}/workers/scripts/{s}/deployments')['result']['deployments'][0];vs=d.get('versions') or []
if len(vs)!=1: raise SystemExit('MIXED')
vid=vs[0]['version_id'];v=get(f'{api}/workers/workers/{s}/versions/{vid}?include=modules')['result'];mods=v.get('modules') or [];sha=hashlib.sha256(base64.b64decode(mods[0]['content_base64'])).hexdigest();(R/'version.txt').write_text(vid);print('TARGET_SCAN_VERSION',vid,sha)
PY
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
for rel in dashboard-v2-stage3.js singlepage-workspace-343.css index.html; do
 code=$(curl -sS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' -H 'Pragma: no-cache' -o "$CUR/$rel" -w '%{http_code}' "$DIRECT/$rel?diff=$nonce-$RANDOM")||true; [ "$code" = 200 ]||exit 1
done
for rel in dashboard-v2-stage3.js singlepage-workspace-343.css index.html; do
 echo "===== DIFF $rel ====="; diff -u "$OLD/candidate/$rel" "$CUR/$rel" || true; sha256sum "$OLD/candidate/$rel" "$CUR/$rel"; done > "$ROOT/diff.txt"
python3 - <<'PY'
from pathlib import Path
R=Path('/tmp/b46-target-diff/current')
js=(R/'dashboard-v2-stage3.js').read_text();css=(R/'singlepage-workspace-343.css').read_text();idx=(R/'index.html').read_text()
for m in ['BALL46_SCOREBAR_SIGNAL_SETTLEMENT_20260928','renderWorkspaceScorebar','data-scorebar-signal-result']:
 print('JS_MARKER',m,js.find(m))
for m in ['BALL46_SCOREBAR_SIGNAL_RESULT_20260928','workspace-scorebar-signal-result','workspace-scorebar-live']:
 print('CSS_MARKER',m,css.find(m))
for m in ['343-signal-settlement-20260928a','dashboard-v2-stage3.js','singlepage-workspace-343.css']:
 print('INDEX_MARKER',m,idx.find(m))
PY
sed -n '1,260p' "$ROOT/diff.txt"
echo BALL46_TARGET_DIFF_SCAN_SUCCESS_NO_DEPLOY
