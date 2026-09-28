#!/usr/bin/env bash
set -euo pipefail
WWW="https://www.ball46.com"
SRC="/tmp/b46-step4-source"
BASE="$SRC/before/index.html"
CURRENT="/tmp/b46-step4-current-index.html"

test -s "$BASE"
curl -fsS -L --retry 4 --retry-all-errors --max-time 30 -H 'Cache-Control: no-cache' \
  "$WWW/index.html?step4-index-lock=${GITHUB_RUN_ID:-manual}-$(date +%s%N)" -o "$CURRENT"

python3 - <<'PY'
from pathlib import Path
import re, hashlib
base=Path('/tmp/b46-step4-source/before/index.html').read_text()
cur=Path('/tmp/b46-step4-current-index.html').read_text()
pat=re.compile(r'<link\s+rel="icon"[^>]*>',re.I)
b=pat.sub('<link rel="icon">',base)
c=pat.sub('<link rel="icon">',cur)
if b!=c:
    raise SystemExit('INDEX_CHANGED_BEYOND_FAVICON')
print('STEP4_INDEX_NORMALIZED_LOCK_PASS',hashlib.sha256(c.encode()).hexdigest())
PY

# The only accepted index drift is the already-approved favicon. Use today's exact index
# as the baseline for the read-only pre/post guard in the main Step4 harness.
cp "$CURRENT" "$BASE"
exec bash .github/scripts/ball46_card_step4_behavior_20260928.sh
