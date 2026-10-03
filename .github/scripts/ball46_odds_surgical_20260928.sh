#!/usr/bin/env bash
set -euo pipefail

# Same confirmed Production rail as run 36360390676; source and assets come only from current Production.
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=true
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CURRENT_RAIL_CHROME_MISSING; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
node scout.mjs
npm test
if test -f verify-published.json; then
  node verify-published.mjs
else
  node run.mjs
fi
