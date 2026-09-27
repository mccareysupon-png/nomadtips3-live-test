#!/usr/bin/env bash
set -euo pipefail
WWW="https://www.ball46.com"
mkdir -p /tmp/b46-favicon-diag
python3 - <<'PY'
import json,os,urllib.request,pathlib
account=os.environ['CLOUDFLARE_ACCOUNT_ID'];token=os.environ['CLOUDFLARE_API_TOKEN']
h={'Authorization':f'Bearer {token}','Accept':'application/json'}
u=f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/ball46-production/deployments'
with urllib.request.urlopen(urllib.request.Request(u,headers=h),timeout=30) as r:p=json.load(r)
vid=p['result']['deployments'][0]['versions'][0]['version_id']
print('CURRENT_VERSION_ID='+vid)
pathlib.Path('/tmp/b46-favicon-diag/version.txt').write_text(vid)
PY
nonce="${GITHUB_RUN_ID}-$(date +%s%N)"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$WWW/index.html?favicon-diag=$nonce" -o /tmp/b46-favicon-diag/index.html
python3 - <<'PY'
from pathlib import Path
import re,html
s=Path('/tmp/b46-favicon-diag/index.html').read_text(errors='replace')
icons=re.findall(r'<link\b[^>]*rel=["\'](?:shortcut icon|icon)["\'][^>]*>',s,re.I)
print('ICON_TAG_COUNT='+str(len(icons)))
for i,x in enumerate(icons,1):print(f'ICON_TAG_{i}='+x)
m=re.search(r'<link\b[^>]*rel=["\'](?:shortcut icon|icon)["\'][^>]*href=["\']([^"\']+)["\']',s,re.I)
if not m: raise SystemExit('NO_ICON_HREF')
href=html.unescape(m.group(1));print('ICON_HREF='+href);Path('/tmp/b46-favicon-diag/href.txt').write_text(href)
PY
href=$(cat /tmp/b46-favicon-diag/href.txt)
case "$href" in
  http://*|https://*) icon_url="$href" ;;
  /*) icon_url="$WWW$href" ;;
  *) icon_url="$WWW/$href" ;;
esac
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "$icon_url?favicon-diag=$nonce" -o /tmp/b46-favicon-diag/current-icon
file /tmp/b46-favicon-diag/current-icon || true
sha256sum /tmp/b46-favicon-diag/current-icon
python3 - <<'PY'
from pathlib import Path
p=Path('/tmp/b46-favicon-diag/current-icon');b=p.read_bytes();print('ICON_BYTES='+str(len(b)));print('ICON_PREFIX='+repr(b[:160]))
PY
