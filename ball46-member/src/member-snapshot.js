// Snapshot storage contract. Only scheduled publisher reads the source engine.
// Member requests read Cloudflare KV exclusively; fail closed if unpublished.
const TTL_SECONDS = 48 * 60 * 60;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function snapshotCycle(now = Date.now()) {
  const local = new Date(now + BANGKOK_OFFSET_MS);
  let start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 12) - BANGKOK_OFFSET_MS;
  if (now < start) start -= DAY_MS;
  return { start, end: start + DAY_MS };
}

export function snapshotKey(start) {
  return 'member:daily:v1:' + String(start);
}

export async function readSnapshot(env, now = Date.now()) {
  if (!env.MEMBER_DAILY_SNAPSHOTS) throw new Error('SNAPSHOT_BINDING_MISSING');
  const cycle = snapshotCycle(now);
  const data = await env.MEMBER_DAILY_SNAPSHOTS.get(snapshotKey(cycle.start), 'json');
  if (!data || data.cycleStart !== cycle.start || !data.daily ||
      data.daily.cycleStart !== cycle.start) throw new Error('SNAPSHOT_NOT_READY');
  return data;
}

export async function publishSnapshot(env, loadDaily, loadBoard, now = Date.now()) {
  if (!env.MEMBER_DAILY_SNAPSHOTS) throw new Error('SNAPSHOT_BINDING_MISSING');
  const cycle = snapshotCycle(now);
  const daily = await loadDaily();
  if (daily.cycleStart !== cycle.start) throw new Error('SNAPSHOT_CYCLE_CHANGED');
  // The source board is read once per scheduled publication, not per viewer.
  const board = await loadBoard();
  const payload = {
    version:1,
    cycleStart:cycle.start,
    generatedAt:Date.now(),
    daily,
    fixtures:Array.isArray(board?.fixtures) ? board.fixtures : []
  };
  await env.MEMBER_DAILY_SNAPSHOTS.put(snapshotKey(cycle.start), JSON.stringify(payload),
    { expirationTtl:TTL_SECONDS });
  return {cycleStart:cycle.start, signalCount:daily.signalCount, generatedAt:payload.generatedAt};
}
