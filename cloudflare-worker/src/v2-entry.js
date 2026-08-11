import baseEntry from './page5-nonblocking-entry.js';
import { handleV2Route } from './v2-routes.js';
import { handleOwnerPage } from './v2-owner-page.js';

export default {
  async fetch(request, env, ctx) {
    const ownerPageResponse = handleOwnerPage(request);
    if (ownerPageResponse) return ownerPageResponse;

    const v2Response = await handleV2Route(request, env);
    if (v2Response) return v2Response;

    return baseEntry.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    return baseEntry.scheduled(controller, env, ctx);
  }
};
