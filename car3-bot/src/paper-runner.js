import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REQUIRED = [
  'signal_id',
  'fixture_id',
  'created_at',
  'home',
  'away',
  'market',
  'selection',
  'target_odds'
];

function fail(message) {
  console.error(`[CAR3 PAPER BOT] ${message}`);
  process.exit(1);
}

function readSignal(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Cannot read signal file: ${error.message}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`Signal is not valid JSON: ${error.message}`);
  }
}

function validate(signal) {
  const missing = REQUIRED.filter(key => signal?.[key] === undefined || signal?.[key] === null || signal?.[key] === '');
  if (missing.length) fail(`Missing required fields: ${missing.join(', ')}`);

  const targetOdds = Number(signal.target_odds);
  if (!Number.isFinite(targetOdds) || targetOdds <= 1) fail('target_odds must be a decimal price greater than 1.00');

  const createdAt = Date.parse(signal.created_at);
  if (!Number.isFinite(createdAt)) fail('created_at must be a valid ISO date/time');

  return {
    ...signal,
    fixture_id: String(signal.fixture_id),
    target_odds: targetOdds
  };
}

function buildPaperOrder(signal) {
  const now = new Date().toISOString();
  return {
    schema: 'nomadtips3.car3.paper-order.v1',
    order_id: `PAPER-${signal.signal_id}`,
    mode: 'PAPER_ONLY',
    action: 'WOULD_EXECUTE',
    status: 'RECORDED',
    created_at: now,
    signal_created_at: signal.created_at,
    signal_id: signal.signal_id,
    fixture_id: signal.fixture_id,
    match: {
      home: signal.home,
      away: signal.away
    },
    live_context: {
      minute: signal.minute ?? null,
      score: signal.score ?? null
    },
    command: {
      market: signal.market,
      selection: signal.selection,
      target_odds: signal.target_odds
    },
    model_context: {
      confidence: signal.confidence ?? null,
      reason: signal.reason ?? null,
      source: signal.source ?? 'NOMAD LIVE DETECTOR'
    },
    execution: {
      website: null,
      credentials_used: false,
      network_request_sent: false,
      real_transaction_sent: false
    }
  };
}

function appendAudit(order) {
  const currentFile = fileURLToPath(import.meta.url);
  const projectDir = path.resolve(path.dirname(currentFile), '..');
  const logsDir = path.join(projectDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const target = path.join(logsDir, 'paper-orders.jsonl');
  fs.appendFileSync(target, `${JSON.stringify(order)}\n`, 'utf8');
  return target;
}

const input = process.argv[2];
if (!input) fail('Usage: node src/paper-runner.js <signal.json>');

const signal = validate(readSignal(path.resolve(input)));
const order = buildPaperOrder(signal);
const auditPath = appendAudit(order);

console.log(JSON.stringify({ ok: true, order, audit_file: auditPath }, null, 2));
