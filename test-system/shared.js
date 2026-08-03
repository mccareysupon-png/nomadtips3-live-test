export const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';

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

export const DEFAULT_PICKS = Object.freeze([
  { fixtureId:'TEST-2001', pickDate:'2026-08-04', league:'NOMAD Test League A', home:'Alpha City', away:'Beta United', kickoffUtc:'2026-08-04T08:00:00.000Z', pick:'HOME', odds:1.82, confidence:63, predictedScore:'2-0', reason:'Synthetic record for the NOMADTIPS3 test environment.', abcResult:'PASS', source:'TEST DATA', status:'RESULT_CONFIRMED', resultSource:'MANUAL', resultConfirmed:true, outcome:'correct', homeScore:2, awayScore:0, checks },
  { fixtureId:'TEST-2002', pickDate:'2026-08-04', league:'NOMAD Test League B', home:'Coastal FC', away:'Delta Rovers', kickoffUtc:'2026-08-04T09:30:00.000Z', pick:'AWAY', odds:1.76, confidence:58, predictedScore:'0-1', reason:'Synthetic record proving API coverage is not a selection filter.', abcResult:'PASS', source:'TEST DATA', status:'RESULT_CONFIRMED', resultSource:'API', resultConfirmed:true, outcome:'correct', homeScore:0, awayScore:1, checks },
  { fixtureId:'TEST-2003', pickDate:'2026-08-04', league:'NOMAD Test League A', home:'Eastern Stars', away:'Forest Athletic', kickoffUtc:'2026-08-04T11:00:00.000Z', pick:'DRAW', odds:1.91, confidence:57, predictedScore:'1-1', reason:'Synthetic draw-market test record.', abcResult:'PASS', source:'TEST DATA', status:'RESULT_CONFIRMED', resultSource:'API', resultConfirmed:true, outcome:'incorrect', homeScore:2, awayScore:1, checks },
  { fixtureId:'TEST-2004', pickDate:'2026-08-04', league:'NOMAD Test League C', home:'Harbour Town', away:'Island Club', kickoffUtc:'2026-08-04T12:30:00.000Z', pick:'HOME', odds:1.88, confidence:61, predictedScore:'2-1', reason:'Synthetic waiting-result record.', abcResult:'PASS', source:'TEST DATA', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'TEST-2005', pickDate:'2026-08-04', league:'NOMAD Test League C', home:'Jade Warriors', away:'Kingdom FC', kickoffUtc:'2026-08-04T14:00:00.000Z', pick:'AWAY', odds:2.05, confidence:59, predictedScore:'1-2', reason:'Synthetic waiting-result record.', abcResult:'PASS', source:'TEST DATA', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'TEST-2006', pickDate:'2026-08-04', league:'NOMAD Test League D', home:'Metro Eleven', away:'Northern Lights', kickoffUtc:'2026-08-04T15:30:00.000Z', pick:'HOME', odds:1.73, confidence:56, predictedScore:'1-0', reason:'Synthetic minimum-threshold validation record.', abcResult:'PASS', source:'TEST DATA', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'TEST-2007', pickDate:'2026-08-04', league:'NOMAD Test League D', home:'Orchid SC', away:'Phoenix United', kickoffUtc:'2026-08-04T17:00:00.000Z', pick:'AWAY', odds:1.95, confidence:62, predictedScore:'0-2', reason:'Synthetic seventh selection for variable-count testing.', abcResult:'PASS', source:'TEST DATA', status:'MANUAL_RESULT_REQUIRED', resultSource:null, resultConfirmed:false, outcome:'pending', checks }
]);

function normalize(record) {
  return {
    fixtureId: record.fixtureId ?? record.id ?? crypto.randomUUID(),
    pickDate: record.pickDate ?? record.date ?? new Date(record.kickoffUtc ?? Date.now()).toISOString().slice(0,10),
    league: record.league ?? 'Test League',
    home: record.home ?? record.homeTeam ?? 'Home',
    away: record.away ?? record.awayTeam ?? 'Away',
    kickoffUtc: record.kickoffUtc ?? record.kickoff_utc ?? new Date().toISOString(),
    pick: String(record.pick ?? record.pick_1x2 ?? 'HOME').toUpperCase(),
    odds: Number(record.odds ?? record.lockedOdds ?? record.locked_odds ?? 0),
    confidence: Number(record.confidence ?? 0),
    predictedScore: record.predictedScore ?? record.predicted_score ?? '—',
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

export function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? JSON.parse(raw) : null;
    const records = Array.isArray(state?.publishedPicks) && state.publishedPicks.length
      ? state.publishedPicks
      : DEFAULT_PICKS;
    return records.map(normalize);
  } catch {
    return DEFAULT_PICKS.map(normalize);
  }
}

export function buildSummary(records) {
  const correct = records.filter(record => record.outcome === 'correct').length;
  const incorrect = records.filter(record => record.outcome === 'incorrect').length;
  const voids = records.filter(record => record.outcome === 'void').length;
  const pending = records.filter(record => !['correct','incorrect','void'].includes(record.outcome)).length;
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

export function formatKickoff(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(iso));
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

export function scoreText(record) {
  const hasHome = record.homeScore !== null && record.homeScore !== '' && Number.isFinite(Number(record.homeScore));
  const hasAway = record.awayScore !== null && record.awayScore !== '' && Number.isFinite(Number(record.awayScore));
  return hasHome && hasAway ? `${record.homeScore}–${record.awayScore}` : '—';
}
