import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SOURCE = 'MARATHONBET';
export const VERSION = '0.1.0';

export const defaultConfig = Object.freeze({
  sourceUrl: process.env.MARATHON_URL || 'https://www.marathonbet.com/en/live/popular',
  pollMs: clampInt(process.env.POLL_MS, 500, 30000, 2000),
  port: clampInt(process.env.PORT, 1024, 65535, 8791),
  profileDir: process.env.PROFILE_DIR || path.join(__dirname, '.chrome-profile'),
  headless: String(process.env.HEADLESS || '').toLowerCase() === 'true',
  maxRawItems: clampInt(process.env.MAX_RAW_ITEMS, 100, 50000, 5000),
  maxHistoryPerMarket: clampInt(process.env.MAX_MARKET_HISTORY, 5, 5000, 300),
  detector: Object.freeze({
    enabled: String(process.env.DETECTOR_ENABLED || '').toLowerCase() === 'true',
    minuteMin: nullableNumber(process.env.MINUTE_MIN),
    minuteMax: nullableNumber(process.env.MINUTE_MAX),
    minOdds: nullableNumber(process.env.MIN_ODDS),
    maxOdds: nullableNumber(process.env.MAX_ODDS),
    ahMinLine: nullableNumber(process.env.AH_MIN_LINE),
    ahMaxLine: nullableNumber(process.env.AH_MAX_LINE),
    sides: String(process.env.SIDES || 'HOME,AWAY').split(',').map(x => x.trim().toUpperCase()).filter(Boolean),
    confirmScans: clampInt(process.env.CONFIRM_SCANS, 1, 20, 1)
  })
});

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function strictNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const s = value.trim().replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSpace(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 20);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseClock(rawText) {
  const text = normalizeSpace(rawText);
  const clock = text.match(/(?:^|\s)(\d{1,3}):(\d{2})(?:\s|$)/);
  if (clock) {
    const minute = Number(clock[1]);
    const second = Number(clock[2]);
    if (minute >= 0 && minute <= 180 && second >= 0 && second <= 59) {
      return Object.freeze({ raw: clock[0].trim(), minute, second, status: 'RUNNING' });
    }
  }
  if (/\bHT\b|\bHalf\s*Time\b|ครึ่งเวลา/i.test(text)) return Object.freeze({ raw: 'HT', minute: 45, second: null, status: 'HT' });
  if (/\bET\b|Extra\s*Time/i.test(text)) return Object.freeze({ raw: 'ET', minute: null, second: null, status: 'ET' });
  if (/\bBreak\b/i.test(text)) return Object.freeze({ raw: 'Break', minute: null, second: null, status: 'BREAK' });
  return Object.freeze({ raw: null, minute: null, second: null, status: 'UNKNOWN' });
}

export function parseScore(rawText) {
  const text = normalizeSpace(rawText);
  const pairSep = text.indexOf('—');
  const scope = pairSep >= 0 ? text.slice(pairSep + 1, pairSep + 120) : text.slice(0, 160);
  const score = scope.match(/(?:^|\s)(\d{1,2}):(\d{1,2})(?=\s|\(|$)/);
  if (!score) return Object.freeze({ raw: null, home: null, away: null });
  return Object.freeze({ raw: `${score[1]}:${score[2]}`, home: Number(score[1]), away: Number(score[2]) });
}

function firstPairLine(text) {
  return text.split('\n').map(x => x.trim()).find(x => x.includes('—')) || '';
}

function cleanTeamTail(value) {
  return normalizeSpace(value)
    .replace(/\s+\d{1,2}:\d{1,2}(?:\s|$).*/, '')
    .replace(/\s+\d{1,2}:\d{1,2}\s*\([^)]*\).*/, '')
    .replace(/\s+\d{1,2}:\d{1,2}\s*$/, '')
    .trim();
}

export function parseTeams(rawText) {
  const line = firstPairLine(normalizeSpace(rawText));
  if (!line) return Object.freeze({ home: null, away: null, raw: null });
  const [left, ...rightParts] = line.split('—');
  if (!left || !rightParts.length) return Object.freeze({ home: null, away: null, raw: line });
  const home = normalizeSpace(left.replace(/^.*?\|\s*/, '').replace(/^\d+\.\s*/, '')).trim();
  const away = cleanTeamTail(rightParts.join('—'));
  return Object.freeze({ home: home || null, away: away || null, raw: line });
}

