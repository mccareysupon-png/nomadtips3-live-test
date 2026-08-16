import baseEntry from './page5-nonblocking-entry.js';
import { handleMembershipRoute } from './membership-configured.js';
import { handlePublicV2Route } from './v2-public-routes.js';
import { handleV2Route } from './v2-routes.js';
import { handleOwnerPage } from './v2-owner-page.js';
import { handleCar31LineGatewayRoute, runCar31LineGateway } from './car31-line-gateway.js';

export default {
  async fetch(request, env, ctx) {
    const ownerPageResponse = handleOwnerPage(request);
    if (ownerPageResponse) return ownerPageResponse;

    const membershipResponse = await handleMembershipRoute(request, env);
    if (membershipResponse) return membershipResponse;

    const lineGatewayResponse = await handleCar31LineGatewayRoute(request, env);
    if (lineGatewayResponse) return lineGatewayResponse;

    const publicV2Response = await handlePublicV2Route(request, env);
    if (publicV2Response) return publicV2Response;

    const v2Response = await handleV2Route(request, env);
    if (v2Response) return v2Response;

    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runCar31LineGateway(env).catch(error=>{
      console.warn(JSON.stringify({event:'car31_line_gateway_cron_failed',error:String(error?.message||error)}));
    }));
    return baseEntry.scheduled(controller, env, ctx);
  }
};
