import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, 'owner-candidate-pool.json');
const RESULT_PATH = path.join(ROOT, 'result-feed.json');
const STATE_PATH = path.join(ROOT, 'ai', 'ai-learning-state.json');

const MODEL_VERSION = 'add-k-ai-v0.1';
const AUTOMATION_VERSION = 'car4-auto-24h-v0.2';
const LEARNING_RATE = 0.22;
const FEATURE_NAMES = ['abc', 'standing', 'favorite', 'highOdds', 'marketGap', 'form'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const sigmoid = value => 1 / (1 + Math.exp(-value));
const logit = p => Math.log(p / (1 - p));
const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
const nowIso = () => new Date().toISOString();

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function emptyState() {
  const now = nowIso();
  return {
    version: MODEL_VERSION,
    automationVersion: AUTOMATION_VERSION,
    mode: 'AUTO_SHADOW_24H_READ_ONLY',
    createdAt: now,
    updatedAt: now,
    lastAutoRunAt: null,
    source: {
      candidatePool: 'owner-candidate-pool.json',
      resultFeed: 'result-feed.json',
      footballApiCallsByCar4: 0
    },
    weights: Object.fromEntries(FEATURE_NAMES.map(name => [name, 0])),
    snapshots: {},
    trainedIds: [],
    skippedTrainingIds: [],
    logs: [],
    trainingSamples: 0,
    automation: {
      runs: 0,
      observations: 0,
      resultsMerged: 0,
      trainedThisRun: 0,
      skippedTimingThisRun: 0
    }
  };
}

function loadState() {
  const saved = readJson(STATE_PATH, null);
  if (!saved || saved.version !== MODEL_VERSION) return emptyState();
  const base = emptyState();
  return {
    ...base,
    ...saved,
    source: {...base.source, ...(saved.source || {})},
    automation: {...base.automation, ...(saved.automation || {})},
    weights: {...base.weights, ...(saved.weights || {})},
    snapshots: saved.snapshots || {},
    trainedIds: Array.isArray(saved.trainedIds) ? saved.trainedIds : [],
    skippedTrainingIds: Array.isArray(saved.skippedTrainingIds) ? saved.skippedTrainingIds : [],
    logs: Array.isArray(saved.logs) ? saved.logs : [],
    trainingSamples: Number(saved.trainingSamples || 0)
  };
}

function addLog(state, title, detail, delta = '') {
  state.logs.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    at: nowIso(),
    title,
    detail,
    delta
  });
  state.logs = state.logs.slice(0, 120);
}

function abcScore(record) {
  const direct = num(record.abcScore ?? record.abc_score);
  if (direct !== null) return clamp(direct, -1, 1);
  const text = String(record.abcResult ?? record.commonOpponentsResult ?? record.abc ?? '').toUpperCase();
  if (!text || text.includes('LIMITED') || text.includes('NO RELIABLE')) return 0;
  if (/(STRONG|CLEAR|POSITIVE|ADVANTAGE|FAVOU?R|BETTER|SUPERIOR|SUPPORT)/.test(text)) return 1;
  if (/(NEGATIVE|DISADVANTAGE|WEAKER|WORSE|AGAINST|CAUTION)/.test(text)) return -1;
  return 0;
}

function standingScore(record) {
  const direct = num(record.standingScore ?? record.standing_score ?? record.tableEdge ?? record.table_edge);
  if (direct !== null) return clamp(direct, -1, 1);
  const homeRank = num(record.homeRank ?? record.home_rank ?? record.homePosition ?? record.home_position);
  const awayRank = num(record.awayRank ?? record.away_rank ?? record.awayPosition ?? record.away_position);
  if (!homeRank || !awayRank) return 0;
  const raw = clamp((awayRank - homeRank) / 15, -1, 1);
  const side = String(record.pickSide || '').toLowerCase();
  return side === 'away' ? -raw : side === 'draw' ? 0 : raw;
}

