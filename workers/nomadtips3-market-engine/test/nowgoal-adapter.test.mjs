import assert from 'node:assert/strict';
import { fetchNowgoalPayload, parseNowgoalGoalRows, parseNowgoalOneXtwoTotals } from '../src/nowgoal.js';

const fullRow = '3003850,17348417,1.25,0.78,1.06,155043777,1.63,4.41,5.28,9001,2.5,0.86,0.96';

{
  const rows = parseNowgoalGoalRows(`<c><match><m>${fullRow}</m></match></c>`);
  const fields = rows.get('3003850');
  const parsed = parseNowgoalOneXtwoTotals(fields);
  assert.deepEqual(parsed.oneXtwo, { home: 1.63, draw: 4.41, away: 5.28 });
  assert.deepEqual(parsed.totals, [{ line: 2.5, overOdds: 1.86, underOdds: 1.96 }]);
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
    return new Response('missing', { status: 404 });
  };

  const payload = await fetchNowgoalPayload({ MARKET_PROVIDER_TIMEOUT_MS: '3000' }, fetchImpl, observedAt);
  assert.equal(payload.provider, 'Nowgoal');
  assert.equal(payload.matches.length, 1);
  assert.equal(payload.matches[0].bookmakers.length, 3);
  assert.deepEqual(payload.sourceDiagnostics.bookmakerNames, ['1xBet', 'Bet365', 'M88']);
  assert.deepEqual(payload.sourceDiagnostics.markets, ['1X2', 'OVER_UNDER']);
  assert.equal(payload.sourceDiagnostics.asianHandicap, false);
  assert.ok(payload.matches[0].bookmakers.every(book => !('ah' in book.markets)));
  assert.ok(calls.slice(1).every(call => call.cookie.includes('ngsid=test-session')));
}

console.log('nowgoal-adapter tests passed');
