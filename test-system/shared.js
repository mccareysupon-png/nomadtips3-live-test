export const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
export const DATASET_ID = 'manual-test-v2-day7-2026-08-05-v4';

const checks = Object.freeze({
  recentForm: true,
  homeAwayForm: true,
  standings: true,
  goalsForAgainst: true,
  h2h: true,
  commonOpponents: true,
  injuriesSuspensions: true,
  fatigue: true,
  motivation: true
});

const pendingMarket = (pick, confidence) => Object.freeze({
  pick,
  odds: null,
  oddsStatus: 'PENDING',
  confidence,
  outcome: 'pending'
});

export const DEFAULT_PICKS = Object.freeze([
  {
    fixtureId: 'DAY7-APOLLON-CZARNI',
    pickDate: '2026-08-05',
    league: "UEFA Women's Champions League Qualifying",
    home: 'Apollon Ladies FC',
    away: 'Czarni Sosnowiec Women',
    kickoffUtc: '2026-08-05T14:00:00.000Z',
    pick: 'AWAY',
    pickLabel: 'Czarni Sosnowiec Women Win',
    odds: 1.75,
    bookmaker: 'Locked market',
    confidence: 57,
    predictedScore: '1–2',
    markets: {
      btts: pendingMarket('Yes', 61),
      doubleChance: pendingMarket('X2 — Czarni or Draw', 68),
      asianHandicap: pendingMarket('Czarni 0', 60)
    },
    reason: 'Czarni scored 10 and conceded 2 across the previous two European qualifiers. Their attacking form supports the away selection, while the Asian Handicap line is kept conservative because Apollon hosts the match.',
    abcResult: 'LIMITED — no reliable like-for-like common-opponent sample',
    source: 'NOMAD SYSTEM · MANUAL TEST V.2',
    status: 'WAITING_FOR_RESULT',
    resultSource: null,
    resultConfirmed: false,
    outcome: 'pending',
    homeScore: null,
    awayScore: null,
    checks
  },
  {
    fixtureId: 'DAY7-SLAVIA-RANGERS',
    pickDate: '2026-08-05',
    league: "UEFA Women's Champions League Qualifying",
    home: 'Slavia Praha Women',
    away: 'Rangers Women',
    kickoffUtc: '2026-08-05T18:30:00.000Z',
    pick: 'HOME',
    pickLabel: 'Slavia Praha Women Win',
    odds: 1.80,
    bookmaker: 'Locked market',
    confidence: 56,
    predictedScore: '2–1',
    markets: {
      btts: pendingMarket('Yes', 58),
      doubleChance: pendingMarket('1X — Slavia or Draw', 66),
      asianHandicap: pendingMarket('Slavia 0', 60)
    },
    reason: 'UEFA records Slavia Praha as the home-designated team, although the mini-tournament is hosted at Broadwood. Slavia carries the stronger recent attacking level; the safer secondary positions are 1X and Slavia 0.',
    abcResult: 'LIMITED — no reliable like-for-like common-opponent sample',
    source: 'NOMAD SYSTEM · MANUAL TEST V.2',
    status: 'WAITING_FOR_RESULT',
    resultSource: null,
    resultConfirmed: false,
    outcome: 'pending',
    homeScore: null,
    awayScore: null,
    checks
  }
]);

export const INTEGRITY_NOTE = 'Shamrock Rovers vs Egnatia was removed from the official set because the recorded lock time was after kickoff. It is excluded from all statistics.';

function normalizeMarket(value, fallbackPick = '—') {
  if (value && typeof value === 'object') {
    return {
      pick: value.pick ?? fallbackPick,
      odds: Number(value.odds) > 0 ? Number(value.odds) : null,
      oddsStatus: value.oddsStatus ?? (Number(value.odds) > 0 ? 'LOCKED' : 'PENDING'),
      confidence: Number(value.confidence ?? 0),
      outcome: value.outcome ?? 'pending',
      settlement: value.settlement ?? null
    };
  }
  return {
    pick: value ?? fallbackPick,
    odds: null,
    oddsStatus: 'PENDING',
    confidence: 0,
    outcome: 'pending',
    settlement: null
  };
}

