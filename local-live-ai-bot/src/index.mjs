import path from 'node:path';
import {
  RUNTIME_DIR,
  appendJsonl,
  clampNumber,
  detectLmStudioModel,
  fetchJson,
  loadConfig,
  normalizeBaseUrl,
  readJson,
  recordKey,
  sleep,
  writeJsonAtomic
} from './shared.mjs';
import { executeXxx } from './executors/xxx.mjs';

const STATE_FILE = path.join(RUNTIME_DIR, 'state.json');
const DECISIONS_FILE = path.join(RUNTIME_DIR, 'decisions.jsonl');
const OUTBOX_FILE = path.join(RUNTIME_DIR, 'manual-outbox.jsonl');
const PAPER_FILE = path.join(RUNTIME_DIR, 'paper-ledger.jsonl');
const XXX_FILE = path.join(RUNTIME_DIR, 'xxx-ledger.jsonl');
const ONCE = process.argv.includes('--once');

let cachedModel = null;

function emptyState() {
  return {
    version: 1,
    initializedAt: null,
    seen: {},
    paperOpen: {},
    paperSettled: {},
    lastCycleAt: null,
    lastError: null
  };
}

function cleanText(value, max = 700) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function compactLiveMatch(row) {
  if (!row) return null;
  return {
    id: row.sourceMatchId ?? row.id ?? null,
    league: row.league ?? null,
    home: row.home ?? null,
    away: row.away ?? null,
    minute: row.minute ?? null,
    status: row.status ?? null,
    score: row.score ?? null,
    stats: row.stats ?? null,
    odds: row.odds ?? null,
    events: Array.isArray(row.events) ? row.events.slice(-12) : [],
    coreStatsComplete: Boolean(row.coreStatsComplete),
    sourceFreshnessSeconds: row.sourceFreshnessSeconds ?? null,
    warnings: Array.isArray(row.warnings) ? row.warnings.slice(0, 12) : [],
    engine: row.engine ? {
      decision: row.engine.decision ?? null,
      side: row.engine.side ?? null,
      momentum: row.engine.momentum ?? null,
      evidence: row.engine.evidence ?? null,
      line: row.engine.line ?? null,
      odds: row.engine.odds ?? null,
      streak: row.engine.streak ?? null,
      dailyBlocked: row.engine.dailyBlocked ?? null
    } : null
  };
}

function compactHistoryRecord(record) {
  return {
    key: recordKey(record),
    id: record.id ?? null,
    selectedAt: record.selectedAt ?? null,
    selectionDate: record.selectionDate ?? null,
    league: record.league ?? null,
    home: record.home ?? null,
    away: record.away ?? null,
    selectedSide: record.selectedSide ?? null,
    selectedTeam: record.selectedTeam ?? null,
    entryMinute: record.entryMinute ?? null,
    entryScore: record.entryScore ?? null,
    market: record.market ?? null,
    line: record.line ?? null,
    odds: record.odds ?? null,
    ouDirection: record.ouDirection ?? null,
    momentum: record.momentum ?? null,
    evidence: record.evidence ?? null,
    status: record.status ?? null,
    result: record.result ?? null,
    finalScore: record.finalScore ?? null,
    settledAt: record.settledAt ?? null
  };
}

function parseModelJson(content) {
  const raw = typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(part => part?.text || '').join('\n')
      : JSON.stringify(content ?? '');
  const stripped = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const first = stripped.indexOf('{');
  const last = stripped.lastIndexOf('}');
  if (first < 0 || last <= first) throw new Error(`Local AI did not return JSON: ${stripped.slice(0, 300)}`);
  return JSON.parse(stripped.slice(first, last + 1));
}

function normalizeDecision(raw) {
  const incoming = String(raw?.decision || '').toUpperCase().replace(/[ -]+/g, '_');
  const aliases = {
    APPROVE: 'PAPER_ACCEPT',
    ACCEPT: 'PAPER_ACCEPT',
    FOLLOW: 'PAPER_ACCEPT',
    PAPER: 'PAPER_ACCEPT',
    PAPER_ACCEPT: 'PAPER_ACCEPT',
    PASS: 'PASS',
    SKIP: 'PASS',
    REVIEW: 'REVIEW',
    WAIT: 'REVIEW'
  };
  return {
    decision: aliases[incoming] || 'REVIEW',
    confidence: Math.round(clampNumber(raw?.confidence, 0, 100, 0)),
    reason: cleanText(raw?.reason || 'No reason returned.'),
    summary: cleanText(raw?.summary || ''),
    riskFlags: Array.isArray(raw?.riskFlags)
      ? raw.riskFlags.map(v => cleanText(v, 180)).filter(Boolean).slice(0, 10)
      : []
  };
}

