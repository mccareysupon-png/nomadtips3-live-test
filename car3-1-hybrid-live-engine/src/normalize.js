function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function pair(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      home: numberOrNull(value.home),
      away: numberOrNull(value.away)
    };
  }
  if (Array.isArray(value)) {
    return {
      home: numberOrNull(value[0]),
      away: numberOrNull(value[1])
    };
  }
  return { home: null, away: null };
}

function text(value, fallback = '') {
  const clean = String(value ?? '').trim();
  return clean || fallback;
}

export function normalizeLiveMatch(row, source = 'UNKNOWN') {
  if (!row || typeof row !== 'object') throw new TypeError('Live source row must be an object');

  const normalized = {
    source: text(source, 'UNKNOWN'),
    sourceMatchId: row.sourceMatchId ?? row.id ?? row.matchId ?? null,
    canonicalMatchId: null,
    league: text(row.league, 'Unknown League'),
    country: text(row.country) || null,
    kickoffUtc: text(row.kickoffUtc) || null,
    minute: numberOrNull(row.minute),
    status: text(row.status, 'LIVE'),
    home: text(row.home),
    away: text(row.away),
    score: pair(row.score),
    stats: {
      possession: pair(row.stats?.possession),
      attacks: pair(row.stats?.attacks),
      dangerous_attacks: pair(row.stats?.dangerous_attacks),
      shots: pair(row.stats?.shots),
      shots_on_target: pair(row.stats?.shots_on_target),
      corners: pair(row.stats?.corners),
      red_cards: pair(row.stats?.red_cards)
    },
    odds: {
      oneXtwo: {
        home: numberOrNull(row.odds?.oneXtwo?.home),
        draw: numberOrNull(row.odds?.oneXtwo?.draw),
        away: numberOrNull(row.odds?.oneXtwo?.away)
      },
      asianHandicap: row.odds?.asianHandicap ?? null
    },
    provenance: {
      source: text(source, 'UNKNOWN'),
      collectedFields: Array.isArray(row.provenance?.collectedFields)
        ? [...row.provenance.collectedFields]
        : [],
      apiEnrichedFields: Array.isArray(row.provenance?.apiEnrichedFields)
        ? [...row.provenance.apiEnrichedFields]
        : []
    },
    collectedAt: text(row.collectedAt, new Date().toISOString()),
    sourceFreshnessSeconds: numberOrNull(row.sourceFreshnessSeconds),
    matchConfidence: numberOrNull(row.matchConfidence)
  };

  if (!normalized.home || !normalized.away) {
    throw new Error('Home and away team names are required');
  }
  if (normalized.sourceMatchId === null || normalized.sourceMatchId === '') {
    throw new Error('sourceMatchId is required; CAR 3.1 never invents source IDs');
  }

  return normalized;
}

export function hasCoreEngine3Stats(match) {
  const keys = ['possession', 'attacks', 'dangerous_attacks', 'shots', 'shots_on_target', 'corners'];
  return keys.every(key => {
    const value = match?.stats?.[key];
    return numberOrNull(value?.home) !== null && numberOrNull(value?.away) !== null;
  });
}
