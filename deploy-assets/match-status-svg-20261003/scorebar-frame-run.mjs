import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { inspect, activeVersion, getVersion, api, script, sha, canonical, publicFile, backend } from './production.mjs';
import { patch, route } from './scorebar-frame-patch.mjs';
import { frameUiCheck } from './scorebar-frame-qa.mjs';
import { verifyConfiguration, verifyVersionConfiguration } from './statistics-config.mjs';
import { rail, schedules, stageCurrentRail, verifyRailBase, wrangler, verifyPublishedModules } from './rail.mjs';

const reviewedCssSha = '8bf89e14f0e3bedc71d23624a850945fe8cceef0cd5d50a9d795a3b9c47dc8ea';
const report = { commit: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, startedAt: new Date().toISOString(), deploymentRail: rail, scope: 'Only append inset WIN green / LOSS red / DRAW silver / PENDING orange scorebar frames. Current images, content, geometry, all other CSS and executable bytes unchanged.' };
mkdirSync('audit/css', { recursive: true });
const save = () => writeFileSync('audit/report.json', JSON.stringify(report, null, 2));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let current, result, protectedFiles;

async function owned(id) {
  try { verifyPublishedModules(await getVersion(id), current.version, result.after, protectedFiles); return true; }
  catch { return false; }
}