function formScore(record) {
  const direct = num(record.formEdge ?? record.form_edge ?? record.recentFormEdge ?? record.recent_form_edge);
  return direct === null ? 0 : clamp(direct, -1, 1);
}

function impliedProbability(odds) {
  return odds && odds > 0 ? clamp(1 / odds, 0.02, 0.98) : null;
}

function oddsZone(odds) {
  if (!odds || odds <= 0) return {key: 'unknown', label: 'N/A'};
  if (odds <= 1.80) return {key: 'favorite', label: '1.20–1.80'};
  if (odds < 2.00) return {key: 'bridge', label: '1.81–1.99'};
  return {key: 'value', label: '2.00+'};
}

function featureVector(snapshot) {
  const market = snapshot.marketProbability ?? 0.5;
  const baseline = snapshot.baselineProbability ?? 0.5;
  return {
    abc: clamp(Number(snapshot.abcScore || 0), -1, 1),
    standing: clamp(Number(snapshot.standingScore || 0), -1, 1),
    favorite: snapshot.odds && snapshot.odds <= 1.80 ? 1 : 0,
    highOdds: snapshot.odds && snapshot.odds >= 2.00 ? 1 : 0,
    marketGap: clamp((baseline - market) * 4, -1, 1),
    form: clamp(Number(snapshot.formEdge || 0), -1, 1)
  };
}

function predict(snapshot, state) {
  const base = clamp(Number(snapshot.baselineProbability || 0.5), 0.05, 0.95);
  const features = featureVector(snapshot);
  const correction = FEATURE_NAMES.reduce(
    (sum, name) => sum + Number(features[name] || 0) * Number(state.weights[name] || 0),
    0
  );
  const learned = sigmoid(logit(base) + correction);
  const sampleTrust = clamp(state.trainingSamples / 80, 0, 0.7);
  const probability = base * (1 - sampleTrust) + learned * sampleTrust;
  const gap = snapshot.marketProbability === null ? null : probability - snapshot.marketProbability;
  return {probability, gap, features};
}

function snapshotId(candidate) {
  return String(candidate.slug || `auto-${candidate.fixtureId}` || candidate.fixtureId);
}

function makeSnapshot(candidate, pool, existing = {}) {
  const odds = num(candidate.odds);
  const confidence = num(candidate.confidence);
  const kickoffUtc = candidate.kickoffUtc || existing.kickoffUtc || null;
  const sourceGeneratedAt = pool.generatedAt || existing.sourceGeneratedAt || null;
  const sourceTime = Date.parse(sourceGeneratedAt || '');
  const kickoffTime = Date.parse(kickoffUtc || '');
  const preMatchSnapshot = Number.isFinite(sourceTime) && Number.isFinite(kickoffTime)
    ? sourceTime <= kickoffTime
    : false;

  return {
    ...existing,
    fixtureId: snapshotId(candidate),
    providerFixtureId: String(candidate.fixtureId ?? existing.providerFixtureId ?? ''),
    selectionDate: pool.selectionDate || pool.generatedAt?.slice(0, 10) || existing.selectionDate || null,
    sourceGeneratedAt,
    firstSeenAt: existing.firstSeenAt || nowIso(),
    lastSeenAt: nowIso(),
    kickoffUtc,
    league: candidate.league || existing.league || 'Unknown league',
    country: candidate.country ?? existing.country ?? null,
    home: candidate.home || existing.home || 'Home',
    away: candidate.away || existing.away || 'Away',
    pick: candidate.pick || existing.pick || '—',
    pickSide: candidate.pickSide || existing.pickSide || null,
    odds,
    confidence,
    baselineProbability: confidence === null ? 0.5 : clamp(confidence / 100, 0.05, 0.95),
    marketProbability: impliedProbability(odds),
    oddsZone: oddsZone(odds).label,
    strength: num(candidate.strength),
    abcResult: candidate.abcResult ?? candidate.commonOpponentsResult ?? existing.abcResult ?? '—',
    abcScore: abcScore(candidate),
    standingScore: standingScore(candidate),
    homeRank: num(candidate.homeRank ?? candidate.home_rank ?? existing.homeRank),
    awayRank: num(candidate.awayRank ?? candidate.away_rank ?? existing.awayRank),
    formEdge: formScore(candidate),
    preMatchSnapshot,
    outcome: existing.outcome || 'pending',
    resultConfirmed: Boolean(existing.resultConfirmed),
    homeScore: existing.homeScore ?? null,
    awayScore: existing.awayScore ?? null,
    resultUpdatedAt: existing.resultUpdatedAt ?? null
  };
}

