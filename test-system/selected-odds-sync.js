(() => {
  'use strict';

  const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const SOURCE_URL = new URL('../selected-live-matches.json', document.currentScript.src).href;
  const POLL_MS = 60 * 1000;
  const RETRY_MS = 5 * 1000;
  const ODDS_FIELDS = [
    'odds',
    'oddsStatus',
    'bookmaker',
    'oddsSource',
    'oddsLockedAt',
    'oddsProviderUpdatedAt',
    'oddsMarketName',
    'oddsMarketValue'
  ];
  let busy = false;

  const finite = value =>
    value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;

  function mergeOdds(base, incoming) {
    const next = {...(base || {})};
    for (const field of ODDS_FIELDS) {
      if (incoming && Object.prototype.hasOwnProperty.call(incoming, field)) {
        next[field] = field === 'odds' && finite(incoming[field])
          ? Number(incoming[field])
          : incoming[field];
      }
    }
    return next;
  }

  function same(a, b) {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  async function fetchConfig() {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Odds config HTTP ${response.status}`);
    return response.json();
  }

  async function syncOdds() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        window.setTimeout(syncOdds, RETRY_MS);
        return;
      }

      const state = JSON.parse(raw);
      if (!Array.isArray(state.publishedPicks)) return;

      const config = await fetchConfig();
      const configured = new Map(
        (config.matches || []).map(item => [String(item.client_fixture_id || item.fixture_id || ''), item])
      );
      let changed = false;

      state.publishedPicks = state.publishedPicks.map(record => {
        const source = configured.get(String(record.fixtureId));
        if (!source) return record;

        const sourceMarkets = source.markets || {};
        const nextMarkets = {
          btts: mergeOdds(record.markets?.btts, sourceMarkets.btts),
          doubleChance: mergeOdds(record.markets?.doubleChance, sourceMarkets.doubleChance),
          asianHandicap: mergeOdds(record.markets?.asianHandicap, sourceMarkets.asianHandicap)
        };

        const next = {
          ...record,
          odds: finite(source.odds) ? Number(source.odds) : record.odds,
          bookmaker: source.bookmaker || record.bookmaker,
          oddsStatus: source.oddsStatus || record.oddsStatus,
          oddsSource: source.oddsSource || record.oddsSource,
          oddsLockedAt: source.oddsLockedAt || record.oddsLockedAt,
          markets: nextMarkets
        };

        if (
          !same(record.odds, next.odds) ||
          !same(record.bookmaker, next.bookmaker) ||
          !same(record.oddsStatus, next.oddsStatus) ||
          !same(record.oddsLockedAt, next.oddsLockedAt) ||
          !same(record.markets, next.markets)
        ) {
          changed = true;
        }
        return next;
      });

      if (!changed) return;
      state.oddsPolicy = config.oddsPolicy || state.oddsPolicy || null;
      state.oddsSyncedAt = new Date().toISOString();
      state.updatedAt = state.oddsSyncedAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-results-updated'));
    } catch (error) {
      console.debug('Automatic odds sync pending', error);
    } finally {
      busy = false;
    }
  }

  window.setTimeout(syncOdds, 1000);
  window.setInterval(syncOdds, POLL_MS);
  window.addEventListener('storage', syncOdds);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncOdds();
  });
})();