async function askLocalAi(config, historyRecord, liveMatch) {
  const base = normalizeBaseUrl(config.lmStudio.baseUrl);
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) {
    throw new Error(`LM Studio baseUrl must be local for this bot. Got ${url.hostname}`);
  }

  cachedModel ||= await detectLmStudioModel(config);
  const sourcePayload = {
    upstream: 'CAR 3.1 CONFIRMED HISTORY',
    record: compactHistoryRecord(historyRecord),
    liveContext: compactLiveMatch(liveMatch)
  };

  const system = [
    'You are the local NOMADTIPS3 live-data analysis assistant.',
    'CAR 3.1 upstream rules and confirmation are authoritative and frozen.',
    'Do not change, recompute, or invent upstream gates, odds, scores, stats, or settlement.',
    'This workflow is for analysis, manual review, and PAPER simulation only.',
    'Assess internal consistency and obvious data-quality/risk flags in the supplied record.',
    'Use PAPER_ACCEPT when the confirmed record is internally consistent, PASS when supplied data clearly contradicts it, and REVIEW when key evidence is missing or ambiguous.',
    'Return JSON only with keys: decision, confidence, reason, summary, riskFlags.',
    'decision must be PAPER_ACCEPT, PASS, or REVIEW. confidence must be 0-100.'
  ].join(' ');

  const response = await fetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: cachedModel,
      temperature: clampNumber(config.lmStudio.temperature, 0, 2, 0.1),
      max_tokens: Math.round(clampNumber(config.lmStudio.maxTokens, 64, 4096, 500)),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(sourcePayload) }
      ]
    })
  }, config.lmStudio.timeoutMs);

  const content = response?.choices?.[0]?.message?.content;
  if (content == null) throw new Error('LM Studio returned no assistant message.');
  return { model: cachedModel, ...normalizeDecision(parseModelJson(content)) };
}

async function fetchCar31(config) {
  const base = normalizeBaseUrl(config.car31.baseUrl);
  const limit = Math.max(1, Math.min(100, Math.round(Number(config.car31.historyLimit) || 100)));
  const stamp = Date.now();
  const [history, live] = await Promise.all([
    fetchJson(`${base}/history?page=1&limit=${limit}&t=${stamp}`, {}, 20000),
    fetchJson(`${base}/live?t=${stamp}`, {}, 20000)
  ]);
  if (!history?.ok) throw new Error('CAR 3.1 /history did not return ok=true.');
  if (!live?.ok) throw new Error('CAR 3.1 /live did not return ok=true.');
  return {
    records: Array.isArray(history.records) ? history.records : [],
    matches: Array.isArray(live.matches) ? live.matches : [],
    historyGeneratedAt: history.generatedAt ?? null,
    liveGeneratedAt: live.generatedAt ?? null
  };
}

function isSettled(record) {
  const status = String(record?.status || '').toUpperCase();
  const result = String(record?.result || '').toUpperCase();
  return status === 'SETTLED' || (result && result !== 'PENDING');
}

async function syncPaperSettlements(state, records) {
  let changed = false;
  const byKey = new Map(records.map(record => [recordKey(record), record]));
  for (const [key, opened] of Object.entries(state.paperOpen || {})) {
    if (state.paperSettled?.[key]) continue;
    const record = byKey.get(key);
    if (!record || !isSettled(record)) continue;
    const event = {
      type: 'PAPER_SETTLED',
      paperId: opened.paperId,
      recordKey: key,
      at: new Date().toISOString(),
      upstreamStatus: record.status ?? null,
      upstreamResult: record.result ?? null,
      finalScore: record.finalScore ?? null,
      settledAt: record.settledAt ?? null,
      note: 'Settlement copied from CAR 3.1 history; no local recalculation.'
    };
    await appendJsonl(PAPER_FILE, event);
    state.paperSettled[key] = event;
    changed = true;
    console.log(`[PAPER] settled ${key} -> ${event.upstreamResult || event.upstreamStatus || 'SETTLED'}`);
  }
  return changed;
}

async function routeDecision(config, state, payload) {
  if (config.execution.manualOutbox) {
    await appendJsonl(OUTBOX_FILE, {
      type: 'MANUAL_REVIEW',
      ...payload
    });
  }

  const mode = String(config.execution.mode || 'paper').toLowerCase();
  if (mode === 'paper') {
    if (payload.ai.decision !== 'PAPER_ACCEPT') return { mode, status: payload.ai.decision };
    if (state.paperOpen[payload.recordKey]) return { mode, status: 'ALREADY_OPEN' };
    const paperId = `paper-${Date.now()}-${String(payload.car31.id || 'match')}`;
    const event = {
      type: 'PAPER_OPEN',
      paperId,
      recordKey: payload.recordKey,
      at: new Date().toISOString(),
      stakeUnits: clampNumber(config.execution.paperStakeUnits, 0, 1000000, 1),
      selection: payload.car31.selectedTeam ?? null,
      side: payload.car31.selectedSide ?? null,
      market: payload.car31.market ?? null,
      line: payload.car31.line ?? null,
      odds: payload.car31.odds ?? null,
      entryMinute: payload.car31.entryMinute ?? null,
      entryScore: payload.car31.entryScore ?? null,
      ai: payload.ai,
      note: 'PAPER simulation only.'
    };
    await appendJsonl(PAPER_FILE, event);
    state.paperOpen[payload.recordKey] = { paperId, openedAt: event.at };
    console.log(`\u0007[PAPER] ${event.selection || payload.recordKey} | ${event.market || 'MARKET'} | ${event.odds ?? 'odds n/a'}`);
    return { mode, status: 'PAPER_OPEN', paperId };
  }

  if (mode === 'manual') return { mode, status: 'OUTBOX_ONLY' };

  if (mode === 'xxx') {
    const result = await executeXxx(payload, config.execution.xxx || {});
    await appendJsonl(XXX_FILE, { type: 'XXX_RESULT', payload, result });
    return { mode, status: result.status, result };
  }

  throw new Error(`Unknown execution.mode: ${mode}. Use paper, manual, or xxx.`);
}

