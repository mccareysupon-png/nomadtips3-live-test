#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
mkdir -p audit/vintage-kits-images
cp vintage-kits-24-sprite.webp audit/vintage-kits-images/branch-sprite.webp
sha256sum vintage-kits-24-sprite.webp | tee audit/vintage-kits-images/branch-sprite.sha256
file vintage-kits-24-sprite.webp | tee audit/vintage-kits-images/branch-sprite.file.txt