function normalize(record) {
  const legacyMarkets = {
    btts: record.btts,
    doubleChance: record.doubleChance ?? record.double_chance,
    asianHandicap: record.asianHandicap ?? record.asian_handicap
  };
  const markets = record.markets ?? legacyMarkets;
  return {
    fixtureId: record.fixtureId ?? record.id ?? crypto.randomUUID(),
    pickDate: record.pickDate ?? record.date ?? new Date(record.kickoffUtc ?? Date.now()).toISOString().slice(0, 10),
    league: record.league ?? 'Test League',
    home: record.home ?? record.homeTeam ?? 'Home',
    away: record.away ?? record.awayTeam ?? 'Away',
    kickoffUtc: record.kickoffUtc ?? record.kickoff_utc ?? new Date().toISOString(),
    pick: String(record.pick ?? record.pick_1x2 ?? 'HOME').toUpperCase(),
    pickLabel: record.pickLabel ?? record.pick_label ?? record.pick ?? 'HOME',
    odds: Number(record.odds ?? record.lockedOdds ?? record.locked_odds ?? 0),
    bookmaker: record.bookmaker ?? 'Locked market',
    confidence: Number(record.confidence ?? 0),
    predictedScore: record.predictedScore ?? record.predicted_score ?? '—',
    markets: {
      btts: normalizeMarket(markets?.btts, '—'),
      doubleChance: normalizeMarket(markets?.doubleChance, '—'),
      asianHandicap: normalizeMarket(markets?.asianHandicap, '—')
    },
    reason: record.reason ?? record.analysisReason ?? 'Draft Store record.',
    abcResult: record.abcResult ?? record.commonOpponentsResult ?? '—',
    source: record.source ?? record.resultSource ?? 'DRAFT STORE',
    status: record.status ?? record.workflowStatus ?? 'WAITING_FOR_RESULT',
    resultSource: record.resultSource ?? null,
    resultConfirmed: Boolean(record.resultConfirmed),
    outcome: record.outcome ?? 'pending',
    homeScore: record.homeScore ?? null,
    awayScore: record.awayScore ?? null
  };
}

function createLockedState() {
  const now = new Date().toISOString();
  return {
    datasetId: DATASET_ID,
    mode: 'DRAFT',
    ruleVersions: [{
      id: 'manual-v2-day7-2026-08-05',
      name: 'Manual Test v.2 — Day 7',
      createdAt: now,
      minimumOdds: 1.70,
      minimumConfidence: 55,
      unlimitedSelections: true
    }],
    candidates: [],
    reviewItems: [],
    publishedPicks: DEFAULT_PICKS.map(item => ({
      ...item,
      ruleVersionId: 'manual-v2-day7-2026-08-05',
      lockedAt: '2026-08-05T02:42:00.000Z'
    })),
    auditLog: [{
      id: 'seed-day7-2026-08-05',
      createdAt: now,
      actor: 'test-system',
      action: 'LOCKED_SET_IMPORTED',
      entity: '2026-08-05',
      details: { count: DEFAULT_PICKS.length, excluded: 1, productionWrite: false }
    }],
    analysisRun: null,
    updatedAt: now
  };
}

function shouldSeed(state) {
  return state?.datasetId !== DATASET_ID || !Array.isArray(state?.publishedPicks);
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? JSON.parse(raw) : null;
    if (shouldSeed(state)) {
      const seeded = createLockedState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded.publishedPicks.map(normalize);
    }
    return state.publishedPicks.map(normalize);
  } catch {
    const seeded = createLockedState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded.publishedPicks.map(normalize);
  }
}

