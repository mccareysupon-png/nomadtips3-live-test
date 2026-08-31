const ODDSTORM_BASE = 'https://www.oddstorm.com';
const INDEX_CACHE_MS = 20_000;
const MARKET_CACHE_MS = 25_000;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const REQUEST_TIMEOUT_MS = 4_000;
const BLOCKED_BACKOFF_MS = 10 * 60_000;
const DEFAULT_MIN_BOOKS = 3;
const DEFAULT_MAX_ODDS_DEVIATION = 0.45;

export const ODDSTORM_BOOKMAKERS = Object.freeze([
  'Unibet',
  'Stake',
  'Pinnacle',
  'Ladbrokes',
  'BWin',
  'BetWay',
]);

let indexCache = { at: 0, matches: [] };
const marketCache = new Map();
const requestCalls = [];
let blockedUntil = 0;
let lastRequestAt = null;
let lastSuccessAt = null;
let lastError = null;

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const now = () => Date.now();

function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&minus;|&#8722;/gi, '-')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function textOnly(value = '') {
  return decodeHtml(String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bookmakerLabel(value = '') {
  const key = normalize(value).replace(/\s/g, '');
  if (key.includes('unibet')) return 'Unibet';
  if (key.includes('stake')) return 'Stake';
  if (key.includes('pinnacle')) return 'Pinnacle';
  if (key.includes('ladbrokes')) return 'Ladbrokes';
  if (key.includes('bwin')) return 'BWin';
  if (key.includes('betway')) return 'BetWay';
  return null;
}

function parseHandicap(value = '') {
  const compact = textOnly(value).replace(/[−–—]/g, '-').replace(/\s+/g, '');
  if (!compact) return null;
  if (compact.includes('/')) {
    const pieces = compact.split('/').filter(Boolean).slice(0, 2);
    if (pieces.length === 2) {
      const first = Number(pieces[0]);
      let second = Number(pieces[1]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        if (pieces[0].startsWith('-') && !/^[+-]/.test(pieces[1])) second = -Math.abs(second);
        if (pieces[0].startsWith('+') && !/^[+-]/.test(pieces[1])) second = Math.abs(second);
        return Number(((first + second) / 2).toFixed(4));
      }
    }
  }
  const match = compact.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimalOdds(value = '') {
  const matches = textOnly(value).replace(',', '.').match(/\d+(?:\.\d+)?/g) || [];
  for (const raw of matches) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 1 && parsed < 20) return parsed;
  }
  return null;
}

export function parseOddStormAsianHtml(html = '') {
  const rows = [];
  for (const rowMatch of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(match => textOnly(match[1]));
    if (cells.length < 4) continue;
    let bookmaker = null;
    let bookmakerIndex = -1;
    for (let index = 0; index < Math.min(cells.length, 3); index += 1) {
      const label = bookmakerLabel(cells[index]);
      if (label) { bookmaker = label; bookmakerIndex = index; break; }
    }
    if (!bookmaker) continue;
    const tail = cells.slice(bookmakerIndex + 1);
    let line = null;
    let lineIndex = -1;
    for (let index = 0; index < tail.length; index += 1) {
      const parsed = parseHandicap(tail[index]);
      if (parsed !== null && Math.abs(parsed) <= 10) { line = parsed; lineIndex = index; break; }
    }
    if (line === null) continue;
    const odds = [];
    for (let index = lineIndex + 1; index < tail.length; index += 1) {
      const parsed = parseDecimalOdds(tail[index]);
      if (parsed !== null) odds.push(parsed);
      if (odds.length >= 2) break;
    }
    if (odds.length < 2) continue;
    rows.push({ bookmaker, line, homeOdds: odds[0], awayOdds: odds[1] });
  }
  return rows;
}

function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

function refereeConfig(env = {}) {
  const minBooksRaw = Number(env.ODDSTORM_REFEREE_MIN_BOOKS);
  const maxDeviationRaw = Number(env.ODDSTORM_REFEREE_MAX_ODDS_DEVIATION);
  return {
    minBooks: Number.isFinite(minBooksRaw) ? Math.max(2, Math.min(6, Math.floor(minBooksRaw))) : DEFAULT_MIN_BOOKS,
    maxOddsDeviation: Number.isFinite(maxDeviationRaw) ? Math.max(0.10, Math.min(1.50, maxDeviationRaw)) : DEFAULT_MAX_ODDS_DEVIATION,
  };
}

