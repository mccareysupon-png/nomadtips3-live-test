(() => {
  'use strict';

  const WORKER_HOST = 'nomadtips3-test-api.mccarey-supon.workers.dev';
  const DEFAULT_TIMEOUT_MS = 12_000;
  const PAGE5_TIMEOUT_MS = 8_000;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function guardedFetch(input, init = {}) {
    let parsed;
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      parsed = new URL(url, window.location.href);
      if (parsed.hostname !== WORKER_HOST) return nativeFetch(input, init);
    } catch {
      return nativeFetch(input, init);
    }

    const isPage5Scan = parsed.pathname === '/live-condition-scan';
    if (isPage5Scan) {
      parsed.pathname = '/page5-latest';
      parsed.searchParams.set('display_only', '1');
    }

    const rewrittenInput = typeof input === 'string'
      ? parsed.toString()
      : new Request(parsed.toString(), input);

    const controller = new AbortController();
    const callerSignal = init.signal || (typeof input !== 'string' ? input?.signal : null);
    const onCallerAbort = () => {
      try { controller.abort(callerSignal?.reason || 'Caller aborted'); } catch { controller.abort(); }
    };
    if (callerSignal) {
      if (callerSignal.aborted) onCallerAbort();
      else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
    }

    const timeoutMs = isPage5Scan ? PAGE5_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => {
      try { controller.abort('NOMAD Worker request timeout'); } catch { controller.abort(); }
    }, timeoutMs);

    try {
      return await nativeFetch(rewrittenInput, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };
})();