export function parseHandicapMarket(rawText, homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam) return null;
  const text = normalizeSpace(rawText).replace(/\n/g, ' ');
  const h = escapeRegExp(homeTeam);
  const a = escapeRegExp(awayTeam);
  const re = new RegExp(`${h}\\s*\\(([+-]?\\d+(?:\\.\\d+)?)\\)\\s*(\\d+(?:\\.\\d+)?)\\s+${a}\\s*\\(([+-]?\\d+(?:\\.\\d+)?)\\)\\s*(\\d+(?:\\.\\d+)?)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const homeLine = strictNumber(m[1]);
  const homeOdds = strictNumber(m[2]);
  const awayLine = strictNumber(m[3]);
  const awayOdds = strictNumber(m[4]);
  if ([homeLine, homeOdds, awayLine, awayOdds].some(x => x === null)) return null;
  return Object.freeze({
    type: 'HANDICAP',
    sourceLabel: /To Win Match with Handicap/i.test(text) ? 'To Win Match with Handicap' : (/แต้มต่อ/i.test(text) ? 'แต้มต่อ' : 'HANDICAP_UNLABELED'),
    home: Object.freeze({ selection: 'HOME', team: homeTeam, rawLine: m[1], line: homeLine, rawOdds: m[2], odds: homeOdds }),
    away: Object.freeze({ selection: 'AWAY', team: awayTeam, rawLine: m[3], line: awayLine, rawOdds: m[4], odds: awayOdds })
  });
}

export function parseTotalMarket(rawText) {
  const text = normalizeSpace(rawText).replace(/\n/g, ' ');
  const en = text.match(/Under\s+([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+Over\s+([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/i);
  if (en) {
    return Object.freeze({
      type: 'TOTAL', sourceLabel: 'Total Goals',
      under: Object.freeze({ selection: 'UNDER', rawLine: en[1], line: strictNumber(en[1]), rawOdds: en[2], odds: strictNumber(en[2]) }),
      over: Object.freeze({ selection: 'OVER', rawLine: en[3], line: strictNumber(en[3]), rawOdds: en[4], odds: strictNumber(en[4]) })
    });
  }
  return null;
}

export function parseOneXTwo(rawText, homeTeam, awayTeam) {
  if (!homeTeam || !awayTeam) return null;
  const text = normalizeSpace(rawText).replace(/\n/g, ' ');
  const h = escapeRegExp(homeTeam);
  const a = escapeRegExp(awayTeam);
  const re = new RegExp(`${h}\\s+to Win\\s+(\\d+(?:\\.\\d+)?)\\s+Draw\\s+(\\d+(?:\\.\\d+)?)\\s+${a}\\s+to Win\\s+(\\d+(?:\\.\\d+)?)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return Object.freeze({
    type: '1X2', sourceLabel: 'Match Result',
    home: Object.freeze({ selection: 'HOME', rawOdds: m[1], odds: strictNumber(m[1]) }),
    draw: Object.freeze({ selection: 'DRAW', rawOdds: m[2], odds: strictNumber(m[2]) }),
    away: Object.freeze({ selection: 'AWAY', rawOdds: m[3], odds: strictNumber(m[3]) })
  });
}

function inferLeague(text) {
  const lines = normalizeSpace(text).split('\n').map(x => x.trim()).filter(Boolean);
  const leagueLine = lines.find(x => /Football\./i.test(x) && !x.includes('—'));
  return leagueLine ? leagueLine.replace(/^Football\.\s*/i, '').replace(/\s+All Events.*$/i, '').trim() : null;
}

export function parseEventBlock(rawText, meta = {}) {
  const text = normalizeSpace(rawText);
  const teams = parseTeams(text);
  if (!teams.home || !teams.away) {
    return Object.freeze({ status: 'SOURCE_UNMAPPED', reason: 'TEAM_PAIR_NOT_FOUND', raw: Object.freeze({ text, meta: structuredCloneSafe(meta) }) });
  }
  const score = parseScore(text);
  const clock = parseClock(text);
  const sourceEventId = meta.sourceEventId || meta.eventId || null;
  const league = meta.league || inferLeague(text) || null;
  const internalKey = stableHash(`${league ?? ''}\u0000${teams.home}\u0000${teams.away}\u0000${meta.kickoff ?? ''}`);
  const handicap = parseHandicapMarket(text, teams.home, teams.away);
  const total = parseTotalMarket(text);
  const oneXTwo = parseOneXTwo(text, teams.home, teams.away);
  const markets = [oneXTwo, handicap, total].filter(Boolean);
  return Object.freeze({
    status: 'PARSED',
    source: SOURCE,
    sourceEventId,
    identity: Object.freeze({
      key: sourceEventId ? `marathon:${sourceEventId}` : `internal:${internalKey}`,
      sourceIdVerified: Boolean(sourceEventId),
      league,
      home: teams.home,
      away: teams.away,
      kickoff: meta.kickoff || null
    }),
    live: Object.freeze({ score, clock }),
    markets: Object.freeze(markets),
    raw: Object.freeze({ text, meta: structuredCloneSafe(meta) })
  });
}