export function evaluateOddStormConsensus(rows = [], primary = {}, options = {}) {
  const minBooks = Number.isFinite(Number(options.minBooks)) ? Number(options.minBooks) : DEFAULT_MIN_BOOKS;
  const maxOddsDeviation = Number.isFinite(Number(options.maxOddsDeviation)) ? Number(options.maxOddsDeviation) : DEFAULT_MAX_ODDS_DEVIATION;
  const line = finite(primary?.line) ? Number(primary.line) : null;
  if (line === null) return { status: 'UNAVAILABLE', decision: 'SKIP', reason: 'primary_line_missing', count: 0, line: null, books: [] };

  const unique = new Map();
  for (const row of rows) {
    if (!ODDSTORM_BOOKMAKERS.includes(row?.bookmaker)) continue;
    if (!finite(row?.line) || Math.abs(Number(row.line) - line) > 0.001) continue;
    if (!finite(row?.homeOdds) || !finite(row?.awayOdds)) continue;
    if (Number(row.homeOdds) <= 1 || Number(row.awayOdds) <= 1) continue;
    unique.set(row.bookmaker, {
      bookmaker: row.bookmaker,
      line: Number(row.line),
      homeOdds: Number(row.homeOdds),
      awayOdds: Number(row.awayOdds),
    });
  }
  const books = [...unique.values()];
  if (books.length < minBooks) {
    return { status: 'INSUFFICIENT', decision: 'SKIP', reason: `need_${minBooks}_bookmakers_have_${books.length}`, count: books.length, line, books };
  }

  const medianHomeOdds = Number(median(books.map(row => row.homeOdds)).toFixed(4));
  const medianAwayOdds = Number(median(books.map(row => row.awayOdds)).toFixed(4));
  const primaryHome = finite(primary?.homeOdds) ? Number(primary.homeOdds) : null;
  const primaryAway = finite(primary?.awayOdds) ? Number(primary.awayOdds) : null;
  const homeDeviation = primaryHome === null ? null : Number(Math.abs(primaryHome - medianHomeOdds).toFixed(4));
  const awayDeviation = primaryAway === null ? null : Number(Math.abs(primaryAway - medianAwayOdds).toFixed(4));
  const strongestCount = Math.max(4, minBooks);
  const severeDeviation = books.length >= strongestCount && [homeDeviation, awayDeviation].some(value => value !== null && value > maxOddsDeviation);

  return {
    status: 'READY',
    decision: severeDeviation ? 'REJECT' : 'PASS',
    reason: severeDeviation ? 'primary_price_outside_oddstorm_consensus' : 'oddstorm_consensus_ok',
    count: books.length,
    line,
    medianHomeOdds,
    medianAwayOdds,
    primaryHomeOdds: primaryHome,
    primaryAwayOdds: primaryAway,
    homeDeviation,
    awayDeviation,
    maxOddsDeviation,
    books,
  };
}

function matchScore(left = '', right = '') {
  const a = normalize(left), b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.replace(/\s/g, '') === b.replace(/\s/g, '')) return 0.99;
  if (a.length >= 5 && b.length >= 5 && (a.includes(b) || b.includes(a))) return 0.92;
  const aa = new Set(a.split(' ').filter(Boolean));
  const bb = new Set(b.split(' ').filter(Boolean));
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection += 1;
  const union = aa.size + bb.size - intersection;
  return union ? intersection / union : 0;
}

