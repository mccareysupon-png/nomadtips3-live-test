import baseWorker, { Nomad343Engine as BaseNomad343Engine } from './index.js';

const CADENCE_VERSION = 'nomad343-engine-v4-3s-guarded';
const CYCLE_MS = 3_000;
const MIN_ALARM_DELAY_MS = 250;
const REFEREE_WINDOW_MS = 60_000;
const REFEREE_BUDGET = 10;
const DEFAULT_MAX_REFEREE_PER_SCAN = 4;
const UI_ODDS_CACHE_MS = 60_000;
const RATE_KEY = 'refereeRateWindowV1';
const TELEMETRY_KEY = 'cadenceTelemetryV1';
const UI_GUARD_PREFIX = 'uiOddsGuardAt:';

const now = () => Date.now();
const num = value => value === null || value === undefined || value === '' || typeof value === 'boolean' || !Number.isFinite(Number(value)) ? null : Number(value);

export class Nomad343Engine extends BaseNomad343Engine {
  constructor(ctx, env) {
    super(ctx, env);
  }

  async ensureAlarm(delay = MIN_ALARM_DELAY_MS) {
    if (await this.ctx.storage.getAlarm() == null) await this.ctx.storage.setAlarm(now() + Math.max(MIN_ALARM_DELAY_MS, Number(delay) || MIN_ALARM_DELAY_MS));
  }

  async refereeRows(tx = this.ctx.storage) {
    const at = now();
    const rows = ((await tx.get(RATE_KEY)) || []).filter(row => at - Number(row?.at || 0) < REFEREE_WINDOW_MS && Number(row?.count || 0) > 0);
    return rows;
  }

  async reserveReferee(count, kind) {
    const wanted = Math.max(1, Math.round(Number(count) || 1));
    const at = now();
    let result = null;
    await this.ctx.storage.transaction(async tx => {
      const rows = await this.refereeRows(tx);
      const used = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
      if (used + wanted > REFEREE_BUDGET) {
        const oldestAt = Number(rows[0]?.at || at);
        result = { ok: false, used, wanted, retryAfterMs: Math.max(MIN_ALARM_DELAY_MS, REFEREE_WINDOW_MS - (at - oldestAt)) };
        await tx.put(RATE_KEY, rows);
        return;
      }
      const token = `${at.toString(36)}-${crypto.randomUUID()}`;
      rows.push({ token, at, count: wanted, kind });
      await tx.put(RATE_KEY, rows);
      result = { ok: true, token, used: used + wanted, wanted, retryAfterMs: 0 };
    });
    return result;
  }

  async finalizeReservation(token, actualCount) {
    if (!token) return;
    const actual = Math.max(0, Math.round(Number(actualCount) || 0));
    await this.ctx.storage.transaction(async tx => {
      const rows = await this.refereeRows(tx);
      const next = [];
      for (const row of rows) {
        if (row.token !== token) { next.push(row); continue; }
        if (actual > 0) next.push({ ...row, count: actual });
      }
      await tx.put(RATE_KEY, next);
    });
  }

  async refereeStats() {
    const rows = await this.refereeRows();
    const used = rows.reduce((sum, row) => sum + Number(row.count || 0), 0);
    return { usedLast60s: used, internalCeiling: REFEREE_BUDGET, providerCeiling: 40, reservedForHubAndHeadroom: 30 };
  }

  async maxExpectedRefereePerScan() {
    const board = await this.ctx.storage.get('board') || null;
    const value = num(board?.referee?.maxFixturesPerScan);
    return Math.max(1, Math.min(DEFAULT_MAX_REFEREE_PER_SCAN, value ?? DEFAULT_MAX_REFEREE_PER_SCAN));
  }

  async scanIfDue() {
    const last = await this.ctx.storage.get('lastScan') || null;
    if (last?.startedAt && now() - Number(last.startedAt) < CYCLE_MS) return last;
    if (this.scanPromise) return this.scanPromise;

    const maxExpected = await this.maxExpectedRefereePerScan();
    const reservation = await this.reserveReferee(maxExpected, 'scan');
    if (!reservation?.ok) {
      const telemetry = {
        version: CADENCE_VERSION,
        cycleMs: CYCLE_MS,
        guarded: true,
        guardedAt: now(),
        retryAfterMs: reservation?.retryAfterMs ?? CYCLE_MS,
        referee: await this.refereeStats(),
      };
      await this.ctx.storage.put(TELEMETRY_KEY, telemetry);
      return last || { ok: false, startedAt: null, finishedAt: null, lastError: 'REFEREE_RATE_GUARD' };
    }

    this.scanPromise = (async () => {
      let meta = null;
      try {
        meta = await super.scan();
        const board = await this.ctx.storage.get('board') || null;
        const success = Math.max(0, Number(board?.referee?.requests ?? meta?.refereeRequests ?? 0));
        const errors = Array.isArray(board?.referee?.errors) ? board.referee.errors.length : 0;
        const attempts = Math.min(maxExpected, success + errors);
        await this.finalizeReservation(reservation.token, attempts);
        await this.ctx.storage.put(TELEMETRY_KEY, {
          version: CADENCE_VERSION,
          cycleMs: CYCLE_MS,
          guarded: false,
          lastCycleStartedAt: meta?.startedAt ?? null,
          lastCycleFinishedAt: meta?.finishedAt ?? null,
          refereeAttempts: attempts,
          referee: await this.refereeStats(),
        });
        return meta;
      } catch (error) {
        await this.ctx.storage.put(TELEMETRY_KEY, {
          version: CADENCE_VERSION,
          cycleMs: CYCLE_MS,
          guarded: false,
          lastCycleError: String(error?.message || error),
          refereeReservationKept: maxExpected,
          referee: await this.refereeStats(),
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

    if (url.pathname === '/fixture-odds' && request.method === 'GET') {
      const fixtureId = String(url.searchParams.get('fixtureId') || '').trim();
      if (fixtureId) {
        const guardKey = `${UI_GUARD_PREFIX}${fixtureId}`;
        const lastGuardAt = num(await this.ctx.storage.get(guardKey));
        if (lastGuardAt === null || now() - lastGuardAt >= UI_ODDS_CACHE_MS) {
          const reservation = await this.reserveReferee(1, 'ui-fixture-odds');
          if (!reservation?.ok) {
            return Response.json({
              ok: false,
              version: CADENCE_VERSION,
              fixtureId,
              error: 'REFEREE_RATE_GUARD',
              retryAfter: Math.max(1, Math.ceil(Number(reservation?.retryAfterMs || CYCLE_MS) / 1000)),
              referee: await this.refereeStats(),
            }, { status: 429, headers: { 'cache-control': 'no-store' } });
          }
          await this.ctx.storage.put(guardKey, now());
        }
      }
      return super.fetch(request);
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
          referee: await this.refereeStats(),
          telemetry,
        },
      }, { status: response.status, headers: { 'cache-control': 'no-store' } });
    }

    return super.fetch(request);
  }
}

export default baseWorker;
