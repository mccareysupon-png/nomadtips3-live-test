#!/usr/bin/env bash
set -euo pipefail
DIRECT='https://ball46-production.mccarey-supon.workers.dev'
ROOT='/tmp/b46-realistic-bg-rules'; rm -rf "$ROOT"; mkdir -p "$ROOT"
nonce="${GITHUB_RUN_ID:-manual}-$(date +%s%N)"
curl -fsSL --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache,no-store' "$DIRECT/singlepage-workspace-343.css?rules=$nonce" -o "$ROOT/live.css"
python3 - <<'PY'
from pathlib import Path
import re
css=Path('/tmp/b46-realistic-bg-rules/live.css').read_text(errors='replace')
rules=re.findall(r'([^{}]+)\{([^{}]*)\}',css,re.S)
keys=['outcome-win','outcome-loss','workspace-scorebar-pending']
for i,(sel,body) in enumerate(rules):
    ss=' '.join(sel.split())
    if any(k in ss for k in keys):
        print('RULE',i,'SELECTOR',ss[:500])
        print('  WEBP',bool(re.search(r'data:image/webp;base64,',body)),'BGIMAGE',('background-image' in body),'BACKGROUND',('background:' in body),'BODYLEN',len(body))
        if re.search(r'data:image/webp;base64,',body):
            print('  DATAURI_COUNT',len(re.findall(r'data:image/webp;base64,[A-Za-z0-9+/=]+',body)))
print('RULE_LOCATOR_PASS')
PY
