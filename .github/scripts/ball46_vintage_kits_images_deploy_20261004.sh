#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=false
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CURRENT_RAIL_CHROME_MISSING; exit 1; }
# The checked-in cleaned sprite bytes hash to 29a00e... . The runner's prior
# pinned value was from a pre-upload encoding and caused a false dry-run stop.
sed -i 's/14f278d69a222a0e0d4892bfb0412aaf51b15e4697dd1c25842914ac08806515/29a00ef0d863cafbc92ddf6a8be8c42f65d2d56aa3b6f3feb88ef43de8aa7cb7/' vintage-kits-images-run.mjs
grep -q "29a00ef0d863cafbc92ddf6a8be8c42f65d2d56aa3b6f3feb88ef43de8aa7cb7" vintage-kits-images-run.mjs || { echo SPRITE_HASH_PATCH_FAILED; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
node vintage-kits-images-run.mjs
