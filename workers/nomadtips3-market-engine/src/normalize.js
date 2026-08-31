const DEFAULT_MAX_AGE_MS = 30_000;

const TIER_A = new Set(['pinnacle','bet365','sbobet','188bet','betfairexchange']);
const TIER_B = new Set(['bwin','unibet','betway','10bet','betano','ladbrokes','marathonbet','winamax','tipico','stake','fun88','m88']);

export function finite(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeName(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compact(value = '') { return normalizeName(value).replace(/\s+/g, ''); }

export function canonicalBookmaker(value = '') {
  const key = compact(value);
  const aliases = [
    ['pinnacle','Pinnacle'],['bet365','Bet365'],['sbobet','SBOBET'],['188bet','188Bet'],
    ['betfairexchange','Betfair Exchange'],['betfair','Betfair Exchange'],['bwin','Bwin'],
    ['unibet','Unibet'],['betway','Betway'],['10bet','10Bet'],['betano','Betano'],
    ['ladbrokes','Ladbrokes'],['marathonbet','Marathonbet'],['winamax','Winamax'],
    ['tipico','Tipico'],['stake','Stake'],['fun88','FUN88'],['m88','M88']
  ];
  for (const [needle, label] of aliases) if (key.includes(needle)) return label;
  return String(value || '').trim() || 'Unknown';
}

export function bookmakerWeight(value = '') {
  const key = compact(canonicalBookmaker(value));
  if (TIER_A.has(key)) return 2;
  if (TIER_B.has(key)) return 1;
  return 0.5;
}

export function toTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return n < 10_000_000_000 ? n * 1000 : n;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decimal(value) {
  const n = finite(value);
  return n !== null && n > 1 && n < 100 ? n : null;
}

function lineValue(value) {
  if (typeof value === 'string' && value.includes('/')) {
    const parts = value.replace(/[−–—]/g, '-').split('/').slice(0, 2).map(Number);
    if (parts.length === 2 && parts.every(Number.isFinite)) return Number(((parts[0] + parts[1]) / 2).toFixed(4));
  }
  return finite(value);
}

function marketObject(raw = {}) {
  return raw?.markets && typeof raw.markets === 'object' ? raw.markets : raw;
}

function normalizeAh(raw) {
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return rows.map(row => ({
    line: lineValue(row?.line ?? row?.handicap ?? row?.hdp),
    homeOdds: decimal(row?.homeOdds ?? row?.home ?? row?.h),
    awayOdds: decimal(row?.awayOdds ?? row?.away ?? row?.a),
  })).filter(row => row.line !== null && row.homeOdds !== null && row.awayOdds !== null);
}

function normalizeTotals(raw) {
  const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return rows.map(row => ({
    line: lineValue(row?.line ?? row?.total ?? row?.goals),
    overOdds: decimal(row?.overOdds ?? row?.over ?? row?.o),
    underOdds: decimal(row?.underOdds ?? row?.under ?? row?.u),
  })).filter(row => row.line !== null && row.overOdds !== null && row.underOdds !== null);
}

function normalizeOneXtwo(raw) {
  if (!raw) return null;
  const row = Array.isArray(raw) ? raw[0] : raw;
  const home = decimal(row?.home ?? row?.homeOdds ?? row?.['1']);
  const draw = decimal(row?.draw ?? row?.drawOdds ?? row?.x ?? row?.X);
  const away = decimal(row?.away ?? row?.awayOdds ?? row?.['2']);
  return home !== null && draw !== null && away !== null ? { home, draw, away } : null;
}

function median(values) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const mid = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2;
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

export function chooseMainLine(bookmakers, marketKey) {
  const stats = new Map();
  for (const book of bookmakers) {
    const rows = marketKey === 'ah' ? book.markets.ah : book.markets.totals;
    for (const row of rows || []) {
      const key = Number(row.line).toFixed(4);
      const weight = bookmakerWeight(book.name);
      const first = marketKey === 'ah' ? row.homeOdds : row.overOdds;
      const second = marketKey === 'ah' ? row.awayOdds : row.underOdds;
      const entry = stats.get(key) || { line: Number(row.line), coverage: 0, books: 0, balance: [] };
      entry.coverage += weight;
      entry.books += 1;
      entry.balance.push(Math.abs(first - second));
      stats.set(key, entry);
    }
  }
  const ranked = [...stats.values()].map(x => ({ ...x, avgBalance: median(x.balance) ?? 99 }))
    .sort((a, b) => b.coverage - a.coverage || b.books - a.books || a.avgBalance - b.avgBalance || Math.abs(a.line) - Math.abs(b.line));
  return ranked[0]?.line ?? null;
}

function consensusVote(votes) {
  const score = new Map();
  let totalWeight = 0;
  for (const vote of votes) {
    const weight = bookmakerWeight(vote.bookmaker);
    score.set(vote.side, (score.get(vote.side) || 0) + weight);
    totalWeight += weight;
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const [side = 'MIXED', winningWeight = 0] = ranked[0] || [];
  const share = totalWeight > 0 ? winningWeight / totalWeight : 0;
  const strength = votes.length < 3 ? 'LIMITED' : share >= 0.65 ? 'STRONG' : share >= 0.58 ? 'MODERATE' : 'MIXED';
  return { side: strength === 'MIXED' ? 'MIXED' : side, agree: votes.filter(v => v.side === side).length, total: votes.length, weightedShare: round(share, 3), strength };
}

export function buildConsensus(bookmakers, main) {
  const ahVotes = [];
  const totalsVotes = [];
  const oneXtwoVotes = [];
  for (const book of bookmakers) {
    if (main.ah) {
      const row = book.markets.ah.find(x => Math.abs(x.line - main.ah.line) < 0.001);
      if (row) ahVotes.push({ bookmaker: book.name, side: row.homeOdds < row.awayOdds ? 'HOME' : row.awayOdds < row.homeOdds ? 'AWAY' : 'MIXED' });
    }
    if (main.totals) {
      const row = book.markets.totals.find(x => Math.abs(x.line - main.totals.line) < 0.001);
      if (row) totalsVotes.push({ bookmaker: book.name, side: row.overOdds < row.underOdds ? 'OVER' : row.underOdds < row.overOdds ? 'UNDER' : 'MIXED' });
    }
    if (book.markets.oneXtwo) {
      const row = book.markets.oneXtwo;
      const options = [['HOME', row.home], ['DRAW', row.draw], ['AWAY', row.away]].sort((a, b) => a[1] - b[1]);
      oneXtwoVotes.push({ bookmaker: book.name, side: options[0][0] });
    }
  }
  const ah = consensusVote(ahVotes);
  const oneXtwo = consensusVote(oneXtwoVotes);
  const totals = consensusVote(totalsVotes);
  const usable = [ah, oneXtwo, totals].filter(x => ['STRONG','MODERATE'].includes(x.strength));
  const overallStrength = usable.some(x => x.strength === 'STRONG') ? 'STRONG' : usable.length ? 'MODERATE' : 'MIXED';
  const labels = [];
  if (ah.side !== 'MIXED') labels.push(ah.side);
  if (totals.side !== 'MIXED') labels.push(totals.side);
  return { ah, oneXtwo, totals, overall: { label: labels.join(' / ') || 'MIXED', strength: overallStrength } };
}

function mainSnapshot(bookmakers) {
  const ahLine = chooseMainLine(bookmakers, 'ah');
  const totalsLine = chooseMainLine(bookmakers, 'totals');
  const ahRows = ahLine === null ? [] : bookmakers.flatMap(book => book.markets.ah.filter(x => Math.abs(x.line - ahLine) < 0.001));
  const totalsRows = totalsLine === null ? [] : bookmakers.flatMap(book => book.markets.totals.filter(x => Math.abs(x.line - totalsLine) < 0.001));
  const oneRows = bookmakers.map(book => book.markets.oneXtwo).filter(Boolean);
  return {
    ah: ahLine === null || !ahRows.length ? null : { line: ahLine, homeOdds: round(median(ahRows.map(x => x.homeOdds))), awayOdds: round(median(ahRows.map(x => x.awayOdds))) },
    oneXtwo: !oneRows.length ? null : { home: round(median(oneRows.map(x => x.home))), draw: round(median(oneRows.map(x => x.draw))), away: round(median(oneRows.map(x => x.away))) },
    totals: totalsLine === null || !totalsRows.length ? null : { line: totalsLine, overOdds: round(median(totalsRows.map(x => x.overOdds))), underOdds: round(median(totalsRows.map(x => x.underOdds))) },
  };
}

export function normalizeMarketMatch(raw, context = {}) {
  const now = Number(context.now || Date.now());
  const fallbackObservedAt = toTimestamp(raw?.observedAt ?? context.observedAt, now);
  const maxAgeMs = Number(context.maxAgeMs || DEFAULT_MAX_AGE_MS);
  const rawBooks = Array.isArray(raw?.bookmakers) ? raw.bookmakers : Array.isArray(raw?.books) ? raw.books : [];
  const bookmakers = [];
  for (const source of rawBooks) {
    const observedAt = toTimestamp(source?.observedAt ?? source?.updatedAt ?? source?.timestamp, fallbackObservedAt);
    if (!Number.isFinite(observedAt) || now - observedAt > maxAgeMs || observedAt - now > 15_000) continue;
    const markets = marketObject(source);
    const ah = normalizeAh(markets.ah ?? markets.asianHandicap ?? markets.asian_handicap);
    const oneXtwo = normalizeOneXtwo(markets.oneXtwo ?? markets.one_x_two ?? markets['1x2']);
    const totals = normalizeTotals(markets.totals ?? markets.overUnder ?? markets.over_under ?? markets.ou);
    if (!ah.length && !oneXtwo && !totals.length) continue;
    bookmakers.push({ name: canonicalBookmaker(source?.name ?? source?.bookmaker), observedAt, markets: { ah, oneXtwo, totals } });
  }
  const main = mainSnapshot(bookmakers);
  const consensus = buildConsensus(bookmakers, main);
  const home = String(raw?.home ?? raw?.homeTeam ?? raw?.home_team ?? '').trim();
  const away = String(raw?.away ?? raw?.awayTeam ?? raw?.away_team ?? '').trim();
  if (!home || !away) return null;
  return {
    matchKey: String(raw?.matchKey ?? raw?.id ?? `${normalizeName(home)}__${normalizeName(away)}`),
    home,
    away,
    league: String(raw?.league?.name ?? raw?.league ?? raw?.competition ?? ''),
    minute: finite(raw?.minute),
    score: Array.isArray(raw?.score) ? [finite(raw.score[0]), finite(raw.score[1])] : null,
    observedAt: fallbackObservedAt,
    bookmakers,
    refereesOnline: bookmakers.length,
    main,
    consensus,
  };
}

export function normalizeProviderPayload(payload, options = {}) {
  const observedAt = toTimestamp(payload?.observedAt ?? payload?.updatedAt ?? payload?.timestamp, Date.now());
  const rows = Array.isArray(payload?.matches) ? payload.matches : Array.isArray(payload?.events) ? payload.events : [];
  const matches = rows.map(raw => normalizeMarketMatch(raw, { ...options, observedAt })).filter(Boolean);
  return {
    ok: true,
    version: 'market-v1',
    provider: String(options.providerName ?? payload?.provider ?? 'authorized-market-feed'),
    observedAt,
    counts: { matches: matches.length, bookmakers: new Set(matches.flatMap(m => m.bookmakers.map(b => b.name))).size },
    matches,
  };
}

export const MARKET_NORMALIZER_DEFAULTS = Object.freeze({ maxAgeMs: DEFAULT_MAX_AGE_MS });