async function processRecord(config, state, record, liveById) {
  const key = recordKey(record);
  if (!key || key === ':::') throw new Error('CAR 3.1 history record has no stable key.');
  const liveMatch = liveById.get(String(record.id)) || null;
  if (!liveMatch && !config.analysis.allowMissingLiveContext) {
    console.log(`[WAIT] ${key} has no live context yet.`);
    return false;
  }

  const ai = await askLocalAi(config, record, liveMatch);
  const payload = {
    recordKey: key,
    generatedAt: new Date().toISOString(),
    source: 'CAR3.1_HISTORY',
    trigger: config.analysis.trigger,
    car31: compactHistoryRecord(record),
    live: compactLiveMatch(liveMatch),
    ai
  };
  await appendJsonl(DECISIONS_FILE, payload);
  const routed = await routeDecision(config, state, payload);
  state.seen[key] = {
    at: payload.generatedAt,
    decision: ai.decision,
    confidence: ai.confidence,
    route: routed?.status || null
  };
  console.log(`[AI] ${record.selectedTeam || key} -> ${ai.decision} ${ai.confidence}% | ${ai.reason}`);
  return true;
}

async function bootstrap(config, state, records) {
  state.initializedAt = new Date().toISOString();
  const mode = String(config.car31.bootstrapMode || 'tail').toLowerCase();
  const sorted = [...records].sort((a, b) => Date.parse(a.selectedAt || 0) - Date.parse(b.selectedAt || 0));

  if (mode === 'tail') {
    for (const record of sorted) {
      state.seen[recordKey(record)] = { at: state.initializedAt, decision: 'BOOTSTRAP_SKIPPED', route: null };
    }
    console.log(`[BOOT] tail mode: primed ${sorted.length} existing CAR 3.1 history record(s); waiting for the next confirmed signal.`);
    return [];
  }

  if (mode === 'replay-latest' && sorted.length) {
    for (const record of sorted.slice(0, -1)) {
      state.seen[recordKey(record)] = { at: state.initializedAt, decision: 'BOOTSTRAP_SKIPPED', route: null };
    }
    return sorted.slice(-1);
  }

  if (mode === 'replay-all') return sorted;
  if (mode !== 'replay-latest') throw new Error(`Unknown car31.bootstrapMode: ${mode}`);
  return [];
}

async function cycle(config, state) {
  const data = await fetchCar31(config);
  const liveById = new Map(data.matches.map(match => [String(match.sourceMatchId ?? match.id), match]));
  let candidates;

  if (!state.initializedAt) {
    candidates = await bootstrap(config, state, data.records);
  } else {
    candidates = data.records
      .filter(record => !state.seen[recordKey(record)])
      .sort((a, b) => Date.parse(a.selectedAt || 0) - Date.parse(b.selectedAt || 0));
  }

  let processed = 0;
  for (const record of candidates) {
    if (config.analysis.requireCar31Confirmation && !record.selectedAt) continue;
    if (await processRecord(config, state, record, liveById)) processed++;
  }

  const settlementChanged = await syncPaperSettlements(state, data.records);
  state.lastCycleAt = new Date().toISOString();
  state.lastError = null;
  await writeJsonAtomic(STATE_FILE, state);
  console.log(`[CYCLE] history=${data.records.length} live=${data.matches.length} new=${processed}${settlementChanged ? ' paper-settlement-updated' : ''}`);
}

async function main() {
  const config = await loadConfig();
  const state = await readJson(STATE_FILE, emptyState());
  console.log('NOMADTIPS3 LOCAL LIVE AI BOT');
  console.log(`CAR 3.1 : ${normalizeBaseUrl(config.car31.baseUrl)}`);
  console.log(`LM Studio: ${normalizeBaseUrl(config.lmStudio.baseUrl)}`);
  console.log(`Mode     : ${config.execution.mode} | bootstrap=${config.car31.bootstrapMode}`);

  while (true) {
    try {
      await cycle(config, state);
    } catch (error) {
      state.lastCycleAt = new Date().toISOString();
      state.lastError = String(error?.stack || error?.message || error);
      await writeJsonAtomic(STATE_FILE, state);
      console.error(`[ERROR] ${error?.message || error}`);
      if (ONCE) process.exitCode = 1;
    }
    if (ONCE) break;
    await sleep(Math.max(5, Number(config.car31.pollSeconds) || 15) * 1000);
  }
}

process.on('SIGINT', () => {
  console.log('\nStopped.');
  process.exit(0);
});

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
