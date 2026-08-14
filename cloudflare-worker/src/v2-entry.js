import baseEntry from './page5-nonblocking-entry.js';
import { handleMembershipRoute } from './membership-configured.js';
import { handlePublicV2Route } from './v2-public-routes.js';
import { handleV2Route } from './v2-routes.js';
import { handleOwnerPage } from './v2-owner-page.js';
import {
  handleJengMoneyPage,
  handleJengMoneyRoute,
  notifyJengMoneyLineEvents
} from './jeng-money.js';

export default {
  async fetch(request, env, ctx) {
    const jengMoneyPageResponse = handleJengMoneyPage(request);
    if (jengMoneyPageResponse) return jengMoneyPageResponse;

    const ownerPageResponse = handleOwnerPage(request);
    if (ownerPageResponse) return ownerPageResponse;

    const jengMoneyRouteResponse = await handleJengMoneyRoute(request, env);
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
      notifyJengMoneyLineEvents(env).catch(error => {
        console.warn(JSON.stringify({
          event: 'jeng_money_line_degraded',
          error: error?.message || String(error)
        }));
      })
    );
    return result;
  }
};
