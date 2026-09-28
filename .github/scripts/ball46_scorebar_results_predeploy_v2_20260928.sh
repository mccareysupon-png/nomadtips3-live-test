#!/usr/bin/env bash
set -euo pipefail
SRC='.github/scripts/ball46_scorebar_results_predeploy_20260928.sh'
TMP='/tmp/ball46_scorebar_results_predeploy_fixed.sh'
python3 - <<'PY'
from pathlib import Path
src=Path('.github/scripts/ball46_scorebar_results_predeploy_20260928.sh').read_text()
old='for i in $(seq 1 60); do curl -fsS http://127.0.0.1:9333/json > "$VERIFY/pages.json" 2>/dev/null && break; sleep .25; done'
new='''rm -f "$VERIFY/pages.json" "$VERIFY/pages.tmp"
for i in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:9333/json > "$VERIFY/pages.tmp" 2>/dev/null && python3 -c "import json,sys; x=json.load(open(sys.argv[1])); assert any(i.get(\'type\')==\'page\' and i.get(\'webSocketDebuggerUrl\') for i in x)" "$VERIFY/pages.tmp" 2>/dev/null; then
    mv "$VERIFY/pages.tmp" "$VERIFY/pages.json"
    break
  fi
  sleep .25
done
[ -s "$VERIFY/pages.json" ] || { echo CHROME_DEVTOOLS_NOT_READY; exit 1; }'''
if old not in src: raise SystemExit('CHROME_LOOP_PATTERN_NOT_FOUND')
Path('/tmp/ball46_scorebar_results_predeploy_fixed.sh').write_text(src.replace(old,new,1))
PY
bash "$TMP"
