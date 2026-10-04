#!/usr/bin/env bash
set -euo pipefail
cd "${GITHUB_WORKSPACE}/deploy-assets/match-status-svg-20261003"
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p audit
node --input-type=module <<'NODE'
import { writeFileSync } from 'node:fs';
import { api, script, activeVersion, getVersion, sha, canonical } from './production.mjs';

const versionId=await activeVersion();
const version=await getVersion(versionId);
const settings=await api(`/scripts/${script}/settings`);
const preserved=new Set(['logpush','limits','observability','placement']);
const describe=(key,value)=>{
  const out={type:Array.isArray(value)?'array':value===null?'null':typeof value,hash:sha(canonical(value)),preservedByCurrentRail:preserved.has(key)};
  if(Array.isArray(value)) out.length=value.length;
  else if(value&&typeof value==='object') out.keys=Object.keys(value).sort();
  return out;
};
const bindingShape=(version.bindings||[]).map(b=>({type:b.type,name:b.name||null,service:b.service||null,environment:b.environment||null}));
const report={
  auditedAt:new Date().toISOString(),
  versionId,
  settingsSha:sha(canonical(settings)),
  settingsKeys:Object.keys(settings).sort(),
  settingsFields:Object.fromEntries(Object.entries(settings).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,describe(k,v)])),
  version:{main_module:version.main_module,compatibility_date:version.compatibility_date,compatibility_flags:version.compatibility_flags||[],bindingShape,assetsConfigKeys:Object.keys(version.assets?.config||{}).sort()},
  railExplicitSettingsFields:[...preserved].sort(),
};
writeFileSync('audit/settings-shape.json',JSON.stringify(report,null,2));
console.log(`CURRENT_VERSION=${versionId}`);
console.log(`CURRENT_SETTINGS_SHA=${report.settingsSha}`);
console.log(`CURRENT_SETTINGS_KEYS=${report.settingsKeys.join(',')}`);
NODE
