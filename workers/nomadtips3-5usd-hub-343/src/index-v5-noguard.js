import baseWorker, { FiveUsdHub as BaseFiveUsdHub } from './index-v4-upcoming.js';

const VERSION = 'nomad343-5usd-hub-v8-master15-lkg';
const MASTER_CYCLE_MS = 15_000;
const META_KEY = 'fastLiveMetaV1';
const ROWS_KEY = 'fastLiveRowsV1';
const MASTER_STATE_KEY = 'master15StateV1';

const now = () => Date.now();
const plainObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function deepKeep(base, extra) {
  if (extra === null || extra === undefined) return base;
  if (base === null || base === undefined) return extra;
  if (Array.isArray(base) || Array.isArray(extra)) return Array.isArray(extra) && extra.length ? extra : base;
  if (plainObject(base) && plainObject(extra)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(extra)) out[key] = deepKeep(out[key], value);
    return out;
  }
  return extra;
}

function keepLastKnownRows(previousRows, currentRows) {
  const previous = new Map((Array.isArray(previousRows) ? previousRows : []).map(row => [String(row?.fixtureId ?? ''), row]));
  return (Array.isArray(currentRows) ? currentRows : []).map(row => deepKeep(previous.get(String(row?.fixtureId ?? '')), row));
}

export class FiveUsdHub extends BaseFiveUsdHub {
  async reserveFastRequest() {
    return { ok: true, used: null, retryAfterMs: 0, guarded: false };
  }

  async fastRateStats() {
    return {
      guarded: false,
      internalCeiling: null,
      providerCeiling: 40,
      masterCycleMs: MASTER_CYCLE_MS,
      note: 'Internal rate guard removed; provider live compound refresh is gated by the 15s master cycle and no-overlap.',
    };
  }

  async refreshFastLiveIfDue() {
    const meta = await this.ctx.storage.get(META_KEY) || null;
    if (meta?.fetchedAt && now() - Number(meta.fetchedAt) < MASTER_CYCLE_MS) {
      return { ...meta, refreshMs: MASTER_CYCLE_MS };
    }
    if (this.master15Promise) return this.master15Promise;

    this.master15Promise = (async () => {
      const attemptAt = now();
      const previousMeta = await this.ctx.storage.get(META_KEY) || null;
      const previousRows = await this.ctx.storage.get(ROWS_KEY) || [];
      const previousState = await this.ctx.storage.get(MASTER_STATE_KEY) || {};

      const result = await super.refreshFastLiveIfDue(null);
      const currentMeta = await this.ctx.storage.get(META_KEY) || result || previousMeta || null;
      const advanced = Boolean(currentMeta?.fetchedAt && Number(currentMeta.fetchedAt) > Number(previousMeta?.fetchedAt || 0));

      if (advanced) {
        const currentRows = await this.ctx.storage.get(ROWS_KEY) || [];
        await this.ctx.storage.put(ROWS_KEY, keepLastKnownRows(previousRows, currentRows));
      }

      await this.ctx.storage.put(MASTER_STATE_KEY, {
        cycleMs: MASTER_CYCLE_MS,
        lastAttemptAt: attemptAt,
        lastSuccessAt: advanced ? Number(currentMeta?.fetchedAt || attemptAt) : previousState.lastSuccessAt ?? previousMeta?.fetchedAt ?? null,
        lastErrorAt: advanced ? null : attemptAt,
      });

      return currentMeta ? { ...currentMeta, refreshMs: MASTER_CYCLE_MS } : currentMeta;
    })().finally(() => { this.master15Promise = null; });

    return this.master15Promise;
  }

  async snapshot() {
    const base = await super.snapshot();
    return {
      ...base,
      fastLive: base?.fastLive ? { ...base.fastLive, refreshMs: MASTER_CYCLE_MS, masterCycleMs: MASTER_CYCLE_MS, lastKnownGood: true } : base?.fastLive,
      masterCycleMs: MASTER_CYCLE_MS,
      lastKnownGood: true,
      noRateGuard: true,
      noRateGuardVersion: VERSION,
    };
  }

  async health() {
    const base = await super.health();
    const masterState = await this.ctx.storage.get(MASTER_STATE_KEY) || null;
    return {
      ...base,
      fastLive: base?.fastLive ? { ...base.fastLive, refreshMs: MASTER_CYCLE_MS, masterCycleMs: MASTER_CYCLE_MS, lastKnownGood: true } : base?.fastLive,
      masterCycleMs: MASTER_CYCLE_MS,
      lastKnownGood: true,
      masterState,
      noRateGuard: true,
      noRateGuardVersion: VERSION,
    };
  }
}

export default baseWorker;
