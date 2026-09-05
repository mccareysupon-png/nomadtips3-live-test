const CANONICAL_HOST = 'www.nomadtips3.com';
const APEX_HOST = 'nomadtips3.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = String(url.hostname || '').toLowerCase();

    if (host !== APEX_HOST) {
      return new Response('NOMADTIPS3 apex redirect worker', {
        status: 404,
        headers: {
          'cache-control': 'no-store',
          'content-type': 'text/plain; charset=utf-8',
          'x-nomad-apex-redirect': 'host-mismatch',
        },
      });
    }

    url.protocol = 'https:';
    url.hostname = CANONICAL_HOST;
    url.port = '';

    return new Response(null, {
      status: 308,
      headers: {
        location: url.toString(),
        'cache-control': 'no-store, max-age=0',
        pragma: 'no-cache',
        expires: '0',
        'x-nomad-apex-redirect': '20260905-v1',
      },
    });
  },
};
