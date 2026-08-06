(() => {
  'use strict';

  const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const SOURCE_URL = new URL('../selected-live-matches.json', document.currentScript.src).href;
  const POLL_MS = 60 * 1000;
  const RETRY_MS = 5 * 1000;
  let busy = false;

  const finite = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

  function normalizeMarket(value, fallbackPick = 'N/A') {
    const market = value && typeof value === 'object' ? value : {};
    return {
      ...market,
      pick: market.pick || fallbackPick,
      odds: finite(market.odds) ? Number(market.odds) : null,
      oddsStatus: market.oddsStatus || (finite(market.odds) ? 'LOCKED' : 'N/A'),
      confidence: Number(market.confidence || 58),
      outcome: market.outcome || 'pending'
    };
  }

  function toRecord(source, config, previous) {
    const side = String(source.pick_side || 'home').toUpperCase();
    const markets = source.markets || {};
    return {
      ...(previous || {}),
      fixtureId: String(source.client_fixture_id || source.fixture_id || source.slug),
      providerFixtureId: source.fixture_id ? String(source.fixture_id) : null,
      pickDate: config.selection_date,
      league: source.league || 'Unknown competition',
      home: source.home,
      away: source.away,
      kickoffUtc: source.kickoff_utc,
      pick: side,
      pickLabel: source.pick || `${side} WIN`,
      odds: finite(source.odds) ? Number(source.odds) : null,
      bookmaker: source.bookmaker || 'N/A',
      oddsStatus: source.oddsStatus || (finite(source.odds) ? 'LOCKED' : 'N/A'),
      oddsSource: source.oddsSource || null,
      oddsLockedAt: source.oddsLockedAt || config.locked_at_utc,
      confidence: Number(source.confidence || 58),
      predictedScore: source.predicted_score || '—',
      markets: {
        btts: normalizeMarket(markets.btts),
        doubleChance: normalizeMarket(markets.doubleChance),
        asianHandicap: normalizeMarket(markets.asianHandicap)
      },
      reason: source.reason || 'Automatic NOMAD SYSTEM analysis.',
      abcResult: source.abc_result || source.abcResult || 'LIMITED — no reliable common-opponent sample',
      source: config.system || 'NOMAD SYSTEM',
      status: previous?.status || 'WAITING_FOR_RESULT',
      resultSource: previous?.resultSource || null,
      resultConfirmed: Boolean(previous?.resultConfirmed),
      outcome: previous?.outcome || 'pending',
      homeScore: previous?.homeScore ?? null,
      awayScore: previous?.awayScore ?? null,
      autoAnalysis: source.auto_analysis || null,
      lockedAt: config.locked_at_utc
    };
  }

  async function fetchConfig() {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Selected set HTTP ${response.status}`);
    return response.json();
  }

  function updatePageMeta(config) {
    const system = config.system || 'NOMAD SYSTEM';
    const eyebrow = document.querySelector('.home-page .hero .eyebrow');
    if (eyebrow) eyebrow.textContent = system;
    const intro = document.querySelector('.home-page .hero p:not(.analysis-disclaimer)');
    if (intro) {
      const count = Array.isArray(config.matches) ? config.matches.length : 0;
      intro.textContent = `Automatic sports analysis for ${config.selection_date || 'the current selection window'}. ${count} qualifying match prediction${count === 1 ? '' : 's'} are connected to live results and separate market statistics.`;
    }
  }

  async function syncSelectedSet() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const config = await fetchConfig();
      if (!Array.isArray(config.matches) || !config.matches.length) return;
      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      const existing = new Map((state.publishedPicks || []).map(record => [String(record.fixtureId), record]));
      const remoteDatasetId = `remote:${config.selection_date}:${config.locked_at_utc}`;
      const records = config.matches.map(source => toRecord(source, config, existing.get(String(source.client_fixture_id || source.fixture_id || source.slug))));
      const changed = state.remoteDatasetId !== remoteDatasetId || !same(state.publishedPicks, records);
      updatePageMeta(config);
      if (!changed) return;

      const now = new Date().toISOString();
      state.datasetId = remoteDatasetId;
      state.remoteDatasetId = remoteDatasetId;
      state.mode = config.environment === 'TEST_ONLY' ? 'AUTO_TEST' : 'REMOTE';
      state.ruleVersions = [{
        id: remoteDatasetId,
        name: config.system || 'NOMAD SYSTEM',
        createdAt: config.locked_at_utc || now,
        minimumOdds: Number(config.rules?.odds_min || 0),
        minimumConfidence: Number(config.rules?.confidence_fixed || 58),
        fixedConfidence: Number(config.rules?.confidence_fixed || 58),
        unlimitedSelections: Boolean(config.rules?.unlimited_qualifying_matches)
      }];
      state.publishedPicks = records;
      state.oddsPolicy = config.oddsPolicy || null;
      state.auditLog = Array.isArray(state.auditLog) ? state.auditLog.slice(-99) : [];
      state.auditLog.push({
        id: `remote-sync-${Date.now()}`,
        createdAt: now,
        actor: 'github-test-auto-selector',
        action: 'REMOTE_SET_SYNCED',
        entity: config.selection_date,
        details: {count: records.length, system: config.system, productionWrite: false}
      });
      state.updatedAt = now;
      state.oddsSyncedAt = now;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-results-updated'));
    } catch (error) {
      console.debug('Automatic selected-set sync pending', error);
      window.setTimeout(syncSelectedSet, RETRY_MS);
    } finally {
      busy = false;
    }
  }

  window.setTimeout(syncSelectedSet, 300);
  window.setInterval(syncSelectedSet, POLL_MS);
  window.addEventListener('storage', syncSelectedSet);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncSelectedSet();
  });
})();
