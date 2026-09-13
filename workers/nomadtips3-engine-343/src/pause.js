const VERSION = 'nomad343-engine-paused-for-341-recovery-20260913';

export class Nomad343Engine {
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
      component: 'NOMAD343_ENGINE',
      version: VERSION,
      providerPolling: false,
      alarmRearm: false
    }, { headers: { 'cache-control': 'no-store' } });
  }
}

function stub(env) {
  return env.ENGINE.get(env.ENGINE.idFromName('global'));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    return stub(env).fetch(request);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(stub(env).fetch('https://engine.internal/pause'));
  }
};
