#!/usr/bin/env bash
set -euo pipefail
SRC='.github/scripts/ball46_scorebar_results_deploy_20260928.sh'
TMP='/tmp/ball46_scorebar_results_deploy_fixed.sh'
python3 - <<'PY'
from pathlib import Path
s=Path('.github/scripts/ball46_scorebar_results_deploy_20260928.sh').read_text()
old="(root/'index.js').write_bytes(runtime);(root/'pre-version.txt').write_text(vid);print('PRE_RUNTIME_LOCK_PASS',vid,sha)"
new="(root/'index.js').write_bytes(runtime);pathlib.Path('/tmp/b46-scorebar-result-deploy-verify/pre-version.txt').write_text(vid);print('PRE_RUNTIME_LOCK_PASS',vid,sha)"
if old not in s: raise SystemExit('PRE_VERSION_PATTERN_NOT_FOUND')
s=s.replace(old,new,1)
old2='cd "$RUNTIME"\nnpx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"'
new2='''[ "$(find "$RUNTIME" -maxdepth 1 -type f -printf '%f\\n' | sort | paste -sd, -)" = 'index.js,wrangler.jsonc' ] || { echo RUNTIME_DIR_NOT_CLEAN; find "$RUNTIME" -maxdepth 1 -type f -printf '%f\\n'; exit 1; }
cd "$RUNTIME"
npx --yes wrangler@4.92.0 deploy --dry-run --config wrangler.jsonc 2>&1 | tee "$VERIFY/dry-run.log"'''
if old2 not in s: raise SystemExit('DRY_RUN_PATTERN_NOT_FOUND')
s=s.replace(old2,new2,1)
Path('/tmp/ball46_scorebar_results_deploy_fixed.sh').write_text(s)
PY
bash "$TMP"
