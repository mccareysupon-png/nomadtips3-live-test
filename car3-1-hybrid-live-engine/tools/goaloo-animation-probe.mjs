#!/usr/bin/env node

const matchId = String(process.argv[2] || '').trim();
if (!/^\d+$/.test(matchId)) {
  console.error('Usage: node goaloo-animation-probe.mjs <goaloo-match-id>');
  process.exit(2);
}

const UA = 'NOMADTIPS3-CAR3.1-Research/1.0 (+public Goaloo source probe)';
const pageUrl = `https://m.goaloo.com/football/match/live-${matchId}`;

function stripTags(value='') {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUrl(base, href) {
  try { return new URL(href, base).toString(); } catch { return null; }
}

function redact(url) {
  try {
    const u = new URL(url);
    for (const key of ['accessKey', 'access_key', 'token', 'key']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '[REDACTED]');
    }
    return u.toString();
  } catch { return url; }
}

async function getText(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      'accept': 'text/html,application/xhtml+xml,application/javascript,text/javascript,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.8'
    }
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} @ ${url}`);
  return {url: r.url, text: await r.text(), contentType: r.headers.get('content-type') || ''};
}

function findAnimationLinks(html, base) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(re)) {
    const attrs = m[1] || '';
    const text = stripTags(m[2]);
    if (!/animation/i.test(text)) continue;
    const hm = attrs.match(/\bhref\s*=\s*(["'])(.*?)\1/i) || attrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hm ? (hm[2] || hm[1]) : null;
    if (!href) continue;
    const url = resolveUrl(base, href);
    if (url) out.push({text, url});
  }
  return out;
}

function findIframes(html, base) {
  const out = [];
  for (const m of html.matchAll(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    const url = resolveUrl(base, m[2]);
    if (url) out.push(url);
  }
  return [...new Set(out)];
}

function findScripts(html, base) {
  const out = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi)) {
    const url = resolveUrl(base, m[2]);
    if (url) out.push(url);
  }
  return [...new Set(out)];
}

function findCandidateUrls(text, base) {
  const found = new Set();
  const raw = String(text || '');
  const patterns = [
    /https?:\\?\/\\?\/[^\s"'<>]+/gi,
    /["']([^"']*(?:animation|attackdetail|liveanimation|event|timeline|socket|process)[^"']*)["']/gi
  ];
  for (const re of patterns) {
    for (const m of raw.matchAll(re)) {
      const candidate = String(m[1] || m[0] || '').replace(/\\\//g, '/');
      const url = resolveUrl(base, candidate);
      if (url) found.add(url);
    }
  }
  return [...found].filter(u => /(animation|attackdetail|liveanimation|event|timeline|socket|process|isportslive)/i.test(u));
}

function classify(url) {
  try {
    const u = new URL(url);
    const authKeys = ['accessKey', 'access_key', 'token', 'key'].filter(k => u.searchParams.has(k));
    if (authKeys.length) return {status:'AUTH_GATED', authKeys};
    if (/isportslive8\.com$/i.test(u.hostname)) return {status:'ISPORTS_ANIMATION_HOST'};
    if (/goaloo/i.test(u.hostname)) return {status:'GOALOO_PUBLIC_CANDIDATE'};
    return {status:'EXTERNAL_CANDIDATE'};
  } catch { return {status:'UNKNOWN'}; }
}

const report = {
  ok: false,
  matchId,
  sourcePage: pageUrl,
  fetchedAt: new Date().toISOString(),
  animationLinks: [],
  inspectedPages: [],
  candidates: [],
  note: 'Public-source probe only. Does not bypass authentication, CAPTCHA, anti-bot controls, access keys, or domain whitelists.'
};

try {
  const root = await getText(pageUrl);
  report.sourcePage = root.url;
  const links = findAnimationLinks(root.text, root.url);
  report.animationLinks = links.map(x => ({text:x.text, url:redact(x.url), ...classify(x.url)}));

  const candidates = new Map();
  const add = (url, via) => {
    if (!url) return;
    const key = url;
    const old = candidates.get(key) || {url, via:[]};
    if (!old.via.includes(via)) old.via.push(via);
    candidates.set(key, old);
  };

  for (const u of findIframes(root.text, root.url)) add(u, 'root:iframe');
  for (const u of findCandidateUrls(root.text, root.url)) add(u, 'root:inline');

  for (const link of links.slice(0, 4)) {
    const cls = classify(link.url);
    if (cls.status === 'AUTH_GATED') {
      add(link.url, 'animation-link:auth-gated');
      continue;
    }
    try {
      const page = await getText(link.url);
      report.inspectedPages.push({url:redact(page.url), contentType:page.contentType});
      for (const u of findIframes(page.text, page.url)) add(u, 'animation-page:iframe');
      for (const u of findCandidateUrls(page.text, page.url)) add(u, 'animation-page:inline');
      for (const script of findScripts(page.text, page.url).slice(0, 20)) {
        if (/(animation|football|live|match|sport|event|process)/i.test(script)) add(script, 'animation-page:script');
      }
    } catch (error) {
      report.inspectedPages.push({url:redact(link.url), error:String(error?.message || error)});
    }
  }

  report.candidates = [...candidates.values()].map(x => ({...x, url:redact(x.url), ...classify(x.url)}));
  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = String(error?.message || error);
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
