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
  { fixtureId:'1551656', pickDate:'2026-08-04', league:'Costa-Rica Primera División', home:'Perez Zeledon', away:'CS Cartagines', kickoffUtc:'2026-08-03T19:00:00.000Z', pick:'AWAY', pickLabel:'CS Cartagines Win', odds:1.95, bookmaker:'Bet365', confidence:63, predictedScore:'0–2', btts:'No', doubleChance:'X2', asianHandicap:'CS Cartagines -0.25', reason:'Cartagines has the stronger six-match form, superior away record, a higher early league position and a clear recent H2H edge. Common-opponent results also favour Cartagines overall.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1610530', pickDate:'2026-08-04', league:'Indonesia Piala Presiden', home:'Persebaya Surabaya', away:'Arema FC', kickoffUtc:'2026-08-04T05:00:00.000Z', pick:'HOME', pickLabel:'Persebaya Surabaya Win', odds:2.15, bookmaker:'Bet365', confidence:61, predictedScore:'2–1', btts:'Yes', doubleChance:'1X', asianHandicap:'Persebaya Surabaya -0.25', reason:'Persebaya is unbeaten in six, has won four of its last five home matches and holds a strong recent H2H record against Arema. Arema remains dangerous, so confidence is controlled.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1610531', pickDate:'2026-08-04', league:'Indonesia Piala Presiden', home:'Persib Bandung', away:'Persija', kickoffUtc:'2026-08-04T05:00:00.000Z', pick:'HOME', pickLabel:'Persib Bandung Win', odds:2.25, bookmaker:'Bet365', confidence:61, predictedScore:'1–0', btts:'No', doubleChance:'1X', asianHandicap:'Persib Bandung -0.25', reason:'Persib is unbeaten in six and has not conceded across its five-match home sample. It also won both recent direct meetings and enters the semi-final with the stronger group record.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1563636', pickDate:'2026-08-04', league:'Russia Cup', home:'Dinamo Makhachkala', away:'Krylia Sovetov', kickoffUtc:'2026-08-04T08:30:00.000Z', pick:'HOME', pickLabel:'Dinamo Makhachkala Win', odds:2.08, bookmaker:'Pinnacle', confidence:61, predictedScore:'2–0', btts:'No', doubleChance:'1X', asianHandicap:'Dinamo Makhachkala -0.25', reason:'Dinamo has four wins in six and four wins in its five-match home sample, while Krylia is winless in the recent and away samples. Dinamo also leads the recent H2H set. Cup rotation risk limits confidence.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1557945', pickDate:'2026-08-04', league:'Israel Toto Cup Ligat Al', home:'Ironi Kiryat Shmona', away:'Bnei Sakhnin', kickoffUtc:'2026-08-04T09:45:00.000Z', pick:'HOME', pickLabel:'Ironi Kiryat Shmona Win', odds:1.95, bookmaker:'Bet365', confidence:66, predictedScore:'2–0', btts:'No', doubleChance:'1X', asianHandicap:'Ironi Kiryat Shmona -0.50', reason:'Kiryat Shmona has won four of five at home. Bnei Sakhnin has lost all six recent matches and all five away matches. Recent H2H and common-opponent evidence strongly support the home side.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1607166', pickDate:'2026-08-04', league:'UEFA Champions League Qualifying', home:'Hapoel Beer Sheva', away:'FK Crvena Zvezda', kickoffUtc:'2026-08-04T10:30:00.000Z', pick:'AWAY', pickLabel:'FK Crvena Zvezda Win', odds:1.75, bookmaker:'Bet365', confidence:62, predictedScore:'1–2', btts:'Yes', doubleChance:'X2', asianHandicap:'FK Crvena Zvezda -0.50', reason:'Crvena Zvezda carries the higher team-quality level and has four wins in its completed recent sample with an 18–4 goal balance. Hapoel has lost three of its five completed recent matches.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1576856', pickDate:'2026-08-04', league:'Argentina Reserve League', home:'Godoy Cruz Res.', away:'Racing Club Res.', kickoffUtc:'2026-08-04T11:00:00.000Z', pick:'AWAY', pickLabel:'Racing Club Res. Win', odds:2.30, bookmaker:'Bet365', confidence:58, predictedScore:'1–2', btts:'Yes', doubleChance:'X2', asianHandicap:'Racing Club Res. -0.25', reason:'Racing has the stronger recent and away form and has won all four recorded H2H meetings. Reserve-team rotation creates additional uncertainty, so the selection is held at the minimum qualifying confidence.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1576857', pickDate:'2026-08-04', league:'Argentina Reserve League', home:'Gimnasia Mendoza 2', away:'River Plate Res.', kickoffUtc:'2026-08-04T11:00:00.000Z', pick:'AWAY', pickLabel:'River Plate Res. Win', odds:1.91, bookmaker:'Bet365', confidence:59, predictedScore:'0–1', btts:'No', doubleChance:'X2', asianHandicap:'River Plate Res. -0.25', reason:'River has the stronger recent defensive record, a better away sample, the higher early-table position and a 5–1 win in the latest H2H. Reserve-lineup volatility keeps confidence below the senior-team selections.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1549709', pickDate:'2026-08-04', league:'Colombia Primera A', home:'Llaneros', away:'Fortaleza FC', kickoffUtc:'2026-08-04T14:10:00.000Z', pick:'HOME', pickLabel:'Llaneros Win', odds:2.10, bookmaker:'Bet365', confidence:61, predictedScore:'1–0', btts:'No', doubleChance:'1X', asianHandicap:'Llaneros -0.25', reason:'Llaneros has four wins in six and is unbeaten across the five-match home sample, while Fortaleza is winless in five away matches. The common-opponent evidence is mixed, limiting confidence.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1545399', pickDate:'2026-08-04', league:'Bolivia Primera División', home:'Independiente Petrolero', away:'Aurora', kickoffUtc:'2026-08-04T15:00:00.000Z', pick:'AWAY', pickLabel:'Aurora Win', odds:2.45, bookmaker:'Bet365', confidence:60, predictedScore:'1–2', btts:'Yes', doubleChance:'X2', asianHandicap:'Aurora 0.00', reason:'Aurora has the stronger current form, away record and league position. Independiente has lost five of six and three of five at home. Common-opponent evidence generally favours Aurora.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks },
  { fixtureId:'1530109', pickDate:'2026-08-04', league:'Leagues Cup', home:'FC Cincinnati', away:'CF Pachuca', kickoffUtc:'2026-08-04T16:45:00.000Z', pick:'HOME', pickLabel:'FC Cincinnati Win', odds:2.05, bookmaker:'Bet365', confidence:60, predictedScore:'3–2', btts:'Yes', doubleChance:'1X', asianHandicap:'FC Cincinnati -0.25', reason:'Cincinnati has four wins in six and four wins in five at home, producing 20 goals in that home sample. Pachuca has lost three of six and three of five away, though Cincinnati defensive volatility caps confidence.', abcResult:'CHECKED', source:'LOCKED MANUAL SET 2', status:'WAITING_FOR_RESULT', resultSource:null, resultConfirmed:false, outcome:'pending', checks }
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
    pickLabel: record.pickLabel ?? record.pick_label ?? record.pick ?? 'HOME',
    odds: Number(record.odds ?? record.lockedOdds ?? record.locked_odds ?? 0),
    bookmaker: record.bookmaker ?? 'Locked',
    confidence: Number(record.confidence ?? 0),
    predictedScore: record.predictedScore ?? record.predicted_score ?? '—',
    btts: record.btts ?? '—',
    doubleChance: record.doubleChance ?? record.double_chance ?? '—',
    asianHandicap: record.asianHandicap ?? record.asian_handicap ?? '—',
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
    mode: 'DRAFT',
    ruleVersions: [{ id:'locked-2026-08-04T00:04:00+07:00', name:'Manual Set 2 — Locked 4 August 2026', createdAt:'2026-08-03T17:04:00.000Z', minimumOdds:1.70, minimumConfidence:58 }],
    candidates: [],
    reviewItems: [],
    publishedPicks: DEFAULT_PICKS.map(item => ({ ...item, ruleVersionId:'locked-2026-08-04T00:04:00+07:00', lockedAt:'2026-08-03T17:04:00.000Z' })),
    auditLog: [{ id:'seed-2026-08-04', createdAt:now, actor:'test-system', action:'LOCKED_SET_IMPORTED', entity:'2026-08-04', details:{ count:DEFAULT_PICKS.length, productionWrite:false } }],
    analysisRun: null,
    updatedAt: now
  };
}

function shouldSeed(state) {
  const picks = state?.publishedPicks;
  if (!Array.isArray(picks) || picks.length === 0) return true;
  return picks.every(pick => /^TEST-(100|200)/.test(String(pick.fixtureId ?? '')));
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
