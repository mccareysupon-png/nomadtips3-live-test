import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const env = process.env;
const origin = env.BALL46_URL || 'https://ball46.com';
const script = env.SCRIPT_NAME || 'ball46-production';
const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
const expectedBase = env.EXPECTED_BASE_VERSION;
assert(account && token, 'CLOUDFLARE_AUTH_MISSING');
assert.equal(script, 'ball46-production');
assert(expectedBase, 'EXPECTED_BASE_VERSION_REQUIRED');

const root = `https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const audit = 'audit-statistics-odds-20261003';
mkdirSync(audit, { recursive: true });
const report = { startedAt: new Date().toISOString(), scope: 'Statistics V2 odds-display wiring only; no API, statistics formula, signal logic, static asset set, or binding changes' };
const save = () => writeFileSync(`${audit}/report.json`, JSON.stringify(report, null, 2));
const sha = value => createHash('sha256').update(value).digest('hex');
const delay = ms => new Promise(r => setTimeout(r, ms));
const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b))) : v);

const oldLine = "root.querySelectorAll?.('td.odds').forEach(convertDirectElement);";
const newLine = "root.querySelectorAll?.('td.odds, [data-sp-table-body] > tr > td:nth-child(6), .odds-readonly').forEach(convertDirectElement);";
const helperMarker = 'B46_STATISTICS_ODDS_FORMAT_20261003';
const helper = `\n/* ${helperMarker}: transform only the existing public odds formatter response so current Statistics V2 joins the same DEC/FRA/AM preference. */\nasync function __b46OddsFormatForStatistics(request,env){\n  const response=await env.ASSETS.fetch(request);\n  if(!response.ok)return response;\n  const source=await response.text();\n  const before=${JSON.stringify(oldLine)};\n  const after=${JSON.stringify(newLine)};\n  const hits=source.split(before).length-1;\n  const body=hits===1?source.replace(before,after):source;\n  const headers=new Headers(response.headers);\n  headers.set('cache-control','no-store, no-cache, must-revalidate, max-age=0');\n  headers.set('pragma','no-cache');\n  headers.set('expires','0');\n  headers.set('x-ball46-odds-statistics','${helperMarker}');\n  headers.set('x-ball46-odds-statistics-source',hits===1?'patched':'source-mismatch');\n  headers.delete('content-length');\n  return new Response(body,{status:response.status,statusText:response.statusText,headers});\n}\n`;

async function api(path, options = {}) {
  const response = await fetch(root + path, { ...options, signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  const json = await response.json();
  assert(response.ok && json.success === true, `CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors || [])}`);
  return json.result;
}
async function active() {
  const r = await api(`/scripts/${script}/deployments?per_page=3`);
  const d = r.deployments?.[0];
  assert(d?.versions?.length === 1 && Number(d.versions[0].percentage) === 100, 'ACTIVE_NOT_SINGLE_100_PERCENT');
  return d.versions[0].version_id;
}
async function version(id) {
  const r = await api(`/workers/${script}/versions/${id}?include=modules`);
  assert(r?.main_module && r.modules?.length, 'ACTIVE_MODULES_MISSING');
  return r;
}
async function publicResponse(path) {
  const url = new URL(path, origin);
  url.searchParams.set('_b46oddsstat', `${env.GITHUB_RUN_ID || 'local'}-${Date.now()}-${Math.random()}`);
  const response = await fetch(url, { headers: { 'Cache-Control':'no-cache' }, signal: AbortSignal.timeout(45000) });
  assert(response.ok, `PUBLIC_HTTP:${path}:${response.status}`);
  return response;
}
async function publicText(path) { return await (await publicResponse(path)).text(); }
async function backend() {
  const paths = ['/api/engine/health','/api/full-market/health','/api/engine/statistics'];
  const values = [];
  for (const p of paths) values.push(JSON.parse(await publicText(p)));
  assert(values.every(v => v.ok === true), 'BACKEND_NOT_OK');
  return { engine: values[0].version, fullMarket: values[1].version, settlementRevision: values[2].settlementRevision };
}
function patchModule(source) {
  assert(!source.includes(helperMarker), 'PATCH_ALREADY_PRESENT');
  const exportNeedle = 'export default {...__B46_BASE_WORKER__';
  assert.equal(source.split(exportNeedle).length - 1, 1, 'FINAL_EXPORT_NOT_UNIQUE');
  const gateOld = "if(request.method==='GET'){const __b46ScorebarBg=__b46ScorebarBgResponse(url.pathname);if(__b46ScorebarBg)return __b46ScorebarBg;";
  const gateNew = gateOld + "if(url.pathname==='/odds-format-343.js')return __b46OddsFormatForStatistics(request,env);";
  assert.equal(source.split(gateOld).length - 1, 1, 'FINAL_FETCH_GATE_NOT_UNIQUE');
  let after = source.replace(exportNeedle, helper + exportNeedle);
  after = after.replace(gateOld, gateNew);
  assert(after.includes(helperMarker), 'HELPER_NOT_INSERTED');
  assert(after.includes("url.pathname==='/odds-format-343.js'"), 'ODDS_ROUTE_NOT_INSERTED');
  assert.equal(after.length - source.length, helper.length + gateNew.length - gateOld.length, 'UNEXPECTED_MODULE_DELTA');
  return after;
}
function moduleList(v, mainSourceOverride = null) {
  return v.modules.map(m => ({ name:m.name, type:m.content_type, sha:sha(m.name === v.main_module && mainSourceOverride !== null ? Buffer.from(mainSourceOverride) : Buffer.from(m.content_base64,'base64')) })).sort((a,b)=>a.name.localeCompare(b.name));
}
async function uiCheck(phase, patchedAsset = null) {
  const browser = await chromium.launch();
  const rows = [];
  try {
    for (const viewport of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]) {
      const context = await browser.newContext({ viewport:{width:viewport.width,height:viewport.height}, timezoneId:'Asia/Bangkok' });
      await context.addInitScript(() => localStorage.setItem('nomad343_odds_format_v1','decimal'));
      const page = await context.newPage();
      if (phase === 'preview') {
        assert(patchedAsset, 'PREVIEW_ASSET_REQUIRED');
        await page.route('**/odds-format-343.js*', route => route.fulfill({ status:200, contentType:'application/javascript; charset=utf-8', body:patchedAsset }));
      }
      await page.route('**/api/**', async route => {
        if (!['GET','HEAD'].includes(route.request().method())) return route.abort('blockedbyclient');
        return route.continue();
      });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const response = await page.goto(new URL('/index.html?view=statistics',origin).href,{waitUntil:'domcontentloaded',timeout:45000});
      assert(response?.ok(), `STATISTICS_HTTP:${viewport.name}`);
      await page.waitForFunction(() => document.body?.dataset?.workspaceView === 'statistics' && window.NOMAD343_ODDS && document.querySelector('[data-sp-table-body]'), null, {timeout:30000});
      const result = await page.evaluate(() => {
        const body=document.querySelector('[data-sp-table-body]');
        const realCells=[...body.querySelectorAll(':scope > tr > td:nth-child(6)')];
        let cell=realCells.find(el=>{const n=Number(el.dataset.nomadOddsRaw || el.textContent.trim());return Number.isFinite(n)&&n>1;});
        let synthetic=false;
        if(!cell){
          const tr=document.createElement('tr');
          tr.dataset.b46OddsQa='1';
          tr.style.display='none';
          tr.innerHTML='<td>x</td><td>x</td><td>x</td><td>x</td><td>x</td><td>1.75</td><td>x</td><td>x</td><td>x</td><td>x</td>';
          body.appendChild(tr);
          cell=tr.children[5];
          synthetic=true;
        }
        window.NOMAD343_ODDS.refresh();
        const raw=cell.dataset.nomadOddsRaw || cell.textContent.trim();
        const out={raw,realCellCount:realCells.length,synthetic,storageKey:'nomad343_odds_format_v1'};
        for(const kind of ['fractional','american','decimal']){
          window.NOMAD343_ODDS.setFormat(kind);
          out[kind]={display:cell.textContent.trim(),expected:window.NOMAD343_ODDS.formatOdds(raw,kind),stored:localStorage.getItem('nomad343_odds_format_v1')};
        }
        document.querySelector('[data-b46-odds-qa]')?.remove();
        return out;
      });
      for (const kind of ['fractional','american','decimal']) {
        assert.equal(result[kind].display, result[kind].expected, `STATISTICS_FORMAT_DISPLAY:${viewport.name}:${kind}`);
        assert.equal(result[kind].stored, kind, `STATISTICS_FORMAT_STORAGE:${viewport.name}:${kind}`);
      }
      assert.equal(errors.length,0,`STATISTICS_PAGE_ERRORS:${viewport.name}:${errors.join(';')}`);
      rows.push({viewport:viewport.name,...result,pageErrors:errors});
      await context.close();
    }
  } finally { await browser.close(); }
  writeFileSync(`${audit}/ui-${phase}.json`,JSON.stringify(rows,null,2));
  console.log(`UI_${phase.toUpperCase()}_PASS cases=${rows.length}`);
  return rows;
}

let base, candidate, expectedModules;
async function isOurVersion(id) {
  const v = await version(id);
  return v.main_module === expectedModules.main && canonical(moduleList(v)) === canonical(expectedModules.list);
}
async function rollback() {
  const now = await active();
  if (now === base) { report.rollback={status:'base-still-active',version:base}; return; }
  if (!expectedModules || !await isOurVersion(now)) { report.rollback={status:'skipped-foreign-deployment',version:now}; return; }
  await api(`/scripts/${script}/deployments`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ strategy:'percentage', versions:[{version_id:base,percentage:100}], annotations:{'workers/message':`Rollback Statistics odds wiring ${env.GITHUB_RUN_ID || ''}`} }) });
  assert.equal(await active(),base,'ROLLBACK_NOT_CONFIRMED');
  report.rollback={status:'confirmed',version:base};
}

try {
  base = await active();
  report.baseVersion = base;
  assert.equal(base, expectedBase, 'PRODUCTION_CHANGED_SINCE_REVIEW');
  const original = await version(base);
  const settingsBefore = await api(`/scripts/${script}/settings`);
  report.configBeforeSha = sha(canonical(settingsBefore));
  report.backendBefore = await backend();
  report.assetsConfigBefore = original.assets || null;
  report.bindingsBefore = original.bindings || [];

  const main = original.modules.find(m=>m.name===original.main_module);
  assert(main,'MAIN_MODULE_NOT_FOUND');
  const source = Buffer.from(main.content_base64,'base64').toString('utf8');
  const after = patchModule(source);
  report.mainBeforeSha = sha(source);
  report.mainAfterSha = sha(after);

  const liveAsset = await publicText('/odds-format-343.js');
  assert.equal(liveAsset.split(oldLine).length - 1,1,'CURRENT_ODDS_SELECTOR_NOT_EXACTLY_ONCE');
  assert.equal(liveAsset.split(newLine).length - 1,0,'CURRENT_ODDS_SELECTOR_ALREADY_PATCHED');
  const patchedAsset = liveAsset.replace(oldLine,newLine);
  assert.equal(patchedAsset.length - liveAsset.length,newLine.length-oldLine.length,'UNEXPECTED_ASSET_DELTA');
  report.oddsAssetBeforeSha = sha(liveAsset);
  report.oddsAssetExpectedSha = sha(patchedAsset);
  writeFileSync(`${audit}/odds-format-before.js`,liveAsset);
  writeFileSync(`${audit}/odds-format-expected.js`,patchedAsset);

  const protectedPaths=['/index.html','/settings.html','/statistics-next.js?v=343-next-production-v1','/settings.js?v=343-allmarkets-v1','/singlepage-workspace-343.js?v=343-singlepage-20260922-signal-shared','/dashboard-v2-stage3.js?v=343-scorebar-details-20260929a'];
  const protectedBefore={};
  for(const p of protectedPaths) protectedBefore[p]=sha(await publicText(p));
  report.protectedBefore=protectedBefore;

  expectedModules={main:original.main_module,list:moduleList(original,after)};
  report.expectedModules=expectedModules.list;
  save();

  await uiCheck('preview',patchedAsset);
  assert.equal(await active(),base,'ABORT_CONCURRENT_DEPLOY_AFTER_PREVIEW');
  assert.equal(canonical(await api(`/scripts/${script}/settings`)),canonical(settingsBefore),'CONFIG_CHANGED_BEFORE_DEPLOY');

  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify({main_module:original.main_module})],{type:'application/json'}));
  for(const module of original.modules){
    const bytes=module.name===original.main_module?Buffer.from(after):Buffer.from(module.content_base64,'base64');
    form.set(module.name,new Blob([bytes],{type:module.content_type}),module.name);
  }
  try {
    await api(`/scripts/${script}/content`,{method:'PUT',body:form});
    for(let n=0;n<25;n++){
      const id=await active();
      if(id!==base){assert(await isOurVersion(id),'FOREIGN_CANDIDATE');candidate=id;break;}
      await delay(2000);
    }
    assert(candidate,'NO_OWNED_CANDIDATE');
    report.candidateVersion=candidate;
    save();

    let publicOk=false, patchedResponseHeaders={};
    for(let n=0;n<20;n++){
      const r=await publicResponse('/odds-format-343.js');
      const text=await r.text();
      if(text===patchedAsset){
        publicOk=true;
        patchedResponseHeaders={patch:r.headers.get('x-ball46-odds-statistics'),source:r.headers.get('x-ball46-odds-statistics-source')};
        break;
      }
      await delay(2000);
    }
    assert(publicOk,'PUBLIC_ODDS_FORMAT_PATCH_MISMATCH');
    assert.equal(patchedResponseHeaders.patch,helperMarker,'PUBLIC_PATCH_HEADER_MISSING');
    assert.equal(patchedResponseHeaders.source,'patched','PUBLIC_PATCH_SOURCE_MISMATCH');
    report.publicPatchHeaders=patchedResponseHeaders;

    for(const [p,want] of Object.entries(protectedBefore)) assert.equal(sha(await publicText(p)),want,`PROTECTED_PUBLIC_ASSET_CHANGED:${p}`);
    const finalVersion=await version(candidate);
    assert.equal(canonical(finalVersion.assets||null),canonical(original.assets||null),'ASSET_CONFIG_CHANGED');
    assert.equal(canonical(finalVersion.bindings||[]),canonical(original.bindings||[]),'BINDINGS_CHANGED');
    report.configAfterSha=sha(canonical(await api(`/scripts/${script}/settings`)));
    assert.equal(report.configAfterSha,report.configBeforeSha,'WORKER_CONFIG_CHANGED');
    report.backendAfter=await backend();
    assert.equal(canonical(report.backendAfter),canonical(report.backendBefore),'BACKEND_REVISION_CHANGED');

    await uiCheck('production');
    assert.equal(await active(),candidate,'FINAL_PRODUCTION_CHANGED');
    report.finalVersion=candidate;
    report.result='SUCCESS';
    report.completedAt=new Date().toISOString();
    save();
    console.log(`FINAL_PRODUCTION=${candidate}`);
    console.log('STATISTICS_ODDS_DEC_FRA_AM=PASS');
  } catch(error) {
    try{await rollback();save();}catch(rb){report.rollbackError=rb.message;save();}
    throw error;
  }
  if(env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY,`## Ball46 Statistics Odds wiring\n\nResult: ${report.result}\n\nBase: ${base}\n\nFinal: ${report.finalVersion}\n\nDEC/FRA/AM on current Statistics V2: PASS\n\nScope: one exact GET route response transform for /odds-format-343.js; static asset set, APIs, bindings, Statistics renderer and formulas unchanged.\n`);
} catch(error) {
  report.result='FAIL';report.error=error.message;report.completedAt=new Date().toISOString();save();console.error(error.stack);process.exitCode=1;
}
