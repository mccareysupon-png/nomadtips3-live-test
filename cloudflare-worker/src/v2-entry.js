import baseEntry from './page5-nonblocking-entry.js';
import { handleMembershipRoute } from './membership-configured.js';
import { handlePublicV2Route } from './v2-public-routes.js';
import { handleV2Route } from './v2-routes.js';
import { handleOwnerPage } from './v2-owner-page.js';

export default {
  async fetch(request, env, ctx) {
    const ownerPageResponse = handleOwnerPage(request);
    if (ownerPageResponse) return ownerPageResponse;

    const membershipResponse = await handleMembershipRoute(request, env);
    if (membershipResponse) return membershipResponse;

    const publicV2Response = await handlePublicV2Route(request, env);
    if (publicV2Response) return publicV2Response;

    const v2Response = await handleV2Route(request, env);
    if (v2Response) return v2Response;

    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return baseEntry.scheduled(controller, env, ctx);
  }
};
