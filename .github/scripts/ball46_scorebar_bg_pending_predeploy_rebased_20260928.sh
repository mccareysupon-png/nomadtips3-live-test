#!/usr/bin/env bash
set -euo pipefail
SRC='/tmp/b46-current'
[ -d "$SRC/current" ] || { echo CURRENT_ASSETS_MISSING; exit 1; }
[ -s "$SRC/paths.txt" ] || { echo CURRENT_PATHS_MISSING; exit 1; }
[ "$(find "$SRC/current" -type f | wc -l | tr -d ' ')" = '79' ] || { echo CURRENT_NOT_79; exit 1; }
rm -rf /tmp/b46-v5; mkdir -p /tmp/b46-v5
cp -a "$SRC/current" /tmp/b46-v5/candidate
cp "$SRC/paths.txt" /tmp/b46-v5/paths.txt
cp .github/scripts/ball46_scorebar_bg_pending_predeploy_20260928.sh /tmp/rebased-predeploy.sh
python3 - <<'PY'
p='/tmp/rebased-predeploy.sh'
s=open(p).read()
s=s.replace('9d68b06d-2f83-4b0f-958a-d4b0babf1857','0521b52a-3322-4ae9-99fb-e1ab160c77d2')
open(p,'w').write(s)
PY
bash /tmp/rebased-predeploy.sh
