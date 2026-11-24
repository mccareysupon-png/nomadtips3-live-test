import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, get, hash, SITE, SIDECAR, TEST, version } from './cloudflare.mjs';
import { clientCode } from '../client.mjs';

const dir = new URL('.', import.meta.url);
const lock = JSON.parse(await readFile(process.env.RUNNER_TEMP + '/performance-inspection.json','utf8'));
const expected = process.env.EXPECTED_PRODUCTION_VERSION;
assert.equal(lock.site.version, expected, 'Production changed since approval scope was inspected');
assert.equal(lock.mainHash, process.env.EXPECTED_PRODUCTION_SOURCE_SHA, 'Production source changed');
assert.equal(lock.sandbox.version, '3fb81064-e764-4914-b7f2-4e4e5c192812', 'Test Worker no longer serves the verified build');
assert(lock.previewsEnabled, 'Inactive Production previews are unavailable');

const binding = 'B46_DAILY_PERFORMANCE';
const entryName = 'b46-performance-summary-entry-20261124.mjs';
const prefix = 'b46-performance-summary-20261124';
const viewPath = '/?view=signal';
const summaryPath = '/__ball46_performance/summary';
const scriptPath = '/__ball46_performance/card.js';
const originalScript = /<script id="b46-daily-performance-runtime">[\s\S]*?<\/script>/g;
const boot = /<script type="application\/json" id="b46-performance-summary-data">([\s\S]*?)<\/script><script defer src="\/__ball46_performance\/card.js"><\/script>/g;
const card = /<section id="ball46-daily-performance"[\s\S]*?FINAL · SETTLED ONLY<\/span>\s*<\/section><\/div><\/section>/g;
const originalAssets = [
  '/dashboard-v2-stage3-featured-facts-20261013a.js',
  '/singlepage-workspace-343.js',
  '/b46-statistics-fast-v1-20261116.js',
  '/longterm-performance-343.js',
  '/full-market-bookmaker-343.js',
];
const ledgerServices = ['nomadtips3-engine-343','ball46-shadow-receiver-production'];
const device = devices['Pixel 7'];
const userAgents = ['Mozilla/5.0 BALL46 Production QA', device.userAgent];
const sidecar = await active(SIDECAR);
assert.equal(sidecar.version, process.env.EXPECTED_SUMMARY_SERVICE_VERSION, 'Performance service version changed');
const protectedBefore = await Promise.all(ledgerServices.map(active));
const [base, settings, subdomain, schedules] = await Promise.all([
  version(SITE, expected), cloudflare('/scripts/' + SITE + '/settings'),
  cloudflare('/scripts/' + SITE + '/subdomain'), cloudflare('/scripts/' + SITE + '/schedules'),
]);

const report = { rollback: expected, previousDeployment: lock.site.deployment, sidecar: sidecar.version };
const save = () => writeFile(process.env.RUNNER_TEMP + '/performance-release-proof.json', JSON.stringify(report,null,2));
await save();

const getText = (host,path,userAgent) => eventually(async () =>
  (await get(host + path, {headers:{'user-agent':userAgent ?? userAgents[0]}})).text(),3,600);
const count = (html, pattern) => [...html.matchAll(pattern)].length;
function verifyMarkup(html) {
  assert.equal(count(html, boot),1,'Missing or duplicate Performance bootstrap');
  assert.equal(count(html, card),1,'Missing or duplicate Performance card');
  assert.equal(count(html, originalScript),0,'Legacy Performance runtime is still active');
  const view = JSON.parse([...html.matchAll(boot)][0][1]);
  assert(['current','saved'].includes(view.state) && /^\d+$/.test(view.fields['stat:today-win']), 'HTML lacks verified values');
  assert(html.includes('>' + view.fields['rate:today'] + '</strong>'));
  return view;
}

async function guard(id) {
  assert.equal((await active()).version,id,'Production Worker moved');
  assert.equal((await active(SIDECAR)).version,sidecar.version,'Performance service moved');
  for (const [i, service] of ledgerServices.entries()) {
    assert.equal((await active(service)).version,protectedBefore[i].version,service + ' moved');
  }
}

async function verifyAssets(host, baseline) {
  const current = await Promise.all(originalAssets.map(async path => hash(await getText(host,path))));
  assert.deepEqual(current,baseline,'Protected JS assets differ');
}

async function waitForSummary(host) {
  return eventually(async () => {
    const raw = await getText(host,summaryPath);
    const view = JSON.parse(raw);
    assert(Buffer.byteLength(raw) < 2000 && view.state === 'current' &&
      /^\d+$/.test(view.fields['stat:today-win']), 'Waiting for a verified Performance snapshot');
    return view;
  },35,4000);
}