async function rollback() {
  const id = await activeVersion();
  if (id === current.restore.version) { report.rollback = { status: 'base-still-active', version: id }; return; }
  if (!await owned(id)) { report.rollback = { status: 'skipped-foreign-deployment', version: id }; return; }
  await api(`/scripts/${script}/deployments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: current.restore.version, percentage: 100 }], annotations: { 'workers/message': `Rollback scorebar frames ${report.run}` } }) });
  assert.equal(await activeVersion(), current.restore.version, 'ROLLBACK_NOT_CONFIRMED');
  report.rollback = { status: 'confirmed', version: current.restore.version };
}

try {
  assert.equal(process.env.GITHUB_REF_NAME, rail.branch, 'UNCONFIRMED_DEPLOY_BRANCH_STOP');
  assert.equal(process.env.DEPLOY_ENABLED, 'true', 'DEPLOY_NOT_AUTHORIZED');
  current = await inspect();
  report.baseVersion = current.restore.version;
  assert.equal(current.restore.presentationCssSha, reviewedCssSha, 'REVIEWED_CURRENT_CSS_CHANGED_STOP');
  result = patch(current.source);
  const settingsBefore = await api(`/scripts/${script}/settings`);
  assert.equal(sha(canonical(settingsBefore)), current.restore.settingsSha, 'SETTINGS_CHANGED_DURING_PACKAGING_STOP');
  const cronsBefore = await schedules();
  protectedFiles = {};
  const inventory = Object.keys(JSON.parse(readFileSync('verify-published.json', 'utf8')).protectedFiles);
  for (const path of inventory) if (new URL(path, 'https://ball46.com').pathname !== route) protectedFiles[path] = sha(await publicFile(path));
  for (const path of ['/dashboard-v2-stage3.js', '/singlepage-workspace-343.js', '/index.html']) assert(protectedFiles[path] || Object.keys(protectedFiles).some(entry => entry.startsWith(path + '?')), `UNPROTECTED_NATIVE_RENDERER:${path}`);
  report.backendBefore = current.restore.backend;
  report.css = { route, beforeSha: result.beforeSha, afterSha: result.afterSha, appendedBytes: Buffer.byteLength(result.afterCss) - Buffer.byteLength(result.beforeCss) };
  report.nonCssWorkerBytesUnchanged = true;
  report.nonCssWorkerSha = result.nonCssSha;
  report.configBeforeSha = current.restore.settingsSha;
  report.cronsBefore = cronsBefore;
  writeFileSync('audit/css/before-scorebar-frame.css', result.beforeCss);
  writeFileSync('audit/css/after-scorebar-frame.css', result.afterCss);
  const staged = await stageCurrentRail(current.version, settingsBefore, cronsBefore, result.after);
  for (const [path, hash] of Object.entries(staged.hashes)) if ('/' + path !== route) protectedFiles['/' + path] = hash;
  report.protectedFiles = protectedFiles;
  report.mirroredCurrentRailAssets = staged.hashes;
  save();
  wrangler(staged, true);
  report.previewUi = await frameUiCheck({ ...result, phase: 'preview' });
  save();
  assert.equal(await activeVersion(), current.restore.version, 'CONCURRENT_DEPLOY_AFTER_PREVIEW_STOP');
  assert.equal(sha(canonical(await api(`/scripts/${script}/settings`))), current.restore.settingsSha, 'CONCURRENT_SETTINGS_CHANGE_STOP');
  await verifyRailBase(staged);
  for (const [path, expected] of Object.entries(protectedFiles)) assert.equal(sha(await publicFile(path)), expected, `PUBLIC_ASSET_MOVED_BEFORE_UPLOAD_STOP:${path}`);
  assert.equal(sha(await publicFile(route, 'css')), result.beforeSha, 'CSS_MOVED_BEFORE_UPLOAD_STOP');
  assert.equal(canonical(await backend()), canonical(report.backendBefore), 'BACKEND_CHANGED_BEFORE_DEPLOY_STOP');
  assert.equal(await activeVersion(), current.restore.version, 'CONCURRENT_DEPLOY_BEFORE_UPLOAD_STOP');
  try {
    wrangler(staged);
    let candidate;
    for (let attempt = 0; attempt < 25; attempt++) {
      const active = await activeVersion();
      if (active !== current.restore.version) { assert(await owned(active), 'FOREIGN_ACTIVE_VERSION_STOP'); candidate = active; break; }
      await delay(1500);
    }
    assert(candidate, 'NO_OWNED_PRODUCTION_VERSION');
    report.candidateVersion = candidate;
    save();
    let visible = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (sha(await publicFile(route, 'css')) === result.afterSha) { visible = true; break; }
      await delay(1500);
    }
    assert(visible, 'SCOREBAR_FRAME_CSS_NOT_PUBLIC_STOP');
    for (const [path, expected] of Object.entries(protectedFiles)) assert.equal(sha(await publicFile(path)), expected, `UNRELATED_PUBLIC_BYTES_CHANGED_STOP:${path}`);
    report.protectedFilesVerified = Object.keys(protectedFiles).length;
    report.backendAfter = await backend();
    assert.equal(canonical(report.backendAfter), canonical(report.backendBefore), 'BACKEND_REVISION_CHANGED_STOP');
    const settingsAfter = await api(`/scripts/${script}/settings`);
    report.configAfterSha = sha(canonical(settingsAfter));
    report.configuration = verifyConfiguration(settingsBefore, settingsAfter);
    report.versionConfiguration = verifyVersionConfiguration(current.version, await getVersion(candidate));
    report.cronsAfter = await schedules();
    assert.equal(canonical(report.cronsAfter), canonical(cronsBefore), 'CRON_CHANGED_STOP');
    save();
    report.productionUi = await frameUiCheck({ ...result, phase: 'production' });
    assert.equal(await activeVersion(), candidate, 'FINAL_PRODUCTION_MOVED_STOP');
    assert(await owned(candidate), 'FINAL_MODULE_BYTES_CHANGED_STOP');
    report.finalVersion = candidate;
    report.result = 'SUCCESS';
    report.apiSignalOddsStatisticsUnchanged = true;
    report.existingCssBytesUnchanged = true;
    report.htmlJavascriptAndFourImagesUnchanged = true;
    report.completedAt = new Date().toISOString();
    save();
    console.log(`FINAL_PRODUCTION=${candidate}`);
    console.log('SCOREBAR_FRAME_SUCCESS');
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Ball46 Scorebar State Frames\n\nSUCCESS\n\nProduction: ${candidate}\n\nSix viewport/theme cases before and after. Four colors verified with isolated fixtures, live available states verified on Production. API/Signal/Odds/Statistics, all executable bytes, images, content and geometry unchanged.\n`);
  } catch (error) {
    try { await rollback(); } catch (rollbackError) { report.rollbackError = rollbackError.message; }
    throw error;
  }
} catch (error) {
  report.result = 'FAIL_STOPPED';
  report.error = error.message;
  save();
  console.error(error.stack);
  process.exitCode = 1;
}
