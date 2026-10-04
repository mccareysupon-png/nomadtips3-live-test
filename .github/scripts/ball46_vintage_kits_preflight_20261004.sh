#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p audit/vintage-kits-20261004
node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { inspect, publicFile, directOrigin, sha } from './production.mjs';

const { restore, source } = await inspect();
const paths = readFileSync('../../.github/scripts/ball46_current217_live_paths_20260928.txt','utf8').split(/\r?\n/).filter(Boolean);
const refs=[];
for (const path of paths){
  const bytes=await publicFile('/'+path,undefined,directOrigin);
  const text=bytes.toString('utf8');
  if(text.includes('team-kits-343.js') || text.includes('NOMAD_TEAM_KITS_343')) refs.push(path);
}
const kitBytes=await publicFile('/team-kits-343.js','javascript',directOrigin);
const kitSource=kitBytes.toString('utf8');
const indexSource=(await publicFile('/index.html','text/html',directOrigin)).toString('utf8');
const report={
  auditedAt:new Date().toISOString(),
  activeVersion:restore.version,
  teamKitsSha:sha(kitBytes),
  teamKitsVersion:(kitSource.match(/const VERSION='([^']+)'/)||[])[1]||null,
  mainModuleReferencesTeamKits:source.includes('team-kits-343.js')||source.includes('NOMAD_TEAM_KITS_343'),
  indexReferencesTeamKits:indexSource.includes('team-kits-343.js')||indexSource.includes('NOMAD_TEAM_KITS_343'),
  publicAssetReferences:refs,
  currentHomePlacement:kitSource.includes("homeSlot.appendChild(icon(homeIndex))")?'after-name':kitSource.includes("homeSlot.insertBefore(icon(homeIndex),homeName)")?'before-name':'unknown',
  currentAwayPlacement:kitSource.includes("awaySlot.insertBefore(icon(awayIndex),awayName)")?'before-name':'unknown',
  paletteCount:(kitSource.match(/const PALETTES=\[([\s\S]*?)\];/)?.[1].match(/\['/g)||[]).length,
  backend:restore.backend
};
writeFileSync('audit/vintage-kits-20261004/preflight.json',JSON.stringify(report,null,2));
writeFileSync('audit/vintage-kits-20261004/team-kits-current.js',kitSource);
console.log(JSON.stringify(report,null,2));
NODE
