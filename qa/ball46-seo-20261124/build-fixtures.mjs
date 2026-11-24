import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { buildIndex } from './fixture-index.mjs';

const SNAPSHOT = 'https://www.ball46.com/api/engine/board';

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
