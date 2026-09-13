import baseWorker, { FiveUsdHub as BaseFiveUsdHub } from './index-v4-upcoming.js';

const VERSION = 'nomad343-5usd-hub-v7-noguard';

export class FiveUsdHub extends BaseFiveUsdHub {
  async reserveFastRequest() {
    return { ok: true, used: null, retryAfterMs: 0, guarded: false };
  }

  async fastRateStats() {
    return {
      guarded: false,
      internalCeiling: null,
      providerCeiling: 40,
      note: 'Internal rate guard removed; 3s cadence and no-overlap remain active.',
    };
  }

  async snapshot() {
    const base = await super.snapshot();
    return {
      ...base,
      noRateGuard: true,
      noRateGuardVersion: VERSION,
    };
  }

  async health() {
    const base = await super.health();
    return {
      ...base,
      noRateGuard: true,
      noRateGuardVersion: VERSION,
    };
  }
}

export default baseWorker;
