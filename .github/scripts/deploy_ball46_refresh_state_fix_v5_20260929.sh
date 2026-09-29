#!/usr/bin/env bash
set -euo pipefail
SRC='.github/scripts/deploy_ball46_refresh_state_fix_v4_20260929.sh'
TMP='/tmp/deploy_ball46_refresh_state_fix_v5_20260929.sh'
python3 - <<'PY'
from pathlib import Path
src=Path('.github/scripts/deploy_ball46_refresh_state_fix_v4_20260929.sh').read_text()
old="for m in ['BALL46_REFRESH_ROUTE_GUARD_20260929','hasExplicitNonLiveRoute','view===\\'statistics\\'','view===\\'signal\\'']:"
new="for m in ['BALL46_REFRESH_ROUTE_GUARD_20260929','hasExplicitNonLiveRoute','v===\\'statistics\\'','v===\\'signal\\'']:"
if src.count(old)!=1: raise SystemExit('V5_MARKER_ASSERTION_ANCHOR_BAD:'+str(src.count(old)))
Path('/tmp/deploy_ball46_refresh_state_fix_v5_20260929.sh').write_text(src.replace(old,new,1))
print('V5_DEPLOY_GUARD_ONLY_PATCH_PASS')
PY
bash "$TMP"
