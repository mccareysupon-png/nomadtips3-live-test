import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { crossDeviceOddsScript, crossDeviceOddsStyles } from '../crossdevice.mjs';
import { active, canonical, cloudflare, DIRECT, DOMAIN, eventually, get, hash, SIDECAR, SITE, TEST, version } from './cloudflare.mjs';

const expected = '6c51f3de-ad55-4156-ab75-5dffa22e3aa5';
const sandboxVersion = '72d32899-3a83-47bc-84a1-8d6ccbf77a6a';
const entryName = 'b46-crossdevice-odds-entry-20261124.mjs';
const moduleName = 'b46-crossdevice-odds-20261123.mjs';
const pagePath = '/?view=signal';
const header = 'x-b46-default-odds-movement';
const revision = 'single-controller-v4';
const device = devices['Pixel 7'];
const protectedServices = ['nomadtips3-engine-343','ball46-shadow-receiver-production',SIDECAR,TEST];
const originalAssets = [
  '/dashboard-v2-stage3-featured-facts-20261013a.js', '/singlepage-workspace-343.js',
  '/full-market-bookmaker-343.js', '/expanded-match-343.js', '/__ball46_performance/card.js',
];
const scriptTag = /<script id="b46-odds-flash-runtime-production">([\s\S]*?)<\/script>/g;
const styleTag = /<style id="b46-odds-flash-production">([\s\S]*?)<\/style>/g;
const scoreSnapshot = /(<script type="application\/json" id="b46-performance-summary-data">)[\s\S]*?(<\/script>)/;
const scoreCard = /<section id="ball46-daily-performance"[\s\S]*?FINAL · SETTLED ONLY<\/span>\s*<\/section><\/div><\/section>/;

const baseline = await active();
const report = {rollback:baseline.version,previousDeployment:baseline.deployment};
const proof = () => writeFile(process.env.RUNNER_TEMP + '/default-odds-release-proof.json',JSON.stringify(report,null,2));
await proof();
assert.equal(baseline.version,expected,'Production changed since the Performance deployment');
const [base, settings, subdomain, schedules, ...protectedBefore] = await Promise.all([
  version(SITE,expected), cloudflare('/scripts/' + SITE + '/settings'),
  cloudflare('/scripts/' + SITE + '/subdomain'), cloudflare('/scripts/' + SITE + '/schedules'),
  ...protectedServices.map(active),
]);
assert(subdomain.previews_enabled,'Inactive Production preview unavailable');
assert.equal(protectedBefore.at(-1).version,sandboxVersion,'Verified sandbox has changed');
assert(base.bindings.some(b=>b.name==='B46_DAILY_PERFORMANCE' && b.service===SIDECAR),'Performance binding missing');
assert(base.main_module && base.modules.some(m=>m.name===base.main_module && m.content_base64),'Production source missing');
report.originalModules=base.modules.length;
report.originalBindings=base.bindings.length;
report.originalMain=base.main_module;
report.originalMainHash=hash(Buffer.from(base.modules.find(m=>m.name===base.main_module).content_base64,'base64'));
console.log('ODDS_RELEASE_BASELINE',JSON.stringify(report));
await proof();

async function guard(id) {
  const [site,...others] = await Promise.all([active(),...protectedServices.map(active)]);
  assert.equal(site.version,id,'Production Worker moved');
  for (const [i, other] of others.entries()) {
    assert.equal(other.version,protectedBefore[i].version,protectedServices[i] + ' moved');
  }
  return site;
}

const text = (host,path,userAgent='Mozilla/5.0 BALL46 Odds QA') =>
  eventually(async ()=>(await get(host+path,{headers:{'user-agent':userAgent}})).text(),3,800);

