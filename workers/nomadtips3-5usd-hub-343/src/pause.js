const VERSION = 'nomad343-5usd-hub-paused-for-341-recovery-20260913';

export class FiveUsdHub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async stopAlarm() {
    try { await this.ctx.storage.deleteAlarm(); } catch {}
  }

  async alarm() {
    await this.stopAlarm();
  }

  async fetch(_request) {
    await this.stopAlarm();
    return Response.json({
      ok: true,
      paused: true,
      component: 'NOMAD343_5USD_HUB',
      version: VERSION,
      providerPolling: false,
      alarmRearm: false
    }, { headers: { 'cache-control': 'no-store' } });
  }
}

function stub(env) {
  return env.HUB.get(env.HUB.idFromName('global'));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    return stub(env).fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch('https://hub.internal/pause'));
  }
};
