import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DAY = 86_400_000;
const SNAPSHOT = 'https://www.ball46.com/api/engine/board';
const STATUSES = new Set(['scheduled', 'live', 'finished']);
const FIXTURE_ID = /^[1-9][0-9]{0,19}$/;

function text(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 180) : '';
}

function score(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function compactFixture(row, observedAt) {
  const id = String(row.fixtureId ?? '');
  const home = text(row.home?.name);
  const away = text(row.away?.name);
  const league = text(row.league?.name);
  const kickoff = row.kickoffUtc;
  const start = typeof kickoff === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(kickoff) ? Date.parse(kickoff) : NaN;

  if (!FIXTURE_ID.test(id) || !home || !away || !league || home === away ||
      !Number.isFinite(start) || !STATUSES.has(row.status)) return null;

  const goals = row.status === 'scheduled' ? null : [score(row.goals?.home), score(row.goals?.away)];
  const result = goals && goals.every(value => value !== null) ? goals : null;
  if (row.status === 'finished' && !result) return null;

  return { id, home, away, league, start, status: row.status, result, observedAt };
}

export function buildIndex(snapshot, previous = null, now = Date.now()) {
  const { hubFetchedAt, fixtures } = snapshot;
  if (snapshot.ok !== true || snapshot.stale !== false || !Array.isArray(fixtures) ||
      !Number.isSafeInteger(hubFetchedAt) || hubFetchedAt <= 0 || hubFetchedAt > now + 300_000) {
    throw new Error('Expected a valid, non-stale public board snapshot');
  }
  if (previous && hubFetchedAt <= previous.observedAt) return previous;

  const minStart = now - 30 * DAY;
  const maxStart = now + 7 * DAY;
  const keep = entry => entry.start >= minStart && entry.start <= maxStart;
  const entries = new Map();
  const seen = new Set();
  for (const row of fixtures) {
    seen.add(String(row.fixtureId ?? ''));
    const entry = compactFixture(row, hubFetchedAt);
    if (entry && keep(entry)) entries.set(entry.id, entry);
  }
  if (!entries.size) throw new Error('The snapshot contains no publishable matches');

  // Keep links for finished matches after they roll off the board. A current board
  // entry always wins, including legitimate changes to kickoff time or result.
  for (const entry of previous?.entries ?? []) {
    if (entry.status === 'finished' && keep(entry) && !seen.has(entry.id)) entries.set(entry.id, entry);
  }
  return {
    observedAt: hubFetchedAt,
    entries: [...entries.values()].sort((a, b) => b.start - a.start || a.id.localeCompare(b.id)),
  };
}

async function readPrevious(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

export async function refreshIndex(path, { snapshotPath, previous } = {}) {
  const old = previous ?? await readPrevious(path);
  let snapshot;
  if (snapshotPath) {
    snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  } else {
    const response = await fetch(SNAPSHOT, { signal: AbortSignal.timeout(25_000) });
    if (!response.ok) throw new Error('Public board returned HTTP ' + response.status);
    snapshot = await response.json();
  }
  const index = buildIndex(snapshot, old);
  if (index !== old) {
    const temporary = path + '.' + process.pid + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(index), { flag: 'wx' });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  return index;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [outputPath, snapshotPath] = process.argv.slice(2);
  if (!outputPath) throw new Error('Usage: node build-fixtures.mjs OUTPUT.json [PUBLIC_BOARD_SNAPSHOT.json]');
  const index = await refreshIndex(outputPath, { snapshotPath });
  console.log(JSON.stringify({ entries: index.entries.length, observedAt: new Date(index.observedAt).toISOString() }));
}
