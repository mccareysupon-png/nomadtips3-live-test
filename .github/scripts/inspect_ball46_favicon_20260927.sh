#!/usr/bin/env bash
set -euo pipefail
WWW="https://www.ball46.com"
rm -rf /tmp/b46-favicon-diag
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
hrefs=[]
for i,x in enumerate(icons,1):
    print(f'ICON_TAG_{i}='+x)
    m=re.search(r'href=["\']([^"\']+)["\']',x,re.I)
    if m:
        href=html.unescape(m.group(1));hrefs.append(href);print(f'ICON_HREF_{i}='+href)
Path('/tmp/b46-favicon-diag/hrefs.txt').write_text('\n'.join(hrefs)+'\n')
if not hrefs: raise SystemExit('NO_ICON_HREF')
PY
n=0
while IFS= read -r href; do
  [ -n "$href" ] || continue
  n=$((n+1))
  case "$href" in
    http://*|https://*) icon_url="$href" ;;
    /*) icon_url="$WWW$href" ;;
    *) icon_url="$WWW/$href" ;;
  esac
  sep='?'; [[ "$icon_url" == *\?* ]] && sep='&'
  curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' "${icon_url}${sep}favicon-diag=$nonce" -o "/tmp/b46-favicon-diag/icon-$n"
  echo "ICON_${n}_URL=$icon_url"
  file "/tmp/b46-favicon-diag/icon-$n" || true
  sha256sum "/tmp/b46-favicon-diag/icon-$n"
  ICON_NO="$n" python3 - <<'PY'
from pathlib import Path
import os
n=os.environ['ICON_NO'];p=Path(f'/tmp/b46-favicon-diag/icon-{n}');b=p.read_bytes();print(f'ICON_{n}_BYTES='+str(len(b)));print(f'ICON_{n}_PREFIX='+repr(b[:220]))
PY
done < /tmp/b46-favicon-diag/hrefs.txt
