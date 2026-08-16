import { chromium } from 'playwright';
import fs from 'node:fs';

const current = JSON.parse(fs.readFileSync('data/prematch-current.json','utf8'));
const src = current.matches || [];
if (src.length < 3) throw new Error('need at least three current matches for chart smoke');
const clone = x => JSON.parse(JSON.stringify(x));
const total = Math.min(30, Math.max(24, src.length));
const synthetic = Array.from({length: total}, (_, i) => {
  const m = clone(src[i % src.length]);
  m.fixtureId = `TREND-${i}-${m.fixtureId}`;
  const mode = i % 3;
  const side = String(m.pickSide || 'home').toLowerCase();
  if (mode === 0) {
    m.status = 'WIN';
    m.finalScore = side === 'home' ? '2-0' : '0-2';
    m.matchResult = side === 'home' ? 'HOME' : 'AWAY';
  } else if (mode === 1) {
    m.status = 'LOSS';
    m.finalScore = side === 'home' ? '0-2' : '2-0';
    m.matchResult = side === 'home' ? 'AWAY' : 'HOME';
  } else {
    m.status = 'LOSS';
    m.finalScore = '1-1';
    m.matchResult = 'DRAW';
  }
  m.settledAtUtc = new Date(Date.now() - (total - i) * 60000).toISOString();
  return m;
});
const fakeHistory = [{selectionDate:'TREND-SMOKE', generatedAtUtc:new Date().toISOString(), matches:synthetic}];

const browser = await chromium.launch({headless:true});
for (const [name,width,height] of [['desktop',1920,1080],['tablet',768,1024],['mobile',390,844]]) {
  const page = await browser.newPage({viewport:{width,height}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/data/prematch-history.json*', r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fakeHistory)}));
  await page.goto('http://127.0.0.1:8000/', {waitUntil:'networkidle'});
  await page.locator('.nav button[data-view="stats"]').click();
  await page.waitForTimeout(140);
  const state = await page.evaluate(() => {
    const d = outcomeChartData();
    const c = document.querySelector('#outcomeChart');
    const last = d[d.length - 1];
    return {
      len:d.length,
      last,
      w:c.width,
      h:c.height,
      cssW:c.getBoundingClientRect().width,
      summary:document.querySelector('#trendSummary')?.innerText || '',
      overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  if (state.len < 20 || !state.last?.win || !state.last?.loss || !state.last?.draw) throw new Error(`${name}: incomplete chart ${JSON.stringify(state.last)}`);
  if (state.w < 250 || state.h < 180 || state.cssW < 250) throw new Error(`${name}: chart too small ${state.w}x${state.h} css=${state.cssW}`);
  if (state.overflow > 2) throw new Error(`${name}: overflow ${state.overflow}`);
  if (!/WIN/.test(state.summary) || !/LOSS/.test(state.summary) || !/DRAW/.test(state.summary)) throw new Error(`${name}: summary missing ${state.summary}`);
  const blank = await page.locator('#outcomeChart').evaluate(c => !c.getContext('2d').getImageData(0,0,Math.min(c.width,500),Math.min(c.height,300)).data.some(v=>v!==0));
  if (blank) throw new Error(`${name}: blank chart`);
  if (errors.length) throw new Error(`${name}: ${errors.join(' | ')}`);
  console.log(`PASS ${name} trend points=${state.len} ${state.summary}`);
  await page.close();
}
await browser.close();
