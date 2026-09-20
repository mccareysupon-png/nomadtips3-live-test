import richBase, { FiveUsdHub as BaseFiveUsdHub, RichOddsGate } from './index-rich-odds.js';

const VERSION = 'nomad343-5usd-hub-v6-viewer-cache-only';
const STALE_MS = 180_000;
const EMPTY_LIVE_HOLD_MS = 600_000;
const now = () => Date.now();

export { RichOddsGate };

export class FiveUsdHub extends BaseFiveUsdHub {
  async writeSnapshot(rows, detail = {}) {
    const oldMeta = await this.meta();
    const incomingLive = Array.isArray(rows)
      ? rows.filter((row) => row?.boardState === 'live').length
      : 0;

    // A transient empty live-board response must never erase the current live board/odds.
    // Hold the previous good live snapshot for up to 10 minutes. This applies only to
    // LIVE refreshes; TODAY+LIVE refreshes can legitimately move matches to finished.
    if (
      detail?.refreshKind === 'LIVE' &&
      Number(oldMeta?.counts?.live || 0) > 0 &&
      incomingLive === 0
    ) {
      const key = 'viewerSafeEmptyLiveSince';
      let since = Number(await this.ctx.storage.get(key) || 0);
      if (!since) {
        since = now();
        await this.ctx.storage.put(key, since);
      }
      if (now() - since < EMPTY_LIVE_HOLD_MS) return oldMeta;
      await this.ctx.storage.delete(key);
    } else {
      await this.ctx.storage.delete('viewerSafeEmptyLiveSince');
    }

    return super.writeSnapshot(rows, detail);
  }

  // Viewer reads are strictly cache-only. No refreshIfDue(), no provider request,
  // no per-viewer fan-out. Cron/alarm refreshes are the only producer path.
  async snapshot() {
    const m = await this.meta();
    const s = await this.state();
    const control = await this.control();
    if (!m) {
      return {
        ok: false,
        version: VERSION,
        provider: '5DollarFootballAPI',
        cacheOnly: true,
        viewerRefreshEnabled: false,
        externalRequestsAdded: 0,
        error: s.lastError || 'NO_SNAPSHOT',
        fixtures: []
      };
    }

    const rows = await this.readRows(m);
    const ageMs = Math.max(0, now() - Number(m.fetchedAt || 0));
    return {
      ok: true,
      version: VERSION,
      provider: '5DollarFootballAPI',
      cacheOnly: true,
      viewerRefreshEnabled: false,
      externalRequestsAdded: 0,
      fetchedAt: m.fetchedAt,
      ageMs,
      stale: ageMs > STALE_MS,
      fixtureCount: rows.length,
      counts: m.counts,
      continuityEnabled: m.continuityEnabled === true,
      continuityHeldFixtures: Number(m.continuityHeldFixtures || 0),
      providerRequestCount: m.providerRequestCount,
      providerRequestBudget: m.providerRequestBudget,
      todayRequests: m.todayRequests,
      liveRequests: m.liveRequests,
      guardHit: m.guardHit,
      include: m.include,
      todayWindow: m.todayWindow,
      todayFetchedAt: m.todayFetchedAt,
      liveFetchedAt: m.liveFetchedAt,
      refreshKind: m.refreshKind,
      control,
      lastAttemptAt: s.lastAttemptAt,
      lastSuccessAt: s.lastSuccessAt,
      lastError: s.lastError,
      lastRateLimitAt: s.lastRateLimitAt,
      retryAfterSec: s.retryAfterSec,
      fixtures: rows
    };
  }

  async health() {
    const h = await super.health();
    return {
      ...h,
      version: VERSION,
      cacheOnlyViewer: true,
      viewerRefreshEnabled: false,
      externalRequestsPerViewer: 0
    };
  }
}

function viewerBlockedResponse() {
  return new Response(JSON.stringify({
    ok: false,
    version: VERSION,
    error: 'VIEWER_RICH_ODDS_DISABLED_USE_BULK_SNAPSHOT',
    cacheOnly: true,
    externalRequestsAdded: 0
  }), {
    status: 410,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Legacy public rich-odds was a per-fixture provider path. Disable it at the
    // production entrypoint so even stale browser code cannot fan out to 5USD.
    if (url.pathname === '/rich-odds') return viewerBlockedResponse();

    return richBase.fetch(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    return richBase.scheduled(event, env, ctx);
  }
};