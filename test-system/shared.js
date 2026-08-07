export const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
export const DATASET_ID = 'manual-test-v2-day8-2026-08-06-v2';

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

const lockedMarket = (pick, odds, confidence, extra = {}) => Object.freeze({
  pick,
  odds: Number(odds) > 0 ? Number(odds) : null,
  oddsStatus: Number(odds) > 0 ? 'LOCKED' : 'N/A',
  confidence,
  outcome: 'pending',
  ...extra
});

export const DEFAULT_PICKS = Object.freeze([
  {
    fixtureId: 'DAY8-HJK-MOTHERWELL',
    providerFixtureId: '1607586',
    pickDate: '2026-08-06',
    league: 'UEFA Conference League Qualifying',
    home: 'HJK Helsinki',
    away: 'Motherwell',
    kickoffUtc: '2026-08-06T16:00:00.000Z',
    pick: 'HOME',
    pickLabel: 'HJK Helsinki Win',
    odds: 2.49,
    bookmaker: 'Manual market snapshot',
    oddsStatus: 'LOCKED',
    oddsLockedAt: '2026-08-06T03:08:00.000Z',
    confidence: 58,
    predictedScore: '2–1',
    markets: {
      btts: lockedMarket('Yes', 1.67, 58),
      doubleChance: lockedMarket('1X — HJK or Draw', 1.40, 58, {code:'1X'}),
      asianHandicap: lockedMarket('HJK 0', 1.75, 58, {line:0, side:'home'})
    },
    reason: 'HJK carries the stronger recent home profile and the surface advantage in Helsinki. Motherwell travels without Ibrahim Said because of a visa issue and Dylan Williams is unavailable, but the visitors remain competitive, so the selection is fixed at the required 58% confidence.',
    abcResult: 'LIMITED — no reliable like-for-like common-opponent sample',
    source: 'NOMAD SYSTEM · MANUAL TEST V.2 · DAY 8',
    status: 'WAITING_FOR_RESULT',
    resultSource: null,
    resultConfirmed: false,
    outcome: 'pending',
    homeScore: null,
    awayScore: null,
    checks
  },
  {
    fixtureId: 'DAY8-CHICAGO-NECAXA',
    providerFixtureId: '1530120',
    pickDate: '2026-08-06',
    league: 'Leagues Cup',
    home: 'Chicago Fire FC',
    away: 'Club Necaxa',
    kickoffUtc: '2026-08-07T00:30:00.000Z',
    pick: 'HOME',
    pickLabel: 'Chicago Fire FC Win',
    odds: 1.82,
    bookmaker: 'Manual market snapshot',
    oddsStatus: 'LOCKED',
    oddsLockedAt: '2026-08-06T03:08:00.000Z',
    confidence: 58,
    predictedScore: '2–1',
    markets: {
      btts: lockedMarket('Yes', 1.62, 58),
      doubleChance: lockedMarket('1X — Chicago or Draw', 1.18, 58, {code:'1X'}),
      asianHandicap: lockedMarket('N/A', null, 58, {line:null, side:'home'})
    },
    reason: 'Chicago has the stronger recent overall form and Necaxa has struggled away from home. The venue and attacking output support the home selection, while BTTS remains plausible because both teams show defensive variance.',
    abcResult: 'LIMITED — first competitive head-to-head in the available sample',
    source: 'NOMAD SYSTEM · MANUAL TEST V.2 · DAY 8',
    status: 'WAITING_FOR_RESULT',
    resultSource: null,
    resultConfirmed: false,
    outcome: 'pending',
    homeScore: null,
    awayScore: null,
    checks
  }
]);

export const INTEGRITY_NOTE = 'PAOK vs Anderlecht was removed before publication because no such fixture exists in the official schedule. It is excluded from all records and statistics.';

function normalizeMarket(value, fallbackPick = '—') {
  if (value && typeof value === 'object') {
    return {
      ...value,
      pick: value.pick ?? fallbackPick,
      odds: Number(value.odds) > 0 ? Number(value.odds) : null,
      oddsStatus: value.oddsStatus ?? (Number(value.odds) > 0 ? 'LOCKED' : 'N/A'),
      confidence: Number(value.confidence ?? 0),
      outcome: value.outcome ?? 'pending',
      settlement: value.settlement ?? null
    };
  }
  return {pick:value ?? fallbackPick,odds:null,oddsStatus:'N/A',confidence:0,outcome:'pending',settlement:null};
}

