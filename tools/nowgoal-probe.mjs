const pages = [
  'https://www.nowgoal.net/',
  'https://www.nowgoal.net/oddscomp/2607086',
  'https://www.nowgoal.net/asian-handicap-odds/2607086',
  'https://free1.nowgoal.plus/free/freesoccer',
];

const headers = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/javascript,text/javascript,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'pragma': 'no-cache',
};

const interesting = /(odds|handicap|in-?play|1xbet|companyid|matchid|asian|socket|signalr|websocket|xhr|ajax|api)/i;
const endpointish = /(?:https?:\\?\/\\?\/[^\s"'`<>]+|\/[A-Za-z0-9_./?=&%{}:-]{5,})/g;

function uniq(values) { return [...new Set(values)]; }
function clean(value) { return String(value || '').replace(/\\u0026/g, '&').replace(/\\\//g, '/'); }

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {headers, redirect:'follow', signal:controller.signal});
    const text = await res.text();
    return {url: res.url, status: res.status, contentType: res.headers.get('content-type') || '', text};
  } finally { clearTimeout(timer); }
}

function scriptUrls(html, base) {
  const out = [];
  for (const match of html.matchAll(/<script\\b[^>]*\\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    try { out.push(new URL(clean(match[1]), base).href); } catch {}
  }
  return uniq(out);
}

function snippets(text, term, radius=220) {
  const lower = text.toLowerCase(), needle = term.toLowerCase(), out=[];
  let at = 0;
  while ((at = lower.indexOf(needle, at)) >= 0 && out.length < 8) {
    out.push(text.slice(Math.max(0,at-radius), Math.min(text.length,at+needle.length+radius)).replace(/\s+/g,' '));
    at += needle.length;
  }
  return out;
}

function candidates(text) {
  const raw = text.match(endpointish) || [];
  return uniq(raw.map(clean).filter(v => interesting.test(v))).slice(0, 250);
}

const fetchedAssets = new Set();
const assetFindings = [];

for (const page of pages) {
  try {
    const doc = await get(page);
    console.log(`\n=== PAGE ${page} ===`);
    console.log(`STATUS ${doc.status} FINAL ${doc.url} TYPE ${doc.contentType} BYTES ${doc.text.length}`);
    const scripts = scriptUrls(doc.text, doc.url);
    console.log(`SCRIPTS ${scripts.length}`);
    for (const src of scripts) console.log(`SCRIPT ${src}`);
    for (const term of ['1xBet','odds','handicap','api','fetch(','XMLHttpRequest','ajax','__NEXT_DATA__']) {
      const hits = snippets(doc.text, term);
      for (const hit of hits) console.log(`HTML_HIT ${term} :: ${hit}`);
    }
    for (const c of candidates(doc.text)) console.log(`HTML_CANDIDATE ${c}`);

    for (const src of scripts.slice(0,40)) {
      if (fetchedAssets.has(src)) continue;
      fetchedAssets.add(src);
      try {
        const asset = await get(src);
        if (asset.status !== 200 || asset.text.length > 4_000_000) continue;
        const hasInterest = interesting.test(asset.text) || /fetch\\(|XMLHttpRequest|\\.ajax\\(|axios|WebSocket/i.test(asset.text);
        if (!hasInterest) continue;
        const found = candidates(asset.text);
        const hits = [];
        for (const term of ['1xBet','companyId','matchId','odds','handicap','inplay','fetch(','XMLHttpRequest','ajax','WebSocket']) {
          hits.push(...snippets(asset.text, term, 180).map(text=>({term,text})));
        }
        assetFindings.push({src,status:asset.status,bytes:asset.text.length,found:found.slice(0,100),hits:hits.slice(0,40)});
      } catch (error) {
        console.log(`ASSET_ERROR ${src} :: ${error?.message || error}`);
      }
    }
  } catch (error) {
    console.log(`PAGE_ERROR ${page} :: ${error?.message || error}`);
  }
}

console.log('\n=== ASSET FINDINGS ===');
for (const item of assetFindings) {
  console.log(`\nASSET ${item.src} STATUS ${item.status} BYTES ${item.bytes}`);
  for (const c of item.found) console.log(`ASSET_CANDIDATE ${c}`);
  for (const hit of item.hits) console.log(`ASSET_HIT ${hit.term} :: ${hit.text}`);
}
