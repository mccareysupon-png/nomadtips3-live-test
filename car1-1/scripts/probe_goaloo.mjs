import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const URL = 'https://free.goaloo188.com/free/freesoccer';
const OUT = 'car1-1/data/goaloo-probe.json';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1200 },
  locale: 'en-US',
  timezoneId: 'Asia/Bangkok',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 NOMADTIPS3/1.1'
});

const startedAt = new Date().toISOString();
let status = null;
let error = null;
try {
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  status = response?.status() ?? null;
  await page.waitForTimeout(15000);
} catch (e) {
  error = String(e?.stack || e);
}

const payload = await page.evaluate(() => {
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const attrs = (el) => Object.fromEntries([...el.attributes].map(a => [a.name, a.value]));
  const rows = [...document.querySelectorAll('tr')].map((tr, index) => ({
    index,
    text: clean(tr.innerText || tr.textContent),
    attrs: attrs(tr),
    links: [...tr.querySelectorAll('a')].map(a => ({ text: clean(a.innerText || a.textContent), href: a.href, attrs: attrs(a) })),
    cells: [...tr.querySelectorAll('td,th')].map(td => ({ text: clean(td.innerText || td.textContent), attrs: attrs(td) })),
    html: tr.outerHTML.slice(0, 6000)
  })).filter(r => r.text || r.links.length);

  return {
    title: document.title,
    url: location.href,
    bodyText: clean(document.body?.innerText).slice(0, 100000),
    rowCount: rows.length,
    rows,
    anchors: [...document.querySelectorAll('a')].slice(0, 500).map(a => ({ text: clean(a.innerText || a.textContent), href: a.href, attrs: attrs(a) })),
    scripts: [...document.scripts].map(s => s.src).filter(Boolean).slice(0, 100)
  };
});

await fs.mkdir('car1-1/data', { recursive: true });
await fs.writeFile(OUT, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), httpStatus: status, navigationError: error, ...payload }, null, 2) + '\n');
console.log(`Goaloo probe: status=${status} rows=${payload.rowCount} title=${payload.title}`);
await browser.close();