export function buildSummary(records) {
  const correct = records.filter(record => record.outcome === 'correct').length;
  const incorrect = records.filter(record => record.outcome === 'incorrect').length;
  const voids = records.filter(record => record.outcome === 'void').length;
  const pending = records.filter(record => !['correct', 'incorrect', 'void'].includes(record.outcome)).length;
  const settled = correct + incorrect;
  return {
    total: records.length,
    correct,
    incorrect,
    voids,
    pending,
    settled,
    accuracy: settled ? Number(((correct / settled) * 100).toFixed(2)) : 0,
    averageOdds: records.length ? Number((records.reduce((sum, record) => sum + Number(record.odds || 0), 0) / records.length).toFixed(2)) : 0
  };
}

function standardMarketStats(records, key) {
  const values = records.map(record => record.markets?.[key]).filter(Boolean);
  const correct = values.filter(market => market.outcome === 'correct').length;
  const incorrect = values.filter(market => market.outcome === 'incorrect').length;
  const voids = values.filter(market => market.outcome === 'void').length;
  const pending = values.length - correct - incorrect - voids;
  const settled = correct + incorrect;
  return {
    total: values.length,
    correct,
    incorrect,
    voids,
    pending,
    settled,
    accuracy: settled ? Number(((correct / settled) * 100).toFixed(2)) : 0
  };
}

function asianMarketStats(records) {
  const values = records.map(record => record.markets?.asianHandicap).filter(Boolean);
  const counts = {
    win: 0,
    halfWin: 0,
    push: 0,
    halfLoss: 0,
    loss: 0,
    pending: 0
  };
  values.forEach(market => {
    const outcome = String(market.outcome ?? 'pending');
    if (outcome === 'win' || outcome === 'correct') counts.win += 1;
    else if (outcome === 'half-win') counts.halfWin += 1;
    else if (outcome === 'push' || outcome === 'void') counts.push += 1;
    else if (outcome === 'half-loss') counts.halfLoss += 1;
    else if (outcome === 'loss' || outcome === 'incorrect') counts.loss += 1;
    else counts.pending += 1;
  });
  const decisions = counts.win + counts.halfWin + counts.halfLoss + counts.loss;
  const weightedRate = decisions
    ? Number((((counts.win + counts.halfWin * 0.5) / decisions) * 100).toFixed(2))
    : 0;
  return { total: values.length, ...counts, decisions, weightedRate };
}

export function buildMarketSummary(records) {
  return {
    oneXTwo: buildSummary(records),
    btts: standardMarketStats(records, 'btts'),
    doubleChance: standardMarketStats(records, 'doubleChance'),
    asianHandicap: asianMarketStats(records)
  };
}

export function formatKickoff(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export function resultText(record) {
  if (record.outcome === 'correct') return 'CORRECT';
  if (record.outcome === 'incorrect') return 'INCORRECT';
  if (record.outcome === 'void') return 'VOID';
  if (record.status === 'MANUAL_RESULT_REQUIRED') return 'MANUAL REQUIRED';
  return 'WAITING';
}

export function marketResultText(market) {
  const outcome = String(market?.outcome ?? 'pending');
  const labels = {
    correct: 'CORRECT',
    incorrect: 'INCORRECT',
    void: 'VOID',
    win: 'WIN',
    'half-win': 'HALF WIN',
    push: 'PUSH',
    'half-loss': 'HALF LOSS',
    loss: 'LOSS',
    pending: 'WAITING'
  };
  return labels[outcome] ?? outcome.toUpperCase();
}

export function scoreText(record) {
  const hasHome = record.homeScore !== null && record.homeScore !== '' && Number.isFinite(Number(record.homeScore));
  const hasAway = record.awayScore !== null && record.awayScore !== '' && Number.isFinite(Number(record.awayScore));
  return hasHome && hasAway ? `${record.homeScore}–${record.awayScore}` : '—';
}
