(() => {
  'use strict';

  const WORKER_HOST = 'nomadtips3-test-api.mccarey-supon.workers.dev';
  const DEFAULT_TIMEOUT_MS = 20_000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function guardedFetch(input, init = {}) {
    let url = '';
    try {
      url = typeof input === 'string' ? input : input?.url || '';
      const parsed = new URL(url, window.location.href);
      if (parsed.hostname !== WORKER_HOST || init.signal) {
        return nativeFetch(input, init);
      }
    } catch {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort('NOMAD Worker request timeout'), DEFAULT_TIMEOUT_MS);
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
})();