async function browserQA(host) {
  const browser = await chromium.launch();
  try {
    // This browser cannot run the old aggregator or fetch a summary after load.
    const cold = await browser.newContext({javaScriptEnabled:false,viewport:{width:1440,height:900}});
    const page = await cold.newPage();
    await page.goto(host + viewPath,{waitUntil:'commit', timeout:25000});
    const selector = '#ball46-daily-performance [data-b46-stat="today-win"]';
    await page.locator(selector).waitFor({state:'visible',timeout:20000});
    assert.match(await page.locator(selector).textContent(),/^\d+$/);
    await cold.close();

    for (const {mobile,theme} of [
      {mobile:false,theme:'dark'}, {mobile:false,theme:'light'}, {mobile:true,theme:'dark'},
    ]) {
      const context = await browser.newContext(mobile ? device : {viewport:{width:1440,height:900}});
      const page = await context.newPage();
      await page.addInitScript(theme => localStorage.setItem('nomad343_dashboard_theme_v1', theme), theme);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (!['GET','HEAD'].includes(request.method()) || path === '/api/engine/statistics') return route.abort();
        return route.continue();
      });
      await page.goto(host + viewPath,{waitUntil:'domcontentloaded',timeout:25000});
      assert.equal(await page.locator('#ball46-daily-performance').count(),1);
      assert.match(await page.locator(selector).textContent(),/^\d+$/);
      assert.equal(await page.locator(selector).isVisible(),!mobile);
      await page.waitForFunction(expectedTheme => document.documentElement.dataset.theme === expectedTheme, theme, {timeout:8000});
      assert(!errors.some(message => /Performance|__name/.test(message)),errors.join('\n'));
      console.log('PERFORMANCE_BROWSER_QA',JSON.stringify({host,mobile,theme,verifiedFirstRender:true}));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function assign(id, message) {
  return cloudflare('/scripts/' + SITE + '/deployments','POST',{
    strategy:'percentage', versions:[{version_id:id,percentage:100}], annotations:{'workers/message':message},
  });
}

let candidate;
try {
  await guard(expected);
  assert.equal(hash(Buffer.from(base.modules.find(m=>m.name===base.main_module).content_base64,'base64')),lock.mainHash);
  assert.equal(count(await getText(DIRECT,viewPath),originalScript),1,'Production card source shifted');
  assert(!base.bindings.some(b=>b.name===binding),'Performance binding already exists');

  const assets = await Promise.all(originalAssets.map(async path=>hash(await getText(DIRECT,path))));
  const renderer = await readFile(new URL('production.mjs',dir),'utf8');
  const modules = [...base.modules, {
    name:entryName, content_type:'application/javascript+module',
    content_base64:Buffer.from(renderer.replaceAll('__ACTIVE_ENTRY__',base.main_module)).toString('base64'),
  }];
  for (const file of ['worker.mjs','summary.mjs','card.mjs','client.mjs']) {
    modules.push({
      name:prefix + '/' + file, content_type:'application/javascript+module',
      content_base64:(await readFile(new URL('../' + file, dir))).toString('base64'),
    });
  }
  assert.equal(new Set(modules.map(m=>m.name)).size,modules.length);
  const bindings = [...base.bindings, {name:binding,type:'service',service:SIDECAR,environment:'production'}];
  const metadata = {
    main_module:entryName, compatibility_date:base.compatibility_date,
    compatibility_flags:base.compatibility_flags ?? [],
    bindings: bindings.map(b=>b.type==='secret_text' ? {name:b.name,type:'inherit',version_id:expected} : b),
    keep_assets:true, assets:{config:base.assets.config},
    annotations:{'workers/message':'BALL46 Performance first-render summary only'},
  };
  for (const field of ['usage_model','logpush','limits','observability','placement','tail_consumers','tags']) {
    if (settings[field] != null) metadata[field] = settings[field];
  }
  await guard(expected);
  candidate = process.env.EXPECTED_CANDIDATE_VERSION;
  if (!candidate) {
    const form = new FormData();
    form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
    for (const m of modules) form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
    candidate = (await cloudflare('/scripts/' + SITE + '/versions?bindings_inherit=strict','POST',form)).id;
  }
  assert(candidate && candidate !== expected);
  report.candidate = candidate;
  await save();

  const actual = await eventually(()=>version(SITE,candidate));
  assert.equal(actual.main_module,entryName);
  assert.equal(actual.modules.length,modules.length);
  for (const m of modules) {
    const candidateModule = actual.modules.find(x=>x.name===m.name);
    assert(candidateModule && candidateModule.content_type===m.content_type &&
      hash(Buffer.from(candidateModule.content_base64,'base64'))===hash(Buffer.from(m.content_base64,'base64')),
    'Module diff ' + m.name);
  }
  assert.equal(actual.bindings.length,bindings.length);
  for (const b of bindings) {
    const deployed = actual.bindings.find(x=>x.name===b.name);
    assert(deployed && deployed.type===b.type,'Binding diff '+b.name);
    if (b.type!=='secret_text') assert.equal(canonical(deployed),canonical(b),'Binding diff '+b.name);
  }
  assert.equal(actual.compatibility_date,base.compatibility_date);
  assert.deepEqual(actual.compatibility_flags ?? [],base.compatibility_flags ?? []);
  assert.equal(canonical(actual.assets?.config),canonical(base.assets.config));
  console.log('ORIGINAL_MODULES_UNCHANGED',base.modules.length,'ORIGINAL_BINDINGS_UNCHANGED',base.bindings.length);

  const preview = 'https://' + candidate.slice(0,8) + '-' + SITE + '.mccarey-supon.workers.dev';
  console.log('INACTIVE_CANDIDATE',candidate,preview,'ROLLBACK',expected);
  await eventually(()=>getText(preview,scriptPath));
  const data = await waitForSummary(preview);
  assert.equal(await getText(preview,scriptPath),clientCode.replace('/__performance_test/summary',summaryPath));
  for (const ua of userAgents) {
    await eventually(async () => {
      const [legacy, html] = await Promise.all([getText(DIRECT,viewPath,ua),getText(preview,viewPath,ua)]);
      verifyMarkup(html);
      const before = legacy.replace(originalScript,'');
      const after = html.replace(boot,'').replace(card,'');
      if (before !== after) {
        let offset = 0;
        while (offset < Math.min(before.length,after.length) && before[offset] === after[offset]) offset++;
        throw new Error('HTML outside Performance differs at offset ' + offset +
          ' using ' + ua + ' ' + JSON.stringify({
            before:before.slice(Math.max(0,offset-35),offset+75),
            after:after.slice(Math.max(0,offset-35),offset+75),
          }));
      }
    }, 6, 2000);
  }
  await verifyAssets(preview,assets);
  await browserQA(preview);
  report.preDeploymentQA = {pc:true,mobile:true,originalModules:base.modules.length,originalBindings:base.bindings.length,
    summaryBytes:Buffer.byteLength(JSON.stringify(data))};
  await save();
  console.log('CANDIDATE_QA_PASS',JSON.stringify(report.preDeploymentQA));

  await guard(expected);
  const deployed = await assign(candidate,'BALL46 Performance summary first render');
  report.deployment = deployed.id;
  await save();
  await eventually(()=>guard(candidate));
  report.deployment = (await active()).deployment;
  report.version = candidate;

  for (const host of [DIRECT,DOMAIN,'https://www.ball46.com']) {
    await eventually(async ()=>verifyMarkup(await getText(host,viewPath)));
  }
  await waitForSummary(DOMAIN);
  await verifyAssets(DIRECT,assets);
  await browserQA(DOMAIN);
  await guard(candidate);
  const [laterSettings, laterSubdomain, laterSchedules] = await Promise.all([
    cloudflare('/scripts/' + SITE + '/settings'), cloudflare('/scripts/' + SITE + '/subdomain'),
    cloudflare('/scripts/' + SITE + '/schedules'),
  ]);
  for (const field of ['usage_model','logpush','limits','observability','placement','tail_consumers','compatibility_date','compatibility_flags','tags']) {
    assert.equal(canonical(laterSettings[field]),canonical(settings[field]),'Production settings changed: '+field);
  }
  assert.deepEqual(laterSubdomain,subdomain);
  assert.deepEqual(laterSchedules,schedules);
  report.productionQA='passed';
  console.log('PERFORMANCE_PRODUCTION_RELEASE',JSON.stringify(report));
  await save();
} catch (error) {
  report.error = error.message.split('\n')[0];
  const current = await active();
  if (candidate && current.version === candidate) {
    await assign(expected,'Automatic rollback: Performance verification failed');
    await eventually(async()=>assert.equal((await active()).version,expected));
    report.rolledBack = true;
  }
  console.log('PERFORMANCE_RELEASE_STOP',JSON.stringify(report));
  await save();
  throw error;
}
