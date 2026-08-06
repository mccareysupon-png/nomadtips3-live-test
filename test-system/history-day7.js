const market = (pick, odds, confidence, outcome, extra = {}) => Object.freeze({
  pick,
  odds,
  oddsStatus: 'LOCKED',
  confidence,
  outcome,
  ...extra
});

export const DAY7_RECORDS = Object.freeze([
  Object.freeze({
    fixtureId: 'DAY7-APOLLON-CZARNI',
    providerFixtureId: '1603952',
    pickDate: '2026-08-05',
    league: "UEFA Women's Champions League Qualifying",
    home: 'Apollon Ladies FC',
    away: 'Czarni Sosnowiec Women',
    kickoffUtc: '2026-08-05T14:00:00Z',
    pick: 'AWAY',
    pickLabel: 'Czarni Sosnowiec Women Win',
    odds: 1.75,
    bookmaker: 'Locked market',
    confidence: 57,
    predictedScore: '1–2',
    markets: {
      btts: market('Yes', 1.73, 61, 'correct'),
      doubleChance: market('X2 — Czarni or Draw', 1.18, 68, 'correct'),
      asianHandicap: market('Czarni 0', 1.25, 60, 'push', {line:0,side:'away',settlement:'push'})
    },
    reason: 'Archived NOMAD SYSTEM Day 7 record.',
    abcResult: 'ARCHIVED',
    source: 'NOMAD SYSTEM · DAY 7 ARCHIVE',
    status: 'RESULT_CONFIRMED',
    resultSource: 'API-FOOTBALL',
    resultConfirmed: true,
    outcome: 'incorrect',
    homeScore: 3,
    awayScore: 3
  }),
  Object.freeze({
    fixtureId: 'DAY7-SLAVIA-RANGERS',
    providerFixtureId: '1558465',
    pickDate: '2026-08-05',
    league: "UEFA Women's Champions League Qualifying",
    home: 'Slavia Praha Women',
    away: 'Rangers Women',
    kickoffUtc: '2026-08-05T18:30:00Z',
    pick: 'HOME',
    pickLabel: 'Slavia Praha Women Win',
    odds: 1.80,
    bookmaker: 'Locked market',
    confidence: 56,
    predictedScore: '2–1',
    markets: {
      btts: market('Yes', 1.45, 58, 'correct'),
      doubleChance: market('1X — Slavia or Draw', 1.57, 66, 'correct'),
      asianHandicap: market('Slavia 0', 2.02, 60, 'push', {line:0,side:'home',settlement:'push'})
    },
    reason: 'Archived NOMAD SYSTEM Day 7 record.',
    abcResult: 'ARCHIVED',
    source: 'NOMAD SYSTEM · DAY 7 ARCHIVE',
    status: 'RESULT_CONFIRMED',
    resultSource: 'API-FOOTBALL',
    resultConfirmed: true,
    outcome: 'incorrect',
    homeScore: 1,
    awayScore: 1
  })
]);
