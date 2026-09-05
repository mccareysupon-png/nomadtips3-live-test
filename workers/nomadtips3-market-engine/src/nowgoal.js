const BASE = 'https://www.nowgoal.net';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36';

const CORE_BOOKMAKERS = Object.freeze([
  Object.freeze({ companyId: '50', name: '1xBet' }),
  Object.freeze({ companyId: '8', name: 'Bet365' }),
  Object.freeze({ companyId: '17', name: 'M88' }),
]);

const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
const number = value => finite(value) ? Number(value) : null;

function cookieFromHeaders(headers) {
  const all = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : [];
  if (all.length) return all.map(value => String(value).split(';')[0]).filter(Boolean).join('; ');
  const one = headers?.get?.('set-cookie') || '';
  return one ? String(one).split(';')[0] : '';
}

async function requestText(fetchImpl, path, timeoutMs, cookie = '', accept = '*/*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('nowgoal_timeout'), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, BASE).toString(), {
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: {
        'user-agent': UA,
        accept,
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'no-cache, no-store',
        pragma: 'no-cache',
        referer: `${BASE}/`,
        ...(cookie ? { cookie } : {}),
      },
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`nowgoal_http_${response.status}`);
      error.status = response.status;
      throw error;
    }
    return { text, cookie: cookieFromHeaders(response.headers) };
  } finally {
    clearTimeout(timer);
  }
}

function splitLiteral(body = '') {
  const out = [];
  let current = '', quote = null, escape = false;
  for (const ch of body) {
    if (quote) {
      if (escape) { current += ch; escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === quote) { quote = null; continue; }
      current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === ',') { out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  out.push(current.trim());
  return out.map(value => value === '' ? null : value);
}

export function parseNowgoalRoster(js = '') {
  const rows = [];
  for (const match of String(js).matchAll(/A\[\d+\]\s*=\s*\[([^;]*?)\];/g)) {
    const fields = splitLiteral(match[1]);
    const id = String(fields[0] ?? '').trim();
    if (!/^\d+$/.test(id)) continue;
    rows.push({
      id,
      home: String(fields[4] ?? '').trim(),
      away: String(fields[5] ?? '').trim(),
      state: number(fields[8]),
      score: [number(fields[9]), number(fields[10])],
    });
  }
  return rows;
}

export function parseNowgoalGoalRows(xml = '') {
  const rows = new Map();
  for (const match of String(xml).matchAll(/<m>([^<]+)<\/m>/g)) {
    const fields = match[1].split(',').map(value => String(value ?? '').trim());
    const id = String(fields[0] || '').trim();
    if (!/^\d+$/.test(id)) continue;
    rows.set(id, fields);
  }
  return rows;
}

function decimal(value) {
  const n = number(value);
  return n !== null && n > 1 && n < 100 ? n : null;
}

function hkToDecimal(value) {
  const n = number(value);
  if (n === null || n < 0) return null;
  const out = n < 1.5 ? 1 + n : n;
  return out > 1 && out < 100 ? Number(out.toFixed(4)) : null;
}

export function parseNowgoalOneXtwoTotals(fields = []) {
  const home = decimal(fields[6]);
  const draw = decimal(fields[7]);
  const away = decimal(fields[8]);
  const totalLine = number(fields[10]);
  const overOdds = hkToDecimal(fields[11]);
  const underOdds = hkToDecimal(fields[12]);
  const oneXtwo = home !== null && draw !== null && away !== null ? { home, draw, away } : null;
  const totals = totalLine !== null && overOdds !== null && underOdds !== null
    ? [{ line: totalLine, overOdds, underOdds }]
    : [];
  return { oneXtwo, totals };
}

function bookmakerSnapshot(definition, fields, observedAt) {
  if (!fields) return null;
  const markets = parseNowgoalOneXtwoTotals(fields);
  if (!markets.oneXtwo && !markets.totals.length) return null;
  return {
    name: definition.name,
    observedAt,
    markets: {
      oneXtwo: markets.oneXtwo,
      totals: markets.totals,
    },
  };
}

export function nowgoalConfig(env = {}) {
  const timeoutRaw = Number(env.MARKET_PROVIDER_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.max(1_000, Math.min(12_000, timeoutRaw)) : 6_000;
  return { base: BASE, timeoutMs, bookmakers: CORE_BOOKMAKERS.map(item => item.name) };
}

export async function fetchNowgoalPayload(env = {}, fetchImpl = fetch, observedAt = Date.now()) {
  const config = nowgoalConfig(env);
  const homepage = await requestText(fetchImpl, '/', config.timeoutMs, '', 'text/html,*/*');
  if (!homepage.cookie) {
    const error = new Error('nowgoal_session_cookie_missing');
    error.code = 'nowgoal_session_cookie_missing';
    throw error;
  }

  const [rosterResponse, ...bookmakerResponses] = await Promise.all([
    requestText(fetchImpl, `/gf/data/bf_en-idn1.js?${observedAt}`, config.timeoutMs, homepage.cookie, 'application/javascript,text/javascript,*/*'),
    ...CORE_BOOKMAKERS.map(definition => requestText(
      fetchImpl,
      `/gf/data/odds/en/goal${definition.companyId}.xml?${observedAt}`,
      config.timeoutMs,
      homepage.cookie,
      'application/xml,text/xml,*/*',
    )),
  ]);

  const roster = parseNowgoalRoster(rosterResponse.text).filter(row => Number.isFinite(row.state) && row.state > 0 && row.home && row.away);
  if (!roster.length) {
    return {
      provider: 'Nowgoal',
      observedAt,
      matches: [],
      sourceDiagnostics: { liveMatches: 0, referees: CORE_BOOKMAKERS.length, usableMatches: 0 },
    };
  }

  const rowsByBookmaker = CORE_BOOKMAKERS.map((definition, index) => ({
    definition,
    rows: parseNowgoalGoalRows(bookmakerResponses[index]?.text || ''),
  }));

  const matches = roster.map(row => {
    const bookmakers = rowsByBookmaker
      .map(({ definition, rows }) => bookmakerSnapshot(definition, rows.get(row.id), observedAt))
      .filter(Boolean);
    return {
      id: row.id,
      matchKey: `nowgoal:${row.id}`,
      home: row.home,
      away: row.away,
      score: row.score,
      observedAt,
      bookmakers,
    };
  }).filter(match => match.bookmakers.length > 0);

  return {
    provider: 'Nowgoal',
    observedAt,
    matches,
    sourceDiagnostics: {
      liveMatches: roster.length,
      referees: CORE_BOOKMAKERS.length,
      usableMatches: matches.length,
      bookmakerNames: CORE_BOOKMAKERS.map(item => item.name),
      markets: ['1X2', 'OVER_UNDER'],
      asianHandicap: false,
    },
  };
}

export const NOWGOAL_MARKET_BOOKMAKERS = CORE_BOOKMAKERS;
