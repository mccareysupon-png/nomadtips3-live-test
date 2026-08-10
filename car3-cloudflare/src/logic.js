export const DEFAULTS = Object.freeze({
  minMinute: 50,
  maxMinute: 95,
  liveBetId: 59,
  minOdds: 1.50,
  minShotsOnGoal: 3,
  minTotalShots: 8,
  minCorners: 4,
  minPossession: 55,
});

export function secondHalfFixtures(fixtures, cfg = DEFAULTS) {
  return (fixtures || []).filter((row) => {
    const status = row?.fixture?.status || {};
    const elapsed = Number(status.elapsed);
    return status.short === '2H' && Number.isFinite(elapsed) && elapsed >= cfg.minMinute && elapsed <= cfg.maxMinute;
  });
}

export function liveOddsByFixture(items, betId = DEFAULTS.liveBetId) {
  const map = new Map();
  for (const row of items || []) {
    if (row?.status?.blocked || row?.status?.stopped || row?.status?.finished) continue;
    const fixtureId = row?.fixture?.id;
    if (!fixtureId) continue;
    const market = (row.odds || []).find((x) => Number(x?.id) === Number(betId));
    if (!market) continue;
    const sides = {};
    for (const v of market.values || []) {
      const side = String(v?.value || '');
      if (!['Home', 'Draw', 'Away'].includes(side) || v?.suspended) continue;
      const odd = Number(v?.odd);
      if (!Number.isFinite(odd)) continue;
      const current = sides[side];
      if (!current || v.main === true || current.main !== true) sides[side] = { odd, main: v.main === true };
    }
    map.set(Number(fixtureId), { row, sides });
  }
  return map;
}

export function buildTargets(fixtures, oddsMap, cfg = DEFAULTS) {
  const targets = [];
  for (const fx of fixtures || []) {
    const fixtureId = Number(fx?.fixture?.id);
    const odds = oddsMap.get(fixtureId);
    if (!odds) continue;
    for (const [side, teamKey] of [['Home', 'home'], ['Away', 'away']]) {
      const price = odds.sides?.[side]?.odd;
      const team = fx?.teams?.[teamKey];
      if (!team?.id || !Number.isFinite(price) || price < cfg.minOdds) continue;
      targets.push({
        fixtureId,
        elapsed: Number(fx.fixture.status.elapsed),
        side,
        teamId: Number(team.id),
        teamName: team.name || side,
        homeName: fx?.teams?.home?.name || 'Home',
        awayName: fx?.teams?.away?.name || 'Away',
        homeGoals: fx?.goals?.home ?? null,
        awayGoals: fx?.goals?.away ?? null,
        odd: price,
      });
    }
  }
  return targets;
}

export function metricsForTeam(detail, teamId) {
  const teamRow = (detail?.statistics || []).find((x) => Number(x?.team?.id) === Number(teamId));
  if (!teamRow) return null;
  const values = Object.fromEntries((teamRow.statistics || []).filter((x) => x?.type).map((x) => [x.type, x.value]));
  const num = (name) => {
    const raw = values[name];
    if (raw === null || raw === undefined) return null;
    const n = Number(String(raw).replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
  };
  return {
    shotsOnGoal: num('Shots on Goal'),
    totalShots: num('Total Shots'),
    corners: num('Corner Kicks'),
    possession: num('Ball Possession'),
  };
}

export function evaluateTarget(target, detail, cfg = DEFAULTS) {
  const metrics = metricsForTeam(detail, target.teamId);
  if (!metrics || Object.values(metrics).some((v) => v === null)) {
    return { pass: false, reason: 'MISSING_STATS', metrics };
  }
  const pass = metrics.shotsOnGoal >= cfg.minShotsOnGoal
    && metrics.totalShots >= cfg.minTotalShots
    && metrics.corners >= cfg.minCorners
    && metrics.possession >= cfg.minPossession;
  return { pass, reason: pass ? 'MATCHED' : 'NOT_MATCHED', metrics };
}

export function chunks(items, size = 20) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