function parseMatchLinks(html = '') {
  const byId = new Map();
  const pattern = /<a\b[^>]*href=["']([^"']*\/odds(?:-inplay)?\/match\/(\d+)-([^"'?#/]+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of String(html).matchAll(pattern)) {
    const id = match[2];
    let slug = match[3];
    try { slug = decodeURIComponent(slug); } catch {}
    const split = slug.split(/-vs-/i);
    if (split.length < 2) continue;
    const home = split[0].replace(/[-_]+/g, ' ').trim();
    const away = split.slice(1).join('-vs-').replace(/[-_]+/g, ' ').trim();
    let href = match[1];
    try { href = new URL(href, ODDSTORM_BASE).pathname; } catch {}
    if (!byId.has(id)) byId.set(id, { id, href, home, away, anchor: textOnly(match[4]) });
  }
  return [...byId.values()];
}

function matchOddStorm(target, matches) {
  const candidates = [];
  for (const item of matches) {
    const home = matchScore(target?.home, item.home);
    const away = matchScore(target?.away, item.away);
    if (home < 0.55 || away < 0.55) continue;
    candidates.push({ item, score: (home + away) / 2, home, away });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 0.70) return { item: null, reason: 'oddstorm_match_not_found', candidates: candidates.length };
  const second = candidates[1];
  if (second && best.score - second.score < 0.03) return { item: null, reason: 'oddstorm_match_ambiguous', candidates: candidates.length };
  return { item: best.item, reason: null, confidence: Number(best.score.toFixed(4)), home: Number(best.home.toFixed(4)), away: Number(best.away.toFixed(4)), candidates: candidates.length };
}

function pruneWindow(timestamp = now()) {
  while (requestCalls.length && timestamp - requestCalls[0] >= REQUEST_WINDOW_MS) requestCalls.shift();
}

function reserveRequest() {
  const timestamp = now();
  pruneWindow(timestamp);
  if (timestamp < blockedUntil) {
    const error = new Error('ODDSTORM_CIRCUIT_OPEN');
    error.code = 'ODDSTORM_CIRCUIT_OPEN';
    throw error;
  }
  if (requestCalls.length >= MAX_REQUESTS_PER_WINDOW) {
    const error = new Error('ODDSTORM_RATE_BUDGET');
    error.code = 'ODDSTORM_RATE_BUDGET';
    throw error;
  }
  requestCalls.push(timestamp);
  lastRequestAt = timestamp;
}

