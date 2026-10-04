#!/usr/bin/env bash
set -euo pipefail

# Confirmed Ball46 Production rail: exact current-production staging with guarded deploy/rollback.
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=true
export PLAYWRIGHT_EXECUTABLE_PATH
PLAYWRIGHT_EXECUTABLE_PATH=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
test -n "$PLAYWRIGHT_EXECUTABLE_PATH" || { echo CURRENT_RAIL_CHROME_MISSING; exit 1; }
npm ci --ignore-scripts --no-audit --no-fund
node --test scorebar-frame-test.mjs
node scorebar-frame-run.mjs
