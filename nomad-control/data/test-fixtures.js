const allChecksPass = {
  recentForm: true,
  homeAwayForm: true,
  standings: true,
  goalsForAgainst: true,
  h2h: true,
  commonOpponents: true,
  injuriesSuspensions: true,
  fatigue: true,
  motivation: true
};

export const TEST_CANDIDATES = [
  {
    fixtureId: 'TEST-2001', date: '2026-08-04', league: 'NOMAD Test League A', home: 'Alpha City', away: 'Beta United',
    kickoffUtc: '2026-08-04T08:00:00.000Z', pick: 'HOME', odds: 1.82, confidence: 63, predictedScore: '2-0',
    reason: 'Synthetic fixture 1 used only to validate the Manual Set 2 workflow.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2002', date: '2026-08-04', league: 'NOMAD Test League B', home: 'Coastal FC', away: 'Delta Rovers',
    kickoffUtc: '2026-08-04T09:30:00.000Z', pick: 'AWAY', odds: 1.76, confidence: 58, predictedScore: '0-1',
    reason: 'Synthetic fixture 2 proves missing API coverage is not a selection filter.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: false, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2003', date: '2026-08-04', league: 'NOMAD Test League A', home: 'Eastern Stars', away: 'Forest Athletic',
    kickoffUtc: '2026-08-04T11:00:00.000Z', pick: 'DRAW', odds: 1.91, confidence: 57, predictedScore: '1-1',
    reason: 'Synthetic fixture 3 validates the 1X2 draw workflow.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2004', date: '2026-08-04', league: 'NOMAD Test League C', home: 'Harbour Town', away: 'Island Club',
    kickoffUtc: '2026-08-04T12:30:00.000Z', pick: 'HOME', odds: 1.88, confidence: 61, predictedScore: '2-1',
    reason: 'Synthetic fixture 4 validates variable-length selection.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2005', date: '2026-08-04', league: 'NOMAD Test League C', home: 'Jade Warriors', away: 'Kingdom FC',
    kickoffUtc: '2026-08-04T14:00:00.000Z', pick: 'AWAY', odds: 2.05, confidence: 59, predictedScore: '1-2',
    reason: 'Synthetic fixture 5 validates higher-odds selection.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2006', date: '2026-08-04', league: 'NOMAD Test League D', home: 'Metro Eleven', away: 'Northern Lights',
    kickoffUtc: '2026-08-04T15:30:00.000Z', pick: 'HOME', odds: 1.73, confidence: 56, predictedScore: '1-0',
    reason: 'Synthetic fixture 6 validates values close to the Standard thresholds.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: false, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2007', date: '2026-08-04', league: 'NOMAD Test League D', home: 'Orchid SC', away: 'Phoenix United',
    kickoffUtc: '2026-08-04T17:00:00.000Z', pick: 'AWAY', odds: 1.95, confidence: 62, predictedScore: '0-2',
    reason: 'Synthetic fixture 7 completes the Today’s 7 Picks test set.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2091', date: '2026-08-04', league: 'NOMAD Test League E', home: 'Rejected Odds FC', away: 'Threshold United',
    kickoffUtc: '2026-08-04T18:00:00.000Z', pick: 'HOME', odds: 1.68, confidence: 61, predictedScore: '1-0',
    reason: 'Synthetic rejection case for odds below 1.70.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  },
  {
    fixtureId: 'TEST-2092', date: '2026-08-04', league: 'NOMAD Test League E', home: 'Rejected Confidence FC', away: 'Minimum City',
    kickoffUtc: '2026-08-04T19:00:00.000Z', pick: 'AWAY', odds: 1.90, confidence: 54, predictedScore: '0-1',
    reason: 'Synthetic rejection case for confidence below 55%.', abcResult: 'PASS', source: 'TEST FIXTURE',
    status: 'DRAFT', apiCoverage: true, checks: { ...allChecksPass }
  }
];
