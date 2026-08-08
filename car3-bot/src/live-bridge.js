import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUS_URL = 'https://nomadtips3-test-api.mccarey-supon.workers.dev/auto-scan-status';
const POLL_MS = 10000;

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const inboxDir = path.join(projectDir, 'signals', 'inbox');
const stateDir = path.join(projectDir, 'state');
const stateFile = path.join(stateDir, 'live-bridge-seen.json');

fs.mkdirSync(inboxDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });

function loadSeen() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen) {
  fs.writeFileSync(stateFile, JSON.stringify([...seen].slice(-1000), null, 2), 'utf8');
}

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function toSignal(row, payload) {
  const updatedMs = Number(row.updated_at || Date.now());
  const selectedSide = String(row.selected_side || 'HOME').toUpperCase();
  return {
    signal_id: `LIVE-${row.fixture_id}-${selectedSide}-${updatedMs}`,
    fixture_id: String(row.fixture_id),
    created_at: new Date(updatedMs).toISOString(),
    home: String(row.home || 'Selected Team'),
    away: String(row.away || 'Opponent'),
    market: String(payload?.config?.market || 'LIVE_SIGNAL'),
    selection: selectedSide,
    minute: Number(row.last_minute ?? 0),
    score: {
      home: Number(row.home_score ?? 0),
      away: Number(row.away_score ?? 0)
    },
    confidence: row.last_home_percent == null ? null : Number(row.last_home_percent),
    reason: `Triggered by NOMAD live detector · streak ${Number(row.streak || 0)}`,
    source: 'NOMAD LIVE DETECTOR / AUTO-SCAN-STATUS',
    target_odds: null
  };
}

const seen = loadSeen();
let busy = false;

async function poll() {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch(STATUS_URL, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok || !payload?.online) {
      console.log(`[${new Date().toISOString()}] DETECTOR WAITING · online=${Boolean(payload?.online)}`);
      return;
    }

    const active = Array.isArray(payload.active) ? payload.active : [];
    const triggered = active.filter(row => Number(row.triggered) === 1);

    for (const row of triggered) {
      const key = `${row.fixture_id}:${row.selected_side || 'HOME'}:${row.config_version || 0}`;
      if (seen.has(key)) continue;

      const signal = toSignal(row, payload);
      const fileName = `${safeName(signal.signal_id)}.json`;
      const target = path.join(inboxDir, fileName);
      fs.writeFileSync(target, JSON.stringify(signal, null, 2), 'utf8');
      seen.add(key);
      saveSeen(seen);
      console.log(`[${new Date().toISOString()}] REAL DETECTOR SIGNAL -> ${fileName}`);
    }

    if (!triggered.length) {
      console.log(`[${new Date().toISOString()}] detector online · no triggered signal`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] bridge error: ${error.message}`);
  } finally {
    busy = false;
  }
}

console.log('========================================');
console.log('NOMAD TIPS 3 — CAR 3 LIVE DETECTOR BRIDGE');
console.log('SOURCE: EXISTING AUTO-SCAN STATUS');
console.log('API-FOOTBALL EXTRA CALLS: 0');
console.log('DESTINATION: PAPER BOT INBOX');
console.log('REAL TRANSACTION: DISABLED');
console.log('Press Ctrl+C to stop.');
console.log('========================================');

await poll();
const timer = setInterval(poll, POLL_MS);
process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nCar 3 live bridge stopped.');
  process.exit(0);
});
