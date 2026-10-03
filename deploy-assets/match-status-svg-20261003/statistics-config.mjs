import assert from 'node:assert/strict';
import { canonical } from './production.mjs';

export function verifyConfiguration(before, after) {
  const { annotations: beforeAnnotations = {}, ...beforeRuntime } = before;
  const { annotations: afterAnnotations = {}, ...afterRuntime } = after;
  assert.equal(canonical(afterRuntime), canonical(beforeRuntime), 'PRODUCTION_RUNTIME_SETTINGS_CHANGED_STOP');
  const changedMetadata = [];
  for (const key of new Set([...Object.keys(beforeAnnotations), ...Object.keys(afterAnnotations)])) {
    if (canonical(beforeAnnotations[key]) === canonical(afterAnnotations[key])) continue;
    assert(key.startsWith('workers/'), `CUSTOM_ANNOTATION_CHANGED_STOP:${key}`);
    changedMetadata.push(key);
  }
  return { runtimeSettingsUnchanged: true, changedDeploymentMetadata: changedMetadata.sort() };
}

export function verifyVersionConfiguration(before, after) {
  const contract = version => ({ main_module: version.main_module, compatibility_date: version.compatibility_date, compatibility_flags: version.compatibility_flags || [], bindings: version.bindings, assets: version.assets?.config });
  assert.equal(canonical(contract(after)), canonical(contract(before)), 'PRODUCTION_VERSION_ROUTING_OR_BINDINGS_CHANGED_STOP');
  return { assetRoutingBindingsAndCompatibilityUnchanged: true };
}
