import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineStore, SOURCE, VERSION, defaultConfig, startCollector } from './engine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.join(__dirname, '.marathon-settings.json');
const UI_DIR = path.join(__dirname, 'ui');
const PORT = defaultConfig.port;

const DEFAULT_SETTINGS = Object.freeze({
  source: Object.freeze({
    url: defaultConfig.sourceUrl,
    pollMs: defaultConfig.pollMs,
    headless: defaultConfig.headless,
    profileDir: defaultConfig.profileDir,
    maxRawItems: defaultConfig.maxRawItems,
    maxHistoryPerMarket: defaultConfig.maxHistoryPerMarket
  }),
  detector: Object.freeze({
    enabled: defaultConfig.detector.enabled,
    minuteMin: defaultConfig.detector.minuteMin,
    minuteMax: defaultConfig.detector.minuteMax,
    minOdds: defaultConfig.detector.minOdds,
    maxOdds: defaultConfig.detector.maxOdds,
    ahMinLine: defaultConfig.detector.ahMinLine,
    ahMaxLine: defaultConfig.detector.ahMaxLine,
    sides: [...defaultConfig.detector.sides],
    confirmScans: defaultConfig.detector.confirmScans
  })
});

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}
function integer(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}
function inRange(n, min, max) { return Number.isFinite(n) && n >= min && n <= max; }

function validateSettings(input) {
  const errors = [];
  const source = input?.source || {};
  const detector = input?.detector || {};
  const sourceUrl = String(source.url ?? '').trim();
  try {
    const parsed = new URL(sourceUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch { errors.push('Source URL must be a valid http/https URL.'); }

  const pollMs = integer(source.pollMs);
  if (!inRange(pollMs, 500, 30000)) errors.push('Poll interval must be 500-30000 ms.');
  const maxRawItems = integer(source.maxRawItems);
  if (!inRange(maxRawItems, 100, 50000)) errors.push('Max raw items must be 100-50000.');
  const maxHistoryPerMarket = integer(source.maxHistoryPerMarket);
  if (!inRange(maxHistoryPerMarket, 5, 5000)) errors.push('Market history limit must be 5-5000.');
  const profileDir = String(source.profileDir ?? '').trim();
  if (!profileDir) errors.push('Chrome profile directory is required.');

  const minuteMin = nullableNumber(detector.minuteMin);
  const minuteMax = nullableNumber(detector.minuteMax);
  const minOdds = nullableNumber(detector.minOdds);
  const maxOdds = nullableNumber(detector.maxOdds);
  const ahMinLine = nullableNumber(detector.ahMinLine);
  const ahMaxLine = nullableNumber(detector.ahMaxLine);
  const confirmScans = integer(detector.confirmScans);

  for (const [label, value] of [['Minimum minute', minuteMin], ['Maximum minute', minuteMax]]) {
    if (Number.isNaN(value) || (value !== null && !inRange(value, 0, 180))) errors.push(`${label} must be blank or 0-180.`);
  }
  for (const [label, value] of [['Minimum odds', minOdds], ['Maximum odds', maxOdds]]) {
    if (Number.isNaN(value) || (value !== null && !inRange(value, 1.001, 1000))) errors.push(`${label} must be blank or 1.001-1000.`);
  }
  for (const [label, value] of [['Minimum handicap', ahMinLine], ['Maximum handicap', ahMaxLine]]) {
    if (Number.isNaN(value) || (value !== null && !inRange(value, -20, 20))) errors.push(`${label} must be blank or -20 to +20.`);
  }
  if (minuteMin !== null && minuteMax !== null && minuteMin > minuteMax) errors.push('Minimum minute cannot exceed maximum minute.');
  if (minOdds !== null && maxOdds !== null && minOdds > maxOdds) errors.push('Minimum odds cannot exceed maximum odds.');
  if (ahMinLine !== null && ahMaxLine !== null && ahMinLine > ahMaxLine) errors.push('Minimum handicap cannot exceed maximum handicap.');
  if (!inRange(confirmScans, 1, 20)) errors.push('Confirm scans must be 1-20.');

  const sides = Array.isArray(detector.sides) ? [...new Set(detector.sides.map(x => String(x).toUpperCase()))] : [];
  if (!sides.length || sides.some(x => !['HOME', 'AWAY'].includes(x))) errors.push('Select HOME, AWAY, or both.');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      source: {
        url: sourceUrl,
        pollMs,
        headless: Boolean(source.headless),
        profileDir,
        maxRawItems,
        maxHistoryPerMarket
      },
      detector: {
        enabled: Boolean(detector.enabled),
        minuteMin,
        minuteMax,
        minOdds,
        maxOdds,
        ahMinLine,
        ahMaxLine,
        sides,
        confirmScans
      }
    }
  };
}

function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) return clone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const checked = validateSettings(parsed);
    return checked.ok ? checked.value : clone(DEFAULT_SETTINGS);
  } catch { return clone(DEFAULT_SETTINGS); }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

function toEngineConfig(settings) {
  return {
    ...defaultConfig,
    sourceUrl: settings.source.url,
    pollMs: settings.source.pollMs,
    headless: settings.source.headless,
    profileDir: settings.source.profileDir,
    maxRawItems: settings.source.maxRawItems,
    maxHistoryPerMarket: settings.source.maxHistoryPerMarket,
    detector: {
      enabled: settings.detector.enabled,
      minuteMin: settings.detector.minuteMin,
      minuteMax: settings.detector.minuteMax,
      minOdds: settings.detector.minOdds,
      maxOdds: settings.detector.maxOdds,
      ahMinLine: settings.detector.ahMinLine,
      ahMaxLine: settings.detector.ahMaxLine,
      sides: [...settings.detector.sides],
      confirmScans: settings.detector.confirmScans
    }
  };
}

