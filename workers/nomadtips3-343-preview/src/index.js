export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/engine/')) {
      const upstream = new URL(request.url);
      upstream.protocol = 'https:';
      upstream.hostname = 'engine.internal';
      upstream.pathname = url.pathname.replace('/api/engine', '') || '/';
      return env.ENGINE.fetch(new Request(upstream, request));
    }
    if (url.pathname === '/') {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = '/index.html';
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    return env.ASSETS.fetch(request);
  }
};