function pageOutsideOdds(html) {
  assert(scoreSnapshot.test(html),'Performance snapshot missing from HTML');
  assert(scoreCard.test(html),'Performance card missing from HTML');
  // The source and candidate can receive two consecutive valid Performance snapshots.
  return html.replace(scriptTag,'').replace(styleTag,'').replace(scoreSnapshot,'$1$2').replace(scoreCard,card =>
    card.replace(/data-b46-performance-state="[^"]+"(?: data-b46-performance-updated-at="\d+")?/,
      'data-b46-performance-state="dynamic"')
      .replace(/ data-b46-rate-tone="[^"]+"/g,'')
      .replace(/(data-b46-(?:stat|label|rate|avg-odds|total)="[^"]+">)[^<]*(<)/g,'$1$2'));
}

async function checkPage(host, userAgent='Mozilla/5.0 BALL46 Odds QA') {
  const response = await get(host+pagePath,{headers:{'user-agent':userAgent}});
  assert.equal(response.headers.get(header),revision,'Odds release header missing');
  assert.equal(response.headers.get('x-b46-daily-performance'),'daily-performance-summary-v1');
  const html = await response.text();
  const scripts = [...html.matchAll(scriptTag)];
  const styles = [...html.matchAll(styleTag)];
  assert.equal(scripts.length,1,'Expected exactly one Default Odds controller');
  assert.equal(styles.length,1,'Expected exactly one Default Odds stylesheet');
  assert(scripts[0][1]===crossDeviceOddsScript,'Published script differs from reviewed test');
  assert(styles[0][1]===crossDeviceOddsStyles,'Published stylesheet differs from reviewed test');
  assert(!html.includes('id="b46-cross-device-odds-v3-test-js"'));
  return html;
}

async function compareHtml(preview) {
  for (const ua of ['Mozilla/5.0 BALL46 Odds QA',device.userAgent]) {
    await eventually(async()=>{
      const [original, candidate] = await Promise.all([text(DIRECT,pagePath,ua),checkPage(preview,ua)]);
      const before = pageOutsideOdds(original);
      const after = pageOutsideOdds(candidate);
      if (before!==after) {
        let offset = 0;
        while (offset < Math.min(before.length,after.length) && before[offset]===after[offset]) offset++;
        throw new Error('HTML outside Odds differs at ' + offset + ': ' + JSON.stringify({
          before:before.slice(Math.max(0,offset-25),offset+65),
          after:after.slice(Math.max(0,offset-25),offset+65),
        }));
      }
    },6,2000);
  }
}

async function health(host) {
  const paths = ['/api/engine/health','/api/full-market/health','/api/engine/statistics?paged=1','/__ball46_performance/summary'];
  return Promise.all(paths.map(path=>eventually(async()=>{
    const data = JSON.parse(await text(host,path));
    if (path.startsWith('/__')) {
      assert(['current','saved'].includes(data.state) && /^\d+$/.test(data.fields?.['stat:today-win']),'Verified Performance values unavailable');
      return {performance:true};
    }
    assert(data.ok,path+' is unavailable');
    return {version:data.version,statisticsSource:data.statisticsSource};
  },4,1800)));
}

async function browserQA(host) {
  const browser = await chromium.launch();
  try {
    for (const {mobile, theme} of [
      {mobile:false,theme:'dark'}, {mobile:false,theme:'light'},
      {mobile:true,theme:'dark'}, {mobile:true,theme:'light'},
    ]) {
      const context = await browser.newContext(mobile ? device : {viewport:{width:1440,height:900}});
      const page = await context.newPage();
      await page.addInitScript(t=>localStorage.setItem('nomad343_dashboard_theme_v1',t),theme);
      const errors = [];
      page.on('pageerror', error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const r=route.request();
        if (!['GET','HEAD'].includes(r.method()) || new URL(r.url()).pathname==='/api/engine/statistics') return route.abort();
        return route.continue();
      });
      await page.goto(host+pagePath,{waitUntil:'domcontentloaded',timeout:35000});
      await page.waitForFunction(t=>window.__b46OddsCrossDeviceStats?.ready&&document.documentElement.dataset.theme===t,theme,{timeout:15000});
      assert.equal(await page.locator('#ball46-daily-performance').count(),1);
      assert(!await page.evaluate(()=>window.__b46OddsMovementV1),'Legacy movement runtime still executed');
      assert(!errors.some(message=>/installOddsMovement|__name/.test(message)),errors.join('\n'));
      console.log('ODDS_BROWSER_QA',JSON.stringify({host,mobile,theme}));
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

async function assets(host) {
  return Promise.all(originalAssets.map(async path=>hash(await text(host,path))));
}

async function assign(id,message) {
  return cloudflare('/scripts/' + SITE + '/deployments','POST',{
    strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message},
  });
}

let candidate;
try {
  await guard(expected);
  const original = await text(DIRECT,pagePath);
  assert.equal([...original.matchAll(scriptTag)].length,1,'Legacy script anchor changed');
  assert.equal([...original.matchAll(styleTag)].length,1,'Legacy style anchor changed');
  assert(original.includes('__b46OddsMovementV1') && !original.includes(crossDeviceOddsScript));
  const [oldAssets,oldHealth] = await Promise.all([assets(DIRECT),health(DIRECT)]);
  const wrapper = (await readFile(new URL('production.mjs',import.meta.url),'utf8')).replaceAll('__ACTIVE_ENTRY__',base.main_module);
  const modules = [...base.modules,
    {name:entryName,content_type:'application/javascript+module',content_base64:Buffer.from(wrapper).toString('base64')},
    {name:moduleName,content_type:'application/javascript+module',content_base64:(await readFile(new URL('../crossdevice.mjs',import.meta.url))).toString('base64')},
  ];
  assert.equal(new Set(modules.map(m=>m.name)).size,modules.length,'Overlapping module names');
  const metadata = {
    main_module:entryName,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags ?? [],
    bindings:base.bindings.map(b=>b.type==='secret_text' ? {name:b.name,type:'inherit',version_id:expected} : b),
    keep_assets:true,assets:{config:base.assets.config},
    annotations:{'workers/message':'Default Odds Movement V3 across devices only'},
  };
  for (const key of ['usage_model','logpush','limits','observability','placement','tail_consumers','tags']) {
    if (settings[key]!=null) metadata[key]=settings[key];
  }
  const form = new FormData();
  form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for (const m of modules) form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
  await guard(expected);
  candidate=(await cloudflare('/scripts/' + SITE + '/versions?bindings_inherit=strict','POST',form)).id;
  assert(candidate && candidate!==expected);
  report.candidate=candidate;
  await proof();

  const staged=await eventually(()=>version(SITE,candidate));
  assert.equal(staged.main_module,entryName);
  assert.equal(staged.modules.length,modules.length);
  for (const m of modules) {
    const got=staged.modules.find(x=>x.name===m.name);
    assert(got && got.content_type===m.content_type &&
      hash(Buffer.from(got.content_base64,'base64'))===hash(Buffer.from(m.content_base64,'base64')),'Module diff '+m.name);
  }
  assert.equal(staged.bindings.length,base.bindings.length);
  for (const b of base.bindings) {
    const match=staged.bindings.find(x=>x.name===b.name);
    assert(match && match.type===b.type,'Missing binding '+b.name);
    if (b.type!=='secret_text') assert.equal(canonical(match),canonical(b),'Binding diff '+b.name);
  }
  assert.equal(staged.compatibility_date,base.compatibility_date);
  assert.deepEqual(staged.compatibility_flags ?? [],base.compatibility_flags ?? []);
  assert.equal(canonical(staged.assets?.config),canonical(base.assets?.config));
  const preview='https://'+candidate.slice(0,8)+'-'+SITE+'.mccarey-supon.workers.dev';
  console.log('INACTIVE_ODDS_CANDIDATE',candidate,preview);
  await eventually(()=>checkPage(preview));
  await compareHtml(preview);
  assert.deepEqual(await assets(preview),oldAssets,'Original asset content changed');
  assert.deepEqual(await health(preview),oldHealth,'API contract changed');
  await browserQA(preview);
  report.candidateQA='passed';
  await proof();

  await guard(expected);
  const activation=await assign(candidate,'BALL46 Default Odds Movement V3 cross-device release');
  report.deployment=activation.id;
  await proof();
  report.deployment=(await eventually(()=>guard(candidate))).deployment;
  report.version=candidate;
  for (const host of [DIRECT,DOMAIN,'https://www.ball46.com']) await eventually(()=>checkPage(host));
  assert.deepEqual(await assets(DIRECT),oldAssets,'Production asset content changed');
  assert.deepEqual(await health(DOMAIN),oldHealth,'Production API contract changed');
  await browserQA(DOMAIN);
  await guard(candidate);
  const [later, laterSubdomain,laterSchedules]=await Promise.all([
    cloudflare('/scripts/'+SITE+'/settings'),cloudflare('/scripts/'+SITE+'/subdomain'),cloudflare('/scripts/'+SITE+'/schedules'),
  ]);
  for (const field of ['usage_model','logpush','limits','observability','placement','tail_consumers','compatibility_date','compatibility_flags','tags']) {
    assert.equal(canonical(later[field]),canonical(settings[field]),'Settings changed: '+field);
  }
  assert.deepEqual(laterSubdomain,subdomain);
  assert.deepEqual(laterSchedules,schedules);
  report.productionQA='passed';
  await proof();
  console.log('DEFAULT_ODDS_PRODUCTION_RELEASE',JSON.stringify(report));
} catch (error) {
  report.error=error.message.split('\n')[0];
  if (candidate && (await active()).version===candidate) {
    await assign(expected,'Automatic rollback: Default Odds verification failed');
    await eventually(async()=>assert.equal((await active()).version,expected));
    report.rolledBack=true;
  }
  await proof();
  console.log('DEFAULT_ODDS_RELEASE_STOP',JSON.stringify(report));
  throw error;
}