async function requestText(path) {
  reserveRequest();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('ODDSTORM_TIMEOUT'), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, ODDSTORM_BASE).toString(), {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache',
        pragma: 'no-cache',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36',
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`ODDSTORM_HTTP_${response.status}`);
      error.code = `ODDSTORM_HTTP_${response.status}`;
      error.status = response.status;
      if (response.status === 403 || response.status === 429) blockedUntil = now() + BLOCKED_BACKOFF_MS;
      throw error;
    }
    lastSuccessAt = now();
    lastError = null;
    return text;
  } catch (error) {
    lastError = String(error?.code || error?.message || error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function classifyOddStormError(error) {
  const message = String(error?.code || error?.message || error || 'unknown_error');
  if (/CIRCUIT_OPEN|HTTP_403|HTTP_429/.test(message)) return { status: 'BLOCKED', reason: message };
  if (/TIMEOUT|AbortError|aborted/i.test(message)) return { status: 'TIMEOUT', reason: message };
  if (/RATE_BUDGET/.test(message)) return { status: 'RATE_LIMIT', reason: message };
  return { status: 'UNAVAILABLE', reason: message };
}

async function oddStormMatches() {
  const timestamp = now();
  if (indexCache.at && timestamp - indexCache.at < INDEX_CACHE_MS) return { ...indexCache, cacheHit: true };
  let html = await requestText('/odds-inplay/');
  let matches = parseMatchLinks(html);
  if (!matches.length) {
    html = await requestText('/odds/');
    matches = parseMatchLinks(html);
  }
  indexCache = { at: now(), matches };
  return { ...indexCache, cacheHit: false };
}

function marketUrls(item) {
  const path = String(item?.href || '').split('?')[0].replace(/\/$/, '');
  const urls = [];
  if (!path) return urls;
  if (/\/asian-handicap$/i.test(path)) urls.push(`${path}?o=1&ot=1`);
  else urls.push(`${path}/asian-handicap?o=1&ot=1`);
  if (path.includes('/odds-inplay/match/')) {
    const prematch = path.replace('/odds-inplay/match/', '/odds/match/');
    urls.push(`${prematch}/asian-handicap?o=1&ot=1`);
  }
  return [...new Set(urls)];
}

async function marketRows(item) {
  let last = null;
  for (const url of marketUrls(item)) {
    const cached = marketCache.get(url);
    if (cached && now() - cached.at < MARKET_CACHE_MS) return { rows: cached.rows, url, cacheHit: true };
    try {
      const html = await requestText(url);
      const rows = parseOddStormAsianHtml(html);
      marketCache.set(url, { at: now(), rows });
      if (rows.length) return { rows, url, cacheHit: false };
      last = new Error('ODDSTORM_AH_TABLE_EMPTY');
    } catch (error) {
      const classified = classifyOddStormError(error);
      if (classified.status === 'BLOCKED' || classified.status === 'RATE_LIMIT') throw error;
      last = error;
    }
  }
  throw last || new Error('ODDSTORM_AH_ROUTE_MISSING');
}

function skipped(status, reason, extra = {}) {
  return {
    source: 'OddStorm',
    role: 'additional-price-referee',
    failOpen: true,
    selectedBookmakers: ODDSTORM_BOOKMAKERS,
    status,
    decision: 'SKIP',
    reason,
    ...extra,
  };
}

export async function refereeOddStorm(target, primary, env = {}) {
  if (now() < blockedUntil) return skipped('BLOCKED', 'oddstorm_circuit_open', { retryAfterSeconds: Math.ceil((blockedUntil - now()) / 1000) });
  try {
    const index = await oddStormMatches();
    const mapped = matchOddStorm(target, index.matches);
    if (!mapped.item) return skipped('MAPPING_MISS', mapped.reason, { mapping: mapped });
    const market = await marketRows(mapped.item);
    const config = refereeConfig(env);
    const consensus = evaluateOddStormConsensus(market.rows, primary, config);
    return {
      source: 'OddStorm',
      role: 'additional-price-referee',
      failOpen: true,
      selectedBookmakers: ODDSTORM_BOOKMAKERS,
      ...consensus,
      mapping: { confidence: mapped.confidence, home: mapped.home, away: mapped.away, oddStormMatchId: mapped.item.id },
      route: market.url,
      cache: { index: index.cacheHit, market: market.cacheHit },
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const classified = classifyOddStormError(error);
    return skipped(classified.status, classified.reason, {
      retryAfterSeconds: now() < blockedUntil ? Math.ceil((blockedUntil - now()) / 1000) : null,
      checkedAt: new Date().toISOString(),
    });
  }
}

export function oddStormHealth(env = {}) {
  pruneWindow();
  const config = refereeConfig(env);
  return {
    source: 'OddStorm',
    role: 'additional-price-referee',
    mode: 'fail-open',
    selectedBookmakers: ODDSTORM_BOOKMAKERS,
    minBooks: config.minBooks,
    maxOddsDeviation: config.maxOddsDeviation,
    requestBudget: { usedLast60s: requestCalls.length, internalCeiling: MAX_REQUESTS_PER_WINDOW },
    circuitOpen: now() < blockedUntil,
    retryAfterSeconds: now() < blockedUntil ? Math.ceil((blockedUntil - now()) / 1000) : 0,
    indexCacheAgeSeconds: indexCache.at ? Math.max(0, (now() - indexCache.at) / 1000) : null,
    marketCacheEntries: marketCache.size,
    lastRequestAt: lastRequestAt ? new Date(lastRequestAt).toISOString() : null,
    lastSuccessAt: lastSuccessAt ? new Date(lastSuccessAt).toISOString() : null,
    lastError,
  };
}

export function resetOddStormStateForTests() {
  indexCache = { at: 0, matches: [] };
  marketCache.clear();
  requestCalls.splice(0, requestCalls.length);
  blockedUntil = 0;
  lastRequestAt = null;
  lastSuccessAt = null;
  lastError = null;
}

export { parseHandicap, parseDecimalOdds, parseMatchLinks, matchOddStorm };
