#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=false
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CURRENT_RAIL_CHROME_MISSING; exit 1; }
# Pin the approved sprite rebuilt directly from the saved WEB 96x96 Library assets.
sed -i 's/14f278d69a222a0e0d4892bfb0412aaf51b15e4697dd1c25842914ac08806515/6d6eb28f0cfb983f71e8887969c14bb6685bd39f3c4d8fe1e9b7f9f604077b0b/' vintage-kits-images-run.mjs
# Keep the exact proven live-row geometry; change only the visual asset from CSS to image.
sed -i 's/width:1.42em;height:1.42em;vertical-align:-.27em;margin-right:.36em/width:1.28em;height:1.28em;vertical-align:-.22em;margin-right:.42em/' vintage-kits-images-run.mjs
grep -q "6d6eb28f0cfb983f71e8887969c14bb6685bd39f3c4d8fe1e9b7f9f604077b0b" vintage-kits-images-run.mjs || { echo SPRITE_HASH_PATCH_FAILED; exit 1; }
grep -q "width:1.28em;height:1.28em;vertical-align:-.22em;margin-right:.42em" vintage-kits-images-run.mjs || { echo KIT_GEOMETRY_PATCH_FAILED; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
node vintage-kits-images-run.mjs
