import { mkdirSync, writeFileSync } from 'node:fs';
import { api, script, activeVersion, getVersion, canonical, sha } from './production.mjs';
mkdirSync('audit',{recursive:true});
const versionId=await activeVersion();
const settings=await api(`/scripts/${script}/settings`);
const version=await getVersion(versionId);
writeFileSync('audit/settings-current.json',JSON.stringify(settings,null,2));
writeFileSync('audit/version-current.json',JSON.stringify({
  id:versionId,
  main_module:version.main_module,
  compatibility_date:version.compatibility_date,
  compatibility_flags:version.compatibility_flags,
  bindings:version.bindings,
  assets:version.assets,
  annotations:version.annotations,
  limits:version.limits,
  observability:version.observability
},null,2));
writeFileSync('audit/settings-probe.json',JSON.stringify({versionId,settingsSha:sha(canonical(settings)),keys:Object.keys(settings).sort()},null,2));
console.log(`ACTIVE_VERSION=${versionId}`);
console.log(`SETTINGS_SHA=${sha(canonical(settings))}`);
console.log(`SETTINGS_KEYS=${Object.keys(settings).sort().join(',')}`);
console.log('BALL46_SETTINGS_PROBE_PASS');
