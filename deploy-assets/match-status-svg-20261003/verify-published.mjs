import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, manifest, publicFile, backend } from './production.mjs';
import { patch, normalize, route, obsoleteImport } from './patch.mjs';
import { rail, schedules } from './rail.mjs';
import { uiCheck } from './qa.mjs';
import { icons } from './icons.mjs';

const reviewed = JSON.parse(readFileSync('base.json', 'utf8'));
const published = JSON.parse(readFileSync('verify-published.json', 'utf8'));
const report = { commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, deploymentRun: published.deploymentRun, deploymentCommit: published.deploymentCommit, deploymentRail: rail, baseVersion: published.baseVersion, targetVersion: published.version, verificationOnly: true, startedAt: new Date().toISOString() };
mkdirSync('audit', { recursive: true });
const save = () => writeFileSync('audit/report.json', JSON.stringify(report, null, 2));

try {
  assert.equal(process.env.GITHUB_REF_NAME, rail.branch, 'UNCONFIRMED_VERIFY_BRANCH_STOP');
  const current = await inspect();
  assert.equal(current.restore.version, published.version, 'PUBLISHED_PRODUCTION_MOVED_STOP');
  const original = await getVersion(reviewed.version);
  const originalSource = Buffer.from(original.modules.find(module => module.name === original.main_module).content_base64, 'base64').toString('utf8');
  assert.equal(sha(originalSource), reviewed.mainModuleSha, 'ORIGINAL_PRODUCTION_SOURCE_CHANGED_STOP');
  const result = patch(originalSource);
  report.expectedMainModuleSha = sha(result.after);
  report.actualMainModuleSha = sha(current.source);
  report.expectedMainModule = original.main_module;
  report.actualMainModule = current.version.main_module;
  report.actualModules = manifest(current.version);
  report.sourceComparison = {
    exact: current.source === result.after,
    trimmed: current.source.trimEnd() === result.after.trimEnd(),
    nonCssExact: normalize(current.source) === normalize(originalSource),
    expectedBytes: Buffer.byteLength(result.after),
    actualBytes: Buffer.byteLength(current.source),
  };
  console.log('PUBLISHED_MODULE_COMPARISON=' + JSON.stringify({ expectedMainModule: report.expectedMainModule, actualMainModule: report.actualMainModule, modules: report.actualModules, expectedSha: report.expectedMainModuleSha, ...report.sourceComparison }));
  save();
  assert.equal(current.version.main_module, original.main_module, 'PUBLISHED_MAIN_MODULE_NAME_CHANGED_STOP');
  assert.equal(current.version.modules.length, original.modules.length, 'PUBLISHED_MODULE_COUNT_CHANGED_STOP');
  assert.equal(current.source, result.after, 'PUBLISHED_MODULE_BYTES_DIFFER_STOP');
  assert.equal(normalize(current.source), normalize(originalSource), 'PUBLISHED_NON_CSS_WORKER_BYTES_DIFFER_STOP');
  assert.equal(sha(await publicFile(route, 'css')), published.css.afterSha, 'PUBLISHED_CSS_BYTES_DIFFER_STOP');
  assert(!result.afterCss.includes(obsoleteImport), 'PUBLISHED_OBSOLETE_IMPORT_PRESENT_STOP');
  for (const [path, expected] of Object.entries(published.protectedFiles)) assert.equal(sha(await publicFile(path)), expected, `PUBLISHED_UNRELATED_ASSET_CHANGED_STOP:${path}`);
  report.protectedFilesVerified = Object.keys(published.protectedFiles).length;
  report.backendBefore = published.backendBefore;
  report.backendAfter = await backend();
  assert.equal(canonical(report.backendAfter), canonical(published.backendBefore), 'PUBLISHED_BACKEND_REVISION_CHANGED_STOP');
  report.configBeforeSha = published.configBeforeSha;
  report.configAfterSha = sha(canonical(await api(`/scripts/${script}/settings`)));
  assert.equal(report.configAfterSha, published.configBeforeSha, 'PUBLISHED_CONFIG_CHANGED_STOP');
  report.cronsAfter = await schedules();
  assert.equal(canonical(report.cronsAfter), canonical(published.cronsBefore), 'PUBLISHED_CRON_CHANGED_STOP');
  mkdirSync('audit/svg', { recursive: true });
  for (const [key, svg] of Object.entries(icons)) writeFileSync(`audit/svg/${key}.svg`, svg);
  console.log('PUBLISHED_ALL_PROTECTED_BYTES_AND_BACKEND_PASS');
  await uiCheck({ ...result, phase: 'production' });
  assert.equal(await activeVersion(), published.version, 'FINAL_PRODUCTION_MOVED_STOP');
  report.finalVersion = published.version;
  report.result = 'SUCCESS';
  report.apiSignalOddsStatisticsLiveFeedUnchanged = true;
  report.allHtmlAndJavascriptUnchanged = true;
  report.fourScorebarImagesUnchanged = true;
  report.nonCssWorkerBytesUnchanged = true;
  report.completedAt = new Date().toISOString();
  save();
  console.log(`FINAL_PRODUCTION=${published.version}`);
  console.log('SUCCESS');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Ball46 MATCH STATUS SVG\n\nSUCCESS: verified deployed version ${published.version}.\n\nDeployment run: ${published.deploymentRun}. This run verifies the published version without re-deploying.\n`);
} catch (error) {
  report.result = 'FAIL_STOPPED';
  report.error = error.message;
  save();
  console.error(error.stack);
  process.exitCode = 1;
}