function normalize(record) {
  const legacyMarkets = {
    btts:record.btts,
    overUnder:record.overUnder ?? record.over_under ?? record.ou,
    doubleChance:record.doubleChance ?? record.double_chance,
    asianHandicap:record.asianHandicap ?? record.asian_handicap
  };
  const markets = record.markets ?? legacyMarkets;
  return {
    ...record,
    fixtureId: record.fixtureId ?? record.id ?? crypto.randomUUID(),
    providerFixtureId: record.providerFixtureId ?? null,
    pickDate: record.pickDate ?? record.date ?? new Date(record.kickoffUtc ?? Date.now()).toISOString().slice(0,10),
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
      overUnder: normalizeMarket(markets?.overUnder ?? markets?.over_under ?? markets?.ou, '—'),
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
      id: 'manual-v2-day8-2026-08-06',
      name: 'Manual Test v.2 — Day 8',
      createdAt: now,
      minimumOdds: 1.70,
      minimumConfidence: 58,
      fixedConfidence: 58,
      unlimitedSelections: true
    }],
    candidates: [],
    reviewItems: [],
    publishedPicks: DEFAULT_PICKS.map(item => ({...item,ruleVersionId:'manual-v2-day8-2026-08-06',lockedAt:'2026-08-06T03:08:00.000Z'})),
    auditLog: [{
      id: 'seed-day8-2026-08-06',
      createdAt: now,
      actor: 'test-system',
      action: 'LOCKED_SET_IMPORTED',
      entity: '2026-08-06',
      details: {count:DEFAULT_PICKS.length,excludedInvalidFixture:1,productionWrite:false,fixedConfidence:58}
    }],
    analysisRun: null,
    updatedAt: now
  };
}

function shouldSeed(state) {
  if (!state || !Array.isArray(state.publishedPicks)) return true;
  const datasetId = String(state.datasetId || '');
  const isRemoteDataset = Boolean(state.remoteDatasetId) || datasetId.startsWith('remote:');
  return !isRemoteDataset && datasetId !== DATASET_ID;
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
  const correct=records.filter(r=>r.outcome==='correct').length;
  const incorrect=records.filter(r=>r.outcome==='incorrect').length;
  const voids=records.filter(r=>r.outcome==='void').length;
  const pending=records.filter(r=>!['correct','incorrect','void'].includes(r.outcome)).length;
  const settled=correct+incorrect;
  return {total:records.length,correct,incorrect,voids,pending,settled,accuracy:settled?Number(((correct/settled)*100).toFixed(2)):0,averageOdds:records.length?Number((records.reduce((s,r)=>s+Number(r.odds||0),0)/records.length).toFixed(2)):0};
}

function standardMarketStats(records,key) {
  const values=records.map(r=>r.markets?.[key]).filter(Boolean);
  const correct=values.filter(m=>m.outcome==='correct').length;
  const incorrect=values.filter(m=>m.outcome==='incorrect').length;
  const voids=values.filter(m=>m.outcome==='void').length;
  const pending=values.length-correct-incorrect-voids;
  const settled=correct+incorrect;
  return {total:values.length,correct,incorrect,voids,pending,settled,accuracy:settled?Number(((correct/settled)*100).toFixed(2)):0};
}

function asianMarketStats(records) {
  const values=records.map(r=>r.markets?.asianHandicap).filter(Boolean);
  const counts={win:0,halfWin:0,push:0,halfLoss:0,loss:0,pending:0};
  values.forEach(m=>{const o=String(m.outcome??'pending');if(o==='win'||o==='correct')counts.win++;else if(o==='half-win')counts.halfWin++;else if(o==='push'||o==='void')counts.push++;else if(o==='half-loss')counts.halfLoss++;else if(o==='loss'||o==='incorrect')counts.loss++;else counts.pending++;});
  const decisions=counts.win+counts.halfWin+counts.halfLoss+counts.loss;
  const weightedRate=decisions?Number((((counts.win+counts.halfWin*.5)/decisions)*100).toFixed(2)):0;
  return {total:values.length,...counts,decisions,weightedRate};
}

export function buildMarketSummary(records) {
  return {
    oneXTwo:buildSummary(records),
    btts:standardMarketStats(records,'btts'),
    overUnder:standardMarketStats(records,'overUnder'),
    doubleChance:standardMarketStats(records,'doubleChance'),
    asianHandicap:asianMarketStats(records)
  };
}
export function formatKickoff(iso) { try{return new Intl.DateTimeFormat(undefined,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));}catch{return'—';} }
export function resultText(record) { if(record.outcome==='correct')return'CORRECT';if(record.outcome==='incorrect')return'INCORRECT';if(record.outcome==='void')return'VOID';if(record.status==='MANUAL_RESULT_REQUIRED')return'MANUAL REQUIRED';return'WAITING'; }
export function marketResultText(market) { const o=String(market?.outcome??'pending');return({correct:'CORRECT',incorrect:'INCORRECT',void:'VOID',win:'WIN','half-win':'HALF WIN',push:'PUSH','half-loss':'HALF LOSS',loss:'LOSS',pending:'WAITING'})[o]??o.toUpperCase(); }
export function scoreText(record) { const h=record.homeScore!==null&&record.homeScore!==''&&Number.isFinite(Number(record.homeScore));const a=record.awayScore!==null&&record.awayScore!==''&&Number.isFinite(Number(record.awayScore));return h&&a?`${record.homeScore}–${record.awayScore}`:'—'; }
