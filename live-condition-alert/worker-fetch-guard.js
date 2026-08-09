(() => {
  'use strict';

  const WORKER_HOST = 'nomadtips3-test-api.mccarey-supon.workers.dev';
  const DEFAULT_TIMEOUT_MS = 12_000;
  const PAGE5_TIMEOUT_MS = 8_000;
  const PAGE5_CACHE_KEY = 'nomadtips3.page5.last-good-payload.v1';
  const nativeFetch = window.fetch.bind(window);

  function cachedPage5Response(reason) {
    try {
      const raw = localStorage.getItem(PAGE5_CACHE_KEY);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      if (!payload || typeof payload !== 'object') return null;
      const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
      payload.ok = true;
      payload.stale = true;
      payload.serverOnline = false;
      payload.page5ReadMode = 'BROWSER_LAST_GOOD';
      payload.page5TriggeredScan = false;
      payload.scannerError = reason || 'Worker request unavailable';
      payload.warnings = [...warnings, `LAST GOOD DISPLAY · ${payload.scannerError}`].slice(-20);
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    } catch {
      return null;
    }
  }

  async function rememberPage5Response(response) {
    if (!response?.ok) return;
    try {
      const text = await response.clone().text();
      const payload = JSON.parse(text);
      if (payload?.ok) localStorage.setItem(PAGE5_CACHE_KEY, text);
    } catch {
      // Browser storage is optional; never block Page 5 because of cache failure.
    }
  }

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
      const response = await nativeFetch(rewrittenInput, { ...init, signal: controller.signal });
      if (isPage5Scan) await rememberPage5Response(response);
      return response;
    } catch (error) {
      if (isPage5Scan) {
        const fallback = cachedPage5Response(error?.message || 'Worker request timeout');
        if (fallback) return fallback;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
    }
  };
})();
