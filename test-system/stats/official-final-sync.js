(() => {
  'use strict';

  const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const SOURCE_URL = new URL('../../result-feed.json', document.currentScript.src).href;
  const POLL_MS = 5000;
  let busy = false;
  let queued = false;

  const finiteOdds = value =>
    value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;

  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  function mergeOfficialMarket(base, official) {
    if (!official) return base || null;
    return {
      ...(base || {}),
      ...official,
      pick: official.pick ?? base?.pick ?? '—',
      odds: finiteOdds(official.odds)
        ? Number(official.odds)
        : (finiteOdds(base?.odds) ? Number(base.odds) : null),
      confidence: Number(official.confidence ?? base?.confidence ?? 0),
      outcome: official.outcome ?? official.settlement ?? base?.outcome ?? 'pending',
      settlement: official.settlement ?? official.outcome ?? base?.settlement ?? null
    };
  }

  async function fetchOfficialFeed() {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Official result feed HTTP ${response.status}`);
    return response.json();
  }

  async function syncOfficialFinals() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const state = JSON.parse(raw);
      if (!Array.isArray(state.publishedPicks)) return;

      const feed = await fetchOfficialFeed();
      const officialByFixture = new Map(
        (feed.results || [])
          .filter(item => item?.resultConfirmed)
          .map(item => [String(item.fixtureId), item])
      );
      if (!officialByFixture.size) return;

      let changed = false;
      state.publishedPicks = state.publishedPicks.map(record => {
        const official = officialByFixture.get(String(record.fixtureId));
        if (!official) return record;

        const next = {
          ...record,
          homeScore: official.homeScore ?? record.homeScore ?? null,
          awayScore: official.awayScore ?? record.awayScore ?? null,
          status: 'RESULT_CONFIRMED',
          resultConfirmed: true,
          outcome: official.outcome ?? record.outcome ?? 'pending',
          resultSource: official.resultSource ?? feed.source ?? record.resultSource,
          resultUpdatedAt: official.updatedAt ?? feed.generatedAt ?? record.resultUpdatedAt,
          markets: {
            btts: mergeOfficialMarket(record.markets?.btts, official.markets?.btts),
            doubleChance: mergeOfficialMarket(record.markets?.doubleChance, official.markets?.doubleChance),
            asianHandicap: mergeOfficialMarket(record.markets?.asianHandicap, official.markets?.asianHandicap)
          }
        };

        if (!same(record, next)) changed = true;
        return next;
      });

      if (!changed) return;
      state.officialFinalSyncAt = new Date().toISOString();
      state.updatedAt = state.officialFinalSyncAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-results-updated'));
    } catch (error) {
      console.debug('Official final-result sync pending', error);
    } finally {
      busy = false;
    }
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    window.setTimeout(() => {
      queued = false;
      syncOfficialFinals();
    }, 250);
  }

  window.setTimeout(syncOfficialFinals, 600);
  window.setInterval(syncOfficialFinals, POLL_MS);
  window.addEventListener('nomad-results-updated', queueSync);
  window.addEventListener('storage', queueSync);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncOfficialFinals();
  });
})();