function structuredCloneSafe(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value ?? null)); }
}

function marketRows(parsed) {
  const out = [];
  for (const market of parsed.markets || []) {
    if (market.type === 'HANDICAP') {
      for (const side of [market.home, market.away]) out.push({ type: market.type, sourceLabel: market.sourceLabel, ...side });
    } else if (market.type === 'TOTAL') {
      for (const side of [market.under, market.over]) out.push({ type: market.type, sourceLabel: market.sourceLabel, ...side });
    } else if (market.type === '1X2') {
      for (const side of [market.home, market.draw, market.away]) out.push({ type: market.type, sourceLabel: market.sourceLabel, ...side, line: null, rawLine: null });
    }
  }
  return out;
}

export function evaluateDetector(parsed, config) {
  if (!config?.enabled) return Object.freeze({ decision: 'NOT_EVALUATED', reasons: ['DETECTOR_DISABLED'], candidates: [] });
  if (!parsed || parsed.status !== 'PARSED') return Object.freeze({ decision: 'NO_SIGNAL', reasons: ['SOURCE_UNMAPPED'], candidates: [] });
  const minute = parsed.live?.clock?.minute;
  const globalReasons = [];
  if (config.minuteMin !== null && (minute === null || minute < config.minuteMin)) globalReasons.push('MINUTE_BELOW_MIN');
  if (config.minuteMax !== null && (minute === null || minute > config.minuteMax)) globalReasons.push('MINUTE_ABOVE_MAX');
  if (globalReasons.length) return Object.freeze({ decision: 'NO_SIGNAL', reasons: globalReasons, candidates: [] });

  const candidates = [];
  const handicap = (parsed.markets || []).find(m => m.type === 'HANDICAP');
  if (!handicap) return Object.freeze({ decision: 'NO_SIGNAL', reasons: ['HANDICAP_NOT_MAPPED'], candidates: [] });

  for (const side of [handicap.home, handicap.away]) {
    const reasons = [];
    if (!config.sides.includes(side.selection)) reasons.push('SIDE_DISABLED');
    if (config.ahMinLine !== null && side.line < config.ahMinLine) reasons.push('AH_BELOW_MIN');
    if (config.ahMaxLine !== null && side.line > config.ahMaxLine) reasons.push('AH_ABOVE_MAX');
    if (config.minOdds !== null && side.odds < config.minOdds) reasons.push('ODDS_BELOW_MIN');
    if (config.maxOdds !== null && side.odds > config.maxOdds) reasons.push('ODDS_ABOVE_MAX');
    candidates.push(Object.freeze({
      selection: side.selection,
      team: side.team,
      rawLine: side.rawLine,
      line: side.line,
      rawOdds: side.rawOdds,
      odds: side.odds,
      pass: reasons.length === 0,
      reasons: Object.freeze(reasons)
    }));
  }
  const passed = candidates.filter(x => x.pass);
  return Object.freeze({ decision: passed.length ? 'SIGNAL' : 'NO_SIGNAL', reasons: passed.length ? [] : ['NO_HANDICAP_SELECTION_PASSED'], candidates: Object.freeze(candidates) });
}

export class EngineStore {
  constructor(config = defaultConfig) {
    this.config = config;
    this.startedAt = new Date().toISOString();
    this.matches = new Map();
    this.rawNetwork = [];
    this.rawWebSocket = [];
    this.rawStructured = [];
    this.events = [];
    this.stats = [];
    this.signals = new Map();
    this.lastDomScanAt = null;
    this.lastSourceOkAt = null;
    this.lastError = null;
  }

  boundedPush(target, item) {
    target.push(item);
    const over = target.length - this.config.maxRawItems;
    if (over > 0) target.splice(0, over);
  }

  addNetwork(item) { this.boundedPush(this.rawNetwork, Object.freeze(structuredCloneSafe(item))); }
  addWebSocket(item) { this.boundedPush(this.rawWebSocket, Object.freeze(structuredCloneSafe(item))); }
  addStructured(item) { this.boundedPush(this.rawStructured, Object.freeze(structuredCloneSafe(item))); }
  addEvent(item) { this.boundedPush(this.events, Object.freeze(structuredCloneSafe(item))); }
  addStat(item) { this.boundedPush(this.stats, Object.freeze(structuredCloneSafe(item))); }

  upsert(parsed) {
    if (!parsed || parsed.status !== 'PARSED') return;
    const now = new Date().toISOString();
    const key = parsed.identity.key;
    const previous = this.matches.get(key);
    const history = previous?.marketHistory ? structuredCloneSafe(previous.marketHistory) : {};
    for (const row of marketRows(parsed)) {
      const mk = `${row.type}|${row.selection}|${row.line ?? ''}`;
      history[mk] ||= [];
      const last = history[mk][history[mk].length - 1];
      if (!last || last.odds !== row.odds || last.rawOdds !== row.rawOdds) {
        history[mk].push({ ...row, observedAt: now });
        if (history[mk].length > this.config.maxHistoryPerMarket) history[mk].splice(0, history[mk].length - this.config.maxHistoryPerMarket);
      }
    }
    const detection = evaluateDetector(parsed, this.config.detector);
    const current = Object.freeze({
      ...structuredCloneSafe(parsed),
      firstSeenAt: previous?.firstSeenAt || now,
      lastSeenAt: now,
      marketHistory: history,
      detection
    });
    this.matches.set(key, current);
    this.lastDomScanAt = now;
    this.lastSourceOkAt = now;
    this.lastError = null;
    this.updateSignalConfirmation(current);
  }

  updateSignalConfirmation(match) {
    const id = match.identity.key;
    const state = this.signals.get(id) || { consecutive: 0, lastDecision: null, locked: [] };
    if (match.detection.decision === 'SIGNAL') {
      state.consecutive += 1;
      if (state.consecutive >= this.config.detector.confirmScans) {
        state.locked = match.detection.candidates.filter(x => x.pass).map(x => ({ ...x, confirmedAt: new Date().toISOString() }));
      }
    } else {
      state.consecutive = 0;
      state.locked = [];
    }
    state.lastDecision = match.detection.decision;
    state.updatedAt = new Date().toISOString();
    this.signals.set(id, state);
  }

  snapshot() {
    return {
      source: SOURCE,
      version: VERSION,
      startedAt: this.startedAt,
      lastDomScanAt: this.lastDomScanAt,
      lastSourceOkAt: this.lastSourceOkAt,
      lastError: this.lastError,
      matchCount: this.matches.size,
      matches: [...this.matches.values()]
    };
  }
}

function walkObject(value, visit, pathParts = [], depth = 0) {
  if (depth > 14 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkObject(value[i], visit, [...pathParts, i], depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  visit(value, pathParts);
  for (const [key, child] of Object.entries(value)) walkObject(child, visit, [...pathParts, key], depth + 1);
}

function classifyStructuredObject(obj) {
  const keys = Object.keys(obj);
  const lower = keys.map(k => k.toLowerCase());
  const hasAny = (...needles) => needles.some(n => lower.some(k => k.includes(n)));
  if (hasAny('event', 'fixture', 'match') && hasAny('team', 'home', 'away', 'participant')) return 'MATCH_CANDIDATE';
  if (hasAny('market', 'handicap', 'total', 'odds', 'price')) return 'MARKET_CANDIDATE';
  if (hasAny('stat', 'possession', 'corner', 'attack', 'shot', 'card')) return 'STAT_CANDIDATE';
  if (hasAny('incident', 'event', 'goal', 'card', 'substitution', 'corner')) return 'EVENT_CANDIDATE';
  return null;
}

export function harvestStructuredJson(store, payload, sourceMeta) {
  walkObject(payload, (obj, objPath) => {
    const kind = classifyStructuredObject(obj);
    if (!kind) return;
    const item = {
      kind,
      observedAt: new Date().toISOString(),
      path: objPath,
      sourceMeta: structuredCloneSafe(sourceMeta),
      raw: structuredCloneSafe(obj)
    };
    store.addStructured(item);
    if (kind === 'STAT_CANDIDATE') store.addStat(item);
    if (kind === 'EVENT_CANDIDATE') store.addEvent(item);
  });
}

function safeJson(text) {
  const s = String(text ?? '').trim();
  if (!s || (!s.startsWith('{') && !s.startsWith('['))) return null;
  try { return JSON.parse(s); } catch { return null; }
}

async function extractCandidateBlocks(page) {
  return page.evaluate(() => {
    const isCandidate = (el) => {
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim();
      if (!t.includes('—')) return false;
      if (!/(Handicap|แต้มต่อ|Total Goals|ประตูรวม|Match Result|ผลการแข่งขัน)/i.test(t)) return false;
      if (!/\d+(?:\.\d+)?/.test(t)) return false;
      return t.length >= 25 && t.length <= 5000;
    };
    const all = [...document.querySelectorAll('body *')].filter(isCandidate);
    const minimal = all.filter(el => ![...el.children].some(child => isCandidate(child)));
    const out = [];
    const seen = new Set();
    for (const el of minimal) {
      const text = (el.innerText || '').trim();
      if (seen.has(text)) continue;
      seen.add(text);
      let node = el;
      let sourceEventId = null;
      let league = null;
      const attrs = {};
      for (let depth = 0; node && depth < 6; depth++, node = node.parentElement) {
        for (const a of [...(node.attributes || [])]) {
          if (/event|tree|id|match|game/i.test(a.name)) attrs[a.name] = a.value;
          if (!sourceEventId && /event.*id|event.*tree|tree.*id|match.*id|game.*id/i.test(a.name) && a.value) sourceEventId = a.value;
        }
        const nt = (node.innerText || '').split('\n').map(x => x.trim()).filter(Boolean);
        const ll = nt.find(x => /^Football\./i.test(x) && !x.includes('—'));
        if (!league && ll) league = ll.replace(/^Football\.\s*/i, '').replace(/\s+All Events.*$/i, '').trim();
      }
      out.push({ text, meta: { sourceEventId, league, attrs } });
    }
    return out;
  });
}

async function launchPersistentBrowser(config) {
  const { chromium } = await import('playwright');
  fs.mkdirSync(config.profileDir, { recursive: true });
  const options = {
    headless: config.headless,
    viewport: null,
    args: ['--start-maximized'],
    ignoreHTTPSErrors: false
  };
  try {
    return await chromium.launchPersistentContext(config.profileDir, { ...options, channel: 'chrome' });
  } catch {
    return await chromium.launchPersistentContext(config.profileDir, options);
  }
}

export async function startCollector(store, config = defaultConfig) {
  const context = await launchPersistentBrowser(config);
  const page = context.pages()[0] || await context.newPage();

  page.on('response', async response => {
    try {
      const req = response.request();
      if (!['xhr', 'fetch', 'document'].includes(req.resourceType())) return;
      const headers = await response.allHeaders();
      const contentType = headers['content-type'] || '';
      if (/image|font|css|video|audio/i.test(contentType)) return;
      let body = '';
      try { body = await response.text(); } catch {}
      const item = {
        observedAt: new Date().toISOString(),
        url: response.url(),
        status: response.status(),
        method: req.method(),
        resourceType: req.resourceType(),
        contentType,
        bodySample: body.slice(0, 200000)
      };
      store.addNetwork(item);
      const json = safeJson(body);
      if (json) harvestStructuredJson(store, json, { url: response.url(), transport: 'HTTP' });
    } catch (error) {
      store.lastError = `NETWORK_CAPTURE: ${error.message}`;
    }
  });

  page.on('websocket', ws => {
    ws.on('framereceived', event => {
      const payload = typeof event.payload === 'string' ? event.payload : String(event.payload ?? '');
      const item = { observedAt: new Date().toISOString(), url: ws.url(), direction: 'IN', payloadSample: payload.slice(0, 200000) };
      store.addWebSocket(item);
      const json = safeJson(payload);
      if (json) harvestStructuredJson(store, json, { url: ws.url(), transport: 'WEBSOCKET' });
    });
  });

  async function scan() {
    try {
      const blocks = await extractCandidateBlocks(page);
      for (const block of blocks) store.upsert(parseEventBlock(block.text, block.meta));
      store.lastDomScanAt = new Date().toISOString();
    } catch (error) {
      store.lastError = `DOM_SCAN: ${error.message}`;
    }
  }

  try {
    await page.goto(config.sourceUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (error) {
    store.lastError = `NAVIGATION: ${error.message}`;
  }

  const timer = setInterval(scan, config.pollMs);
  await scan();

  return {
    context,
    page,
    stop: async () => {
      clearInterval(timer);
      await context.close();
    }
  };
}

function json(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': 'http://127.0.0.1' });
  res.end(body);
}

function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function monitorHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Marathon Engine</title><style>body{font:14px Arial,sans-serif;background:#111;color:#eee;margin:20px}h1{font-size:24px}.muted{color:#aaa}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:8px;border-bottom:1px solid #333;text-align:left}.pill{padding:2px 7px;border:1px solid #555;border-radius:12px}</style></head><body><h1>Marathon Engine <span class="pill">${VERSION}</span></h1><div id="health" class="muted">Loading…</div><table><thead><tr><th>League</th><th>Match</th><th>Time</th><th>Score</th><th>AH / Odds</th><th>Detector</th></tr></thead><tbody id="rows"></tbody></table><script>async function tick(){const h=await fetch('/api/health').then(r=>r.json());document.getElementById('health').innerHTML='Source: '+h.source+' · Matches: '+h.matchCount+' · Last source: '+(h.lastSourceOkAt||'—')+' · Detector: '+(h.detectorEnabled?'ON':'OFF');const d=await fetch('/api/live').then(r=>r.json());document.getElementById('rows').innerHTML=d.matches.map(m=>{const ah=(m.markets||[]).find(x=>x.type==='HANDICAP');const a=ah?ah.home.rawLine+' @ '+ah.home.rawOdds+' / '+ah.away.rawLine+' @ '+ah.away.rawOdds:'—';return '<tr><td>'+esc(m.identity.league||'—')+'</td><td>'+esc(m.identity.home)+' — '+esc(m.identity.away)+'</td><td>'+esc(m.live.clock.raw||'—')+'</td><td>'+esc(m.live.score.raw||'—')+'</td><td>'+esc(a)+'</td><td>'+esc(m.detection.decision)+'</td></tr>'}).join('')}function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}tick();setInterval(tick,2000)</script></body></html>`;
}

export function startServer(store, config = defaultConfig) {
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${config.port}`);
      if (url.pathname === '/') return html(res, monitorHtml());
      if (url.pathname === '/api/health') return json(res, 200, {
        ok: Boolean(store.lastSourceOkAt) && !store.lastError,
        source: SOURCE,
        version: VERSION,
        sourceUrl: config.sourceUrl,
        matchCount: store.matches.size,
        lastSourceOkAt: store.lastSourceOkAt,
        lastDomScanAt: store.lastDomScanAt,
        lastError: store.lastError,
        detectorEnabled: config.detector.enabled
      });
      if (url.pathname === '/api/live' || url.pathname === '/api/matches') return json(res, 200, store.snapshot());
      if (url.pathname === '/api/markets') return json(res, 200, [...store.matches.values()].map(m => ({ identity: m.identity, markets: m.markets, marketHistory: m.marketHistory })));
      if (url.pathname === '/api/signals') return json(res, 200, [...store.signals.entries()].map(([matchKey, state]) => ({ matchKey, ...state })));
      if (url.pathname === '/api/events') return json(res, 200, { mapped: false, note: 'Raw source event candidates only until Marathon field semantics are verified.', items: store.events });
      if (url.pathname === '/api/stats') return json(res, 200, { mapped: false, note: 'Raw source statistic candidates only until Marathon field semantics are verified.', items: store.stats });
      if (url.pathname === '/api/raw/network') return json(res, 200, store.rawNetwork);
      if (url.pathname === '/api/raw/websocket') return json(res, 200, store.rawWebSocket);
      if (url.pathname === '/api/raw/structured') return json(res, 200, store.rawStructured);
      if (url.pathname.startsWith('/api/matches/')) {
        const key = decodeURIComponent(url.pathname.slice('/api/matches/'.length));
        const match = store.matches.get(key);
        return match ? json(res, 200, match) : json(res, 404, { error: 'MATCH_NOT_FOUND' });
      }
      return json(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  });
  server.listen(config.port, '127.0.0.1');
  return server;
}

async function main() {
  const store = new EngineStore(defaultConfig);
  const server = startServer(store, defaultConfig);
  console.log(`[Marathon Engine] monitor http://127.0.0.1:${defaultConfig.port}`);
  console.log(`[Marathon Engine] source ${defaultConfig.sourceUrl}`);
  console.log(`[Marathon Engine] detector ${defaultConfig.detector.enabled ? 'ENABLED' : 'DISABLED (configure before use)'}`);
  let collector;
  try {
    collector = await startCollector(store, defaultConfig);
  } catch (error) {
    store.lastError = `COLLECTOR_START: ${error.message}`;
    console.error(store.lastError);
  }
  const shutdown = async () => {
    try { if (collector) await collector.stop(); } catch {}
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