function mergeCandidates(state, pool) {
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates.filter(item => item?.published !== false) : [];
  for (const candidate of candidates) {
    const id = snapshotId(candidate);
    state.snapshots[id] = makeSnapshot(candidate, pool, state.snapshots[id]);
  }
  return candidates.length;
}

function mergeResults(state, feed) {
  const byProvider = new Map();
  for (const snapshot of Object.values(state.snapshots)) {
    if (snapshot.providerFixtureId) byProvider.set(String(snapshot.providerFixtureId), snapshot.fixtureId);
  }

  let merged = 0;
  for (const result of Array.isArray(feed?.results) ? feed.results : []) {
    const providerId = String(result.providerFixtureId ?? '').trim();
    const resultFixture = String(result.fixtureId ?? '').toLowerCase();
    const fixtureId = byProvider.get(providerId) || Object.keys(state.snapshots).find(id => id.toLowerCase() === resultFixture);
    if (!fixtureId || !state.snapshots[fixtureId]) continue;
    const snapshot = state.snapshots[fixtureId];
    snapshot.resultConfirmed = Boolean(result.resultConfirmed);
    snapshot.outcome = result.outcome || snapshot.outcome || 'pending';
    snapshot.homeScore = num(result.homeScore);
    snapshot.awayScore = num(result.awayScore);
    snapshot.matchStatus = result.status || result.providerStatus || snapshot.matchStatus || null;
    snapshot.resultUpdatedAt = result.updatedAt || feed.generatedAt || nowIso();
    snapshot.lastSeenAt = nowIso();
    merged += 1;
  }
  return merged;
}

function outcomeTarget(snapshot) {
  if (!snapshot.resultConfirmed) return null;
  const outcome = String(snapshot.outcome || '').toLowerCase();
  if (['correct', 'win', 'won'].includes(outcome)) return 1;
  if (['incorrect', 'loss', 'lost'].includes(outcome)) return 0;
  return null;
}

function train(state) {
  const trained = new Set(state.trainedIds);
  const skipped = new Set(state.skippedTrainingIds);
  let learned = 0;
  let skippedTiming = 0;
  const settled = Object.values(state.snapshots)
    .filter(snapshot => outcomeTarget(snapshot) !== null)
    .sort((a, b) => Date.parse(a.kickoffUtc || 0) - Date.parse(b.kickoffUtc || 0));

  for (const snapshot of settled) {
    if (trained.has(snapshot.fixtureId)) continue;
    if (!snapshot.preMatchSnapshot) {
      if (!skipped.has(snapshot.fixtureId)) {
        skipped.add(snapshot.fixtureId);
        state.skippedTrainingIds.push(snapshot.fixtureId);
        skippedTiming += 1;
        addLog(
          state,
          `${snapshot.home} vs ${snapshot.away}`,
          'Result observed but not used for training because the stored candidate snapshot was not verified as pre-match. Data-leak guard protected the model.',
          'SKIPPED'
        );
      }
      continue;
    }

    const target = outcomeTarget(snapshot);
    const before = predict(snapshot, state);
    const error = target - before.probability;
    for (const name of FEATURE_NAMES) {
      const gradient = error * Number(before.features[name] || 0);
      state.weights[name] = clamp(Number(state.weights[name] || 0) + LEARNING_RATE * gradient, -1.5, 1.5);
    }
    state.trainingSamples += 1;
    state.trainedIds.push(snapshot.fixtureId);
    trained.add(snapshot.fixtureId);
    learned += 1;

    addLog(
      state,
      `${snapshot.home} vs ${snapshot.away}`,
      `${target ? 'Correct' : 'Incorrect'} result learned automatically · Pick ${snapshot.pick} · Odds ${snapshot.odds?.toFixed?.(2) || 'N/A'} · Zone ${oddsZone(snapshot.odds).label} · A–B–C ${before.features.abc >= 0 ? '+' : ''}${before.features.abc.toFixed(2)} · table ${before.features.standing >= 0 ? '+' : ''}${before.features.standing.toFixed(2)}.`,
      `error ${error >= 0 ? '+' : ''}${(error * 100).toFixed(1)}pp`
    );
  }
  return {learned, skippedTiming};
}

