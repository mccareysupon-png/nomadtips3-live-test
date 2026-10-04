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
const teamKitRefs=[];
const rendererHits=[];
const needles=['home-slot','away-slot','fixture-scoreboard','team-name','match-card'];
for (const path of paths){
  const bytes=await publicFile('/'+path,undefined,directOrigin);
  const text=bytes.toString('utf8');
  if(text.includes('team-kits-343.js') || text.includes('NOMAD_TEAM_KITS_343')) teamKitRefs.push(path);
  const hits=needles.filter(n=>text.includes(n));
  if(hits.length) rendererHits.push({path,hits,sha:sha(bytes)});
}
const kitBytes=await publicFile('/team-kits-343.js','javascript',directOrigin);
const kitSource=kitBytes.toString('utf8');
const indexSource=(await publicFile('/index.html','text/html',directOrigin)).toString('utf8');
const sourceLines=source.split(/\r?\n/);
const mainSnippets=[];
sourceLines.forEach((line,i)=>{
  if(needles.some(n=>line.includes(n)) || line.includes('team-kits-343.js') || line.includes('NOMAD_TEAM_KITS_343')){
    mainSnippets.push({line:i+1,text:line.slice(0,1200)});
  }
});
const report={
  auditedAt:new Date().toISOString(),
  activeVersion:restore.version,
  teamKitsSha:sha(kitBytes),
  teamKitsVersion:(kitSource.match(/const VERSION='([^']+)'/)||[])[1]||null,
  mainModuleReferencesTeamKits:source.includes('team-kits-343.js')||source.includes('NOMAD_TEAM_KITS_343'),
  indexReferencesTeamKits:indexSource.includes('team-kits-343.js')||indexSource.includes('NOMAD_TEAM_KITS_343'),
  publicAssetReferences:teamKitRefs,
  currentHomePlacement:kitSource.includes("homeSlot.appendChild(icon(homeIndex))")?'after-name':kitSource.includes("homeSlot.insertBefore(icon(homeIndex),homeName)")?'before-name':'unknown',
  currentAwayPlacement:kitSource.includes("awaySlot.insertBefore(icon(awayIndex),awayName)")?'before-name':'unknown',
  paletteCount:(kitSource.match(/const PALETTES=\[([\s\S]*?)\];/)?.[1].match(/\['/g)||[]).length,
  rendererHits,
  mainModuleRendererHitCount:mainSnippets.length,
  backend:restore.backend
};
writeFileSync('audit/vintage-kits-20261004/preflight.json',JSON.stringify(report,null,2));
writeFileSync('audit/vintage-kits-20261004/team-kits-current.js',kitSource);
writeFileSync('audit/vintage-kits-20261004/main-renderer-snippets.json',JSON.stringify(mainSnippets,null,2));
console.log(JSON.stringify(report,null,2));
NODE
