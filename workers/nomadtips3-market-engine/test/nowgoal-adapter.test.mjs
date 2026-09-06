import assert from 'node:assert/strict';
import {
  fetchNowgoalCandidate,
  fetchNowgoalPayload,
  matchNowgoalLiveMatch,
  nowgoalTeamScore,
  parseNowgoalGoalRows,
  parseNowgoalOneXtwoTotals,
  parseNowgoalPossessionHtml,
  parseNowgoalRoster,
} from '../src/nowgoal.js';

const fullRow = '3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28,9001,2.5,0.86,0.96';

{
  const rows = parseNowgoalGoalRows(`<c><match><m>${fullRow}</m></match></c>`);
  const fields = rows.get('3003850');
  const parsed = parseNowgoalOneXtwoTotals(fields);
  assert.deepEqual(parsed.oneXtwo, { home: 1.63, draw: 4.41, away: 5.28 });
  assert.deepEqual(parsed.totals, [{ line: 2.5, overOdds: 1.86, underOdds: 1.96 }]);
}

{
  const html = `
    <h2>Statistics</h2>
    <ul>
      <li><span>8</span><span>Shots on Goal</span><span>4</span></li>
      <li><span>61%</span><span>Possession</span><span>39%</span></li>
    </ul>
    <h2>Team Statistics</h2>
    <div>52% Possession 48%</div>`;
  assert.deepEqual(parseNowgoalPossessionHtml(html), { home: 61, away: 39 });
}

{
  const roster = parseNowgoalRoster(`
    A[0]=[3003850,2,384,27,'Hull City','Manchester United','2026-09-05','x',3,1,0];
    A[1]=[3003851,2,384,27,'Hull City U21','Manchester United U21','2026-09-05','x',3,0,0];`);
  assert.ok(nowgoalTeamScore('Manchester Utd', 'Manchester United') > 0.9);
  const picked = matchNowgoalLiveMatch({ home: 'Hull City FC', away: 'Manchester Utd', score: [1, 0] }, roster);
  assert.equal(picked.reason, 'MATCHED');
  assert.equal(picked.match.id, '3003850');
  assert.equal(matchNowgoalLiveMatch({ home: 'Hull City FC', away: 'Manchester Utd', score: [0, 1] }, roster).match, null);
  assert.equal(matchNowgoalLiveMatch({ home: 'Manchester Utd', away: 'Hull City FC', score: [0, 1] }, roster).match, null);
}

{
  const roster = `var A=Array(2); A[1]=[3003850,2,384,27,'Hull City','Manchester United','2026-09-05 10:00:00','2026-09-05 10:25:00',3,1,0,2,0];`;
  const observedAt = Date.parse('2026-09-05T09:00:00Z');
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    calls.push({ path: parsed.pathname, cookie: options.headers?.cookie || '' });
    if (parsed.pathname === '/') {
      return new Response('<html>Nowgoal</html>', { status: 200, headers: { 'set-cookie': 'ngsid=test-session; Path=/; HttpOnly' } });
    }
    if (parsed.pathname === '/gf/data/bf_en-idn1.js') {
      return new Response(roster, { status: 200 });
    }
    if (['/gf/data/odds/en/goal50.xml','/gf/data/odds/en/goal8.xml','/gf/data/odds/en/goal17.xml'].includes(parsed.pathname)) {
      return new Response(`<c><match><m>${fullRow}</m></match></c>`, { status: 200 });
    }
    if (parsed.pathname === '/match/live-3003850') {
      return new Response('<h2>Statistics</h2><div>54% Possession 46%</div><h2>Team Statistics</h2>', { status: 200 });
    }
    return new Response('missing', { status: 404 });
  };

  const payload = await fetchNowgoalPayload({ MARKET_PROVIDER_TIMEOUT_MS: '3000' }, fetchImpl, observedAt);
  assert.equal(payload.provider, 'Nowgoal');
  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].bookmakers.length, 3);
  assert.deepEqual(payload.sourceDiagnostics.bookmakerNames, ['1xBet', 'Bet365', 'M88']);
  assert.deepEqual(payload.sourceDiagnostics.markets, ['1X2', 'OVER_UNDER']);
  assert.deepEqual(payload.sourceDiagnostics.candidateStatistics, ['POSSESSION']);
  assert.equal(payload.sourceDiagnostics.asianHandicap, false);
  assert.ok(payload.matches[0].bookmakers.every(book => !('ah' in book.markets)));
  assert.ok(calls.slice(1).every(call => call.cookie.includes('ngsid=test-session')));

  calls.length = 0;
  const candidate = await fetchNowgoalCandidate(
    { MARKET_PROVIDER_TIMEOUT_MS: '3000' },
    { home: 'Hull City', away: 'Manchester United', minute: 67, score: [1, 0] },
    fetchImpl,
    observedAt,
  );
  assert.equal(candidate.ok, true);
  assert.equal(candidate.match.id, '3003850');
  assert.equal(candidate.match.minute, 67);
  assert.equal(candidate.match.bookmakers.length, 3);
  assert.deepEqual(candidate.possession, { home: 54, away: 46 });
  assert.equal(candidate.sourceDiagnostics.possessionAvailable, true);
  assert.ok(calls.some(call => call.path === '/match/live-3003850'));
  assert.ok(calls.slice(1).every(call => call.cookie.includes('ngsid=test-session')));
}

console.log('nowgoal-adapter tests passed');