function buildReport(state) {
  const snapshots = Object.values(state.snapshots);
  const settled = snapshots.filter(snapshot => outcomeTarget(snapshot) !== null);
  const zones = ['favorite', 'bridge', 'value'];
  const performance = {};

  for (const zoneKey of zones) {
    const items = settled.filter(snapshot => oddsZone(snapshot.odds).key === zoneKey);
    const wins = items.filter(snapshot => outcomeTarget(snapshot) === 1).length;
    const losses = items.filter(snapshot => outcomeTarget(snapshot) === 0).length;
    const total = wins + losses;
    performance[zoneKey] = {
      total,
      wins,
      losses,
      winRate: total ? Number((wins / total).toFixed(4)) : null
    };
  }

  const gaps = snapshots
    .map(snapshot => predict(snapshot, state).gap)
    .filter(value => value !== null && Number.isFinite(value));
  const averageValueGap = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null;

  let modelState = 'COLD';
  if (state.trainingSamples >= 5) modelState = 'WARMING';
  if (state.trainingSamples >= 30) modelState = 'LEARNING';
  if (state.trainingSamples >= 100) modelState = 'MATURE';

  state.report = {
    observedMatches: snapshots.length,
    settledSamples: settled.length,
    trainingSamples: state.trainingSamples,
    modelState,
    averageValueGap,
    performanceByOddsZone: performance,
    weights: {...state.weights},
    lastResultFeedAt: state.source.resultFeedGeneratedAt || null,
    lastCandidatePoolAt: state.source.candidatePoolGeneratedAt || null
  };
}

function main() {
  const pool = readJson(CANDIDATE_PATH, {candidates: []});
  const feed = readJson(RESULT_PATH, {results: []});
  const state = loadState();

  const observed = mergeCandidates(state, pool);
  const resultsMerged = mergeResults(state, feed);
  const {learned, skippedTiming} = train(state);

  state.automationVersion = AUTOMATION_VERSION;
  state.mode = 'AUTO_SHADOW_24H_READ_ONLY';
  state.lastAutoRunAt = nowIso();
  state.updatedAt = state.lastAutoRunAt;
  state.source.candidatePoolGeneratedAt = pool.generatedAt || null;
  state.source.resultFeedGeneratedAt = feed.generatedAt || null;
  state.source.footballApiCallsByCar4 = 0;
  state.automation.runs = Number(state.automation.runs || 0) + 1;
  state.automation.observations = observed;
  state.automation.resultsMerged = resultsMerged;
  state.automation.trainedThisRun = learned;
  state.automation.skippedTimingThisRun = skippedTiming;

  if (learned || skippedTiming) {
    addLog(
      state,
      'Auto 24H cycle',
      `Observed ${observed} candidate records and merged ${resultsMerged} result records from existing repository feeds. Car 4 made zero Football API calls.`,
      `${learned} trained`
    );
  }

  buildReport(state);
  fs.mkdirSync(path.dirname(STATE_PATH), {recursive: true});
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  console.log(`[Car 4] observed=${observed} results=${resultsMerged} trained=${learned} skippedTiming=${skippedTiming} totalSamples=${state.trainingSamples}`);
}

main();