let settings = loadSettings();
let config = toEngineConfig(settings);
let store = new EngineStore(config);
let collector = null;
let applying = false;
let collectorGeneration = 0;

function json(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': 'http://127.0.0.1',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(body);
}
function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}
function readUi(name) { return fs.readFileSync(path.join(UI_DIR, name), 'utf8'); }
async function readBody(req, maxBytes = 256 * 1024) {
  return await new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      text += chunk;
      if (Buffer.byteLength(text, 'utf8') > maxBytes) reject(new Error('BODY_TOO_LARGE'));
    });
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });
}

async function startEngineCollector() {
  const generation = ++collectorGeneration;
  try {
    const next = await startCollector(store, config);
    if (generation !== collectorGeneration) {
      await next.stop().catch(() => {});
      return;
    }
    collector = next;
  } catch (error) {
    store.lastError = `COLLECTOR_START: ${error.message}`;
  }
}

async function applySettings(nextSettings) {
  applying = true;
  try {
    collectorGeneration += 1;
    if (collector) {
      await collector.stop().catch(() => {});
      collector = null;
    }
    settings = nextSettings;
    saveSettings(settings);
    config = toEngineConfig(settings);
    store = new EngineStore(config);
    await startEngineCollector();
    return { ok: true };
  } finally {
    applying = false;
  }
}

function healthSnapshot() {
  return {
    ok: Boolean(store.lastSourceOkAt) && !store.lastError,
    source: SOURCE,
    version: VERSION,
    sourceUrl: config.sourceUrl,
    matchCount: store.matches.size,
    lastSourceOkAt: store.lastSourceOkAt,
    lastDomScanAt: store.lastDomScanAt,
    lastError: store.lastError,
    detectorEnabled: config.detector.enabled,
    applyingSettings: applying,
    pollMs: config.pollMs,
    port: PORT
  };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'access-control-allow-origin': 'http://127.0.0.1', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' });
      return res.end();
    }
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/') return html(res, readUi('monitor.html'));
    if (req.method === 'GET' && url.pathname === '/settings') return html(res, readUi('settings.html'));
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, healthSnapshot());
    if (req.method === 'GET' && (url.pathname === '/api/live' || url.pathname === '/api/matches')) return json(res, 200, store.snapshot());
    if (req.method === 'GET' && url.pathname === '/api/markets') return json(res, 200, [...store.matches.values()].map(m => ({ identity: m.identity, markets: m.markets, marketHistory: m.marketHistory })));
    if (req.method === 'GET' && url.pathname === '/api/signals') return json(res, 200, [...store.signals.entries()].map(([matchKey, state]) => ({ matchKey, ...state })));
    if (req.method === 'GET' && url.pathname === '/api/events') return json(res, 200, { mapped: false, note: 'Raw source event candidates only until Marathon field semantics are verified.', items: store.events });
    if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, { mapped: false, note: 'Raw source statistic candidates only until Marathon field semantics are verified.', items: store.stats });
    if (req.method === 'GET' && url.pathname === '/api/raw/network') return json(res, 200, store.rawNetwork);
    if (req.method === 'GET' && url.pathname === '/api/raw/websocket') return json(res, 200, store.rawWebSocket);
    if (req.method === 'GET' && url.pathname === '/api/raw/structured') return json(res, 200, store.rawStructured);
    if (req.method === 'GET' && url.pathname.startsWith('/api/matches/')) {
      const key = decodeURIComponent(url.pathname.slice('/api/matches/'.length));
      const match = store.matches.get(key);
      return match ? json(res, 200, match) : json(res, 404, { error: 'MATCH_NOT_FOUND' });
    }
    if (req.method === 'GET' && url.pathname === '/api/settings') {
      return json(res, 200, { settings, defaults: DEFAULT_SETTINGS, runtime: healthSnapshot() });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/validate') {
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { ok: false, errors: ['Invalid JSON.'] }); }
      const checked = validateSettings(body);
      return json(res, checked.ok ? 200 : 400, checked);
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/apply') {
      if (applying) return json(res, 409, { ok: false, errors: ['Settings are already being applied.'] });
      const raw = await readBody(req);
      let body;
      try { body = JSON.parse(raw || '{}'); } catch { return json(res, 400, { ok: false, errors: ['Invalid JSON.'] }); }
      const checked = validateSettings(body);
      if (!checked.ok) return json(res, 400, checked);
      await applySettings(checked.value);
      return json(res, 200, { ok: true, settings, runtime: healthSnapshot() });
    }
    if (req.method === 'POST' && url.pathname === '/api/settings/reset') {
      if (applying) return json(res, 409, { ok: false, errors: ['Settings are already being applied.'] });
      await applySettings(clone(DEFAULT_SETTINGS));
      return json(res, 200, { ok: true, settings, runtime: healthSnapshot() });
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Marathon Engine] monitor  http://127.0.0.1:${PORT}/`);
  console.log(`[Marathon Engine] settings http://127.0.0.1:${PORT}/settings`);
  console.log(`[Marathon Engine] source   ${config.sourceUrl}`);
  console.log(`[Marathon Engine] detector ${config.detector.enabled ? 'ENABLED' : 'DISABLED'}`);
});

await startEngineCollector();

async function shutdown() {
  collectorGeneration += 1;
  try { if (collector) await collector.stop(); } catch {}
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
