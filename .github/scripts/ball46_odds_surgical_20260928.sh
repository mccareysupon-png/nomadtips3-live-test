#!/usr/bin/env bash
set -euo pipefail

# Confirmed Ball46 Production rail: same worker, same current-production staging, same guarded deploy/rollback path.
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
export DEPLOY_ENABLED=true
npm ci --ignore-scripts --no-audit --no-fund
node live-result-minute-run.mjs
