import baseWorker, { Nomad343Engine as BaseNomad343Engine } from './index.js';

const CADENCE_VERSION = 'nomad343-engine-v5-3s-unblocked';
const CYCLE_MS = 3_000;
const MIN_ALARM_DELAY_MS = 250;
const TELEMETRY_KEY = 'cadenceTelemetryV2';

const now = () => Date.now();

export class Nomad343Engine extends BaseNomad343Engine {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async ensureAlarm(delay = MIN_ALARM_DELAY_MS) {
    if (await this.ctx.storage.getAlarm() == null) {
      await this.ctx.storage.setAlarm(now() + Math.max(MIN_ALARM_DELAY_MS, Number(delay) || MIN_ALARM_DELAY_MS));
    }
  }

  async scanIfDue() {
    const last = await this.ctx.storage.get('lastScan') || null;
    if (last?.startedAt && now() - Number(last.startedAt) < CYCLE_MS) return last;
    if (this.scanPromise) return this.scanPromise;

    this.scanPromise = (async () => {
      try {
        const meta = await super.scan();
        await this.ctx.storage.put(TELEMETRY_KEY, {
          version: CADENCE_VERSION,
          cycleMs: CYCLE_MS,
          rateGuardBlocksScan: false,
          lastCycleStartedAt: meta?.startedAt ?? null,
          lastCycleFinishedAt: meta?.finishedAt ?? null,
          refereeRequests: Number(meta?.refereeRequests || 0),
          refereeQueued: Number(meta?.refereeQueued || 0),
          lastCycleError: meta?.lastError ?? null,
        });
        return meta;
      } catch (error) {
        await this.ctx.storage.put(TELEMETRY_KEY, {
          version: CADENCE_VERSION,
          cycleMs: CYCLE_MS,
          rateGuardBlocksScan: false,
          lastCycleError: String(error?.message || error),
        });
        throw error;
      } finally {
        this.scanPromise = null;
      }
    })();

    return this.scanPromise;
  }

  async alarm() {
    const cycleStartedAt = now();
    try {
      await this.scanIfDue();
    } finally {
      const nextAt = Math.max(now() + MIN_ALARM_DELAY_MS, cycleStartedAt + CYCLE_MS);
      await this.ctx.storage.setAlarm(nextAt);
    }
  }

  async fetch(request) {
    await this.ensureAlarm();
    const url = new URL(request.url);

    if (url.pathname === '/scan' && request.method === 'POST') {
      return Response.json(await this.scanIfDue(), { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      const response = await super.fetch(request);
      let body = null;
      try { body = await response.json(); } catch { body = { ok: false, component: 'NOMAD343_ENGINE' }; }
      const telemetry = await this.ctx.storage.get(TELEMETRY_KEY) || null;
      return Response.json({
        ...body,
        cadence: {
          version: CADENCE_VERSION,
          cycleMs: CYCLE_MS,
          noOverlap: true,
          alarmArmed: await this.ctx.storage.getAlarm() != null,
          rateGuardBlocksScan: false,
          telemetry,
        },
      }, { status: response.status, headers: { 'cache-control': 'no-store' } });
    }

    return super.fetch(request);
  }
}

export default baseWorker;
