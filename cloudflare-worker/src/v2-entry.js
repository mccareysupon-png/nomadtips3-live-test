import baseEntry from './page5-nonblocking-entry.js';
import { handleMembershipRoute } from './membership-configured.js';
import { handlePublicV2Route } from './v2-public-routes.js';
import { handleV2Route } from './v2-routes.js';
import { handleOwnerPage } from './v2-owner-page.js';
import {
  handleJengMoneyPage,
  handleJengMoneyRoute
} from './jeng-money.js';
import { runJengMoneyRouting } from './jeng-money-routing.js';
import { withJengMoneyRecipient } from './jeng-money-recipient.js';

export default {
  async fetch(request, env, ctx) {
    const jengMoneyPageResponse = handleJengMoneyPage(request);
    if (jengMoneyPageResponse) return jengMoneyPageResponse;

    const ownerPageResponse = handleOwnerPage(request);
    if (ownerPageResponse) return ownerPageResponse;

    const url = new URL(request.url);
    const jengEnv = url.hostname.toLowerCase() === 'bot-owner.nomadtips3.com' && url.pathname === '/jeng-money/data'
      ? await withJengMoneyRecipient(env).catch(() => env)
      : env;
    const jengMoneyRouteResponse = await handleJengMoneyRoute(request, jengEnv);
    if (jengMoneyRouteResponse) return jengMoneyRouteResponse;

    const membershipResponse = await handleMembershipRoute(request, env);
    if (membershipResponse) return membershipResponse;

    const publicV2Response = await handlePublicV2Route(request, env);
    if (publicV2Response) return publicV2Response;

    const v2Response = await handleV2Route(request, env);
    if (v2Response) return v2Response;

    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    const result = baseEntry.scheduled(controller, env, ctx);
    ctx.waitUntil(
      runJengMoneyRouting(env).catch(error => {
        console.warn(JSON.stringify({
          event: 'jeng_money_line_degraded',
          error: error?.message || String(error)
        }));
      })
    );
    return result;
  }
};
