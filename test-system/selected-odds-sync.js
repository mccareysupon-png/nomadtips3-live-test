(() => {
  'use strict';

  const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const SOURCE_URL = new URL('../selected-live-matches.json', document.currentScript.src).href;
  const RESULT_FEED_URL = new URL('../result-feed.json', document.currentScript.src).href;
  const POLL_MS = 60 * 1000;
  const RETRY_MS = 5 * 1000;
  let busy = false;

  const finite = value => value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) > 0;
  const scoreNumber = value => value !== null && value !== '' && Number.isFinite(Number(value));
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const parsedTime = value => {
    const timestamp = Date.parse(value || '');
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  function confidenceFor(source, config) {
    const analysis = source?.auto_analysis || source?.autoAnalysis || {};
    const strength = Number(analysis.absoluteStrength ?? Math.abs(Number(analysis.strengthScore)));
    const minimum = Number(config?.rules?.confidence_minimum ?? config?.rules?.confidence_fixed ?? 58);
    const maximum = Number(config?.rules?.confidence_maximum ?? config?.confidencePolicy?.maximum ?? 85);
    const scale = Number(config?.confidencePolicy?.scale ?? 15);
    if (Number.isFinite(strength)) {
      return Math.max(minimum, Math.min(maximum, Math.round(50 + (strength * scale))));
    }
    const direct = Number(source?.confidence);
    return Number.isFinite(direct) && direct > 0 ? direct : minimum;
  }

  function normalizeMarket(value, fallbackPick = 'N/A', confidence = 0, forceConfidence = false, previous = {}) {
    const market = value && typeof value === 'object' ? value : {};
    const prior = previous && typeof previous === 'object' ? previous : {};
    const marketConfidence = Number(market.confidence);
    const previousConfidence = Number(prior.confidence);
    const odds = finite(market.odds) ? Number(market.odds) : (finite(prior.odds) ? Number(prior.odds) : null);
    return {
      ...prior,
      ...market,
      pick: market.pick || prior.pick || fallbackPick,
      odds,
      oddsStatus: market.oddsStatus || prior.oddsStatus || (finite(odds) ? 'LOCKED' : 'N/A'),
      confidence: forceConfidence
        ? confidence
        : (Number.isFinite(marketConfidence) && marketConfidence > 0
            ? marketConfidence
            : (Number.isFinite(previousConfidence) && previousConfidence > 0 ? previousConfidence : confidence)),
      outcome: market.outcome || prior.outcome || 'pending',
      settlement: market.settlement ?? prior.settlement ?? null
    };
  }

  function totalGoalsIndex(source) {
    const analysis = source?.auto_analysis || source?.autoAnalysis || {};
    const summaries = [analysis.homeOverall, analysis.awayOverall, analysis.homeVenue, analysis.awayVenue];
    const totals = summaries.map(summary => {
      const gf = Number(summary?.gfpg);
      const ga = Number(summary?.gapg);
      return Number.isFinite(gf) && Number.isFinite(ga) ? gf + ga : null;
    }).filter(Number.isFinite);
    if (!totals.length) return null;
    return totals.reduce((sum, value) => sum + value, 0) / totals.length;
  }

  function derivedOverUnder(source, confidence) {
    const index = totalGoalsIndex(source);
    if (!Number.isFinite(index)) return {pick: 'N/A', odds: null, confidence, oddsStatus: 'N/A', outcome: 'pending', line: 2.5};
    const side = index >= 2.5 ? 'over' : 'under';
    return {
      pick: `${side === 'over' ? 'Over' : 'Under'} 2.5`,
      odds: null,
      confidence,
      oddsStatus: 'PENDING',
      oddsSource: 'NOT FOUND',
      outcome: 'pending',
      line: 2.5,
      side,
      model: 'INDEPENDENT_TOTAL_GOALS_INDEX_V1',
      totalGoalsIndex: Number(index.toFixed(4))
    };
  }

  function resolveOverUnder(market, previous) {
    if (!previous?.resultConfirmed || !scoreNumber(previous.homeScore) || !scoreNumber(previous.awayScore)) return market;
    const pick = String(market?.side || market?.pick || '').trim().toLowerCase();
    const side = pick.startsWith('over') ? 'over' : pick.startsWith('under') ? 'under' : null;
    if (!side) return market;
    const lineValue = Number(market?.line);
    const line = Number.isFinite(lineValue) ? lineValue : 2.5;
    const total = Number(previous.homeScore) + Number(previous.awayScore);
    const outcome = total === line ? 'void' : ((total > line ? 'over' : 'under') === side ? 'correct' : 'incorrect');
    return {...market, outcome, settlement: outcome};
  }

  function fixtureKey(source) {
    return String(source?.client_fixture_id || source?.fixture_id || source?.slug || '');
  }

  function providerKey(source) {
    return String(source?.fixture_id || source?.providerFixtureId || '');
  }

  function providerMap(feed) {
    const map = new Map();
    (feed?.results || []).forEach(item => {
      const providerId = String(item?.providerFixtureId || '');
      const fixtureId = String(item?.fixtureId || '');
      if (providerId) map.set(providerId, item);
      if (fixtureId) map.set(fixtureId, item);
    });
    return map;
  }

  function sourceWithProviderSchedule(source, previous, provider) {
    const providerKickoff = provider?.kickoffUtc || null;
    const preservedKickoff = previous?.kickoffUtc || null;
    return {
      ...source,
      kickoff_utc: providerKickoff || preservedKickoff || source.kickoff_utc,
      provider_schedule_status: provider?.status || provider?.providerStatus || null,
      provider_schedule_updated_at: provider?.updatedAt || null,
      provider_schedule_source: providerKickoff ? 'RESULT_FEED' : (preservedKickoff ? 'PRESERVED_RESULT_STATE' : 'SELECTION_SOURCE')
    };
  }

  function outsideSelectionWindow(source, config) {
    const kickoff = parsedTime(source?.kickoff_utc);
    const windowEnd = parsedTime(config?.window_end_local);
    return kickoff !== null && windowEnd !== null && kickoff > windowEnd;
  }

  function toRecord(source, config, previous) {
    const side = String(source.pick_side || 'home').toUpperCase();
    const markets = source.markets || {};
    const previousMarkets = previous?.markets || {};
    const confidence = confidenceFor(source, config);
    const autoCalculated = Boolean(source.auto_analysis || source.autoAnalysis);
    const overUnderSource = markets.overUnder || markets.over_under || markets.ou || derivedOverUnder(source, confidence);
    const overUnder = resolveOverUnder(
      normalizeMarket(overUnderSource, 'N/A', confidence, autoCalculated, previousMarkets.overUnder),
      previous
    );
    return {
      ...(previous || {}),
      fixtureId: fixtureKey(source),
      providerFixtureId: source.fixture_id ? String(source.fixture_id) : (previous?.providerFixtureId || null),
      pickDate: config.selection_date,
      league: source.league || 'Unknown competition',
      home: source.home,
      away: source.away,
      kickoffUtc: source.kickoff_utc || previous?.kickoffUtc || null,
      kickoffAuthority: source.provider_schedule_source || previous?.kickoffAuthority || 'SELECTION_SOURCE',
      providerScheduleStatus: source.provider_schedule_status || previous?.providerScheduleStatus || null,
      providerScheduleUpdatedAt: source.provider_schedule_updated_at || previous?.providerScheduleUpdatedAt || null,
      pick: side,
      pickLabel: source.pick || `${side} WIN`,
      odds: finite(source.odds) ? Number(source.odds) : (finite(previous?.odds) ? Number(previous.odds) : null),
      bookmaker: source.bookmaker || previous?.bookmaker || 'N/A',
      oddsStatus: source.oddsStatus || previous?.oddsStatus || (finite(source.odds) || finite(previous?.odds) ? 'LOCKED' : 'N/A'),
      oddsSource: source.oddsSource || previous?.oddsSource || null,
      oddsLockedAt: source.oddsLockedAt || previous?.oddsLockedAt || config.locked_at_utc,
      confidence,
      predictedScore: source.predicted_score || previous?.predictedScore || '—',
      markets: {
        btts: normalizeMarket(markets.btts, 'N/A', confidence, autoCalculated, previousMarkets.btts),
        overUnder,
        doubleChance: normalizeMarket(markets.doubleChance, 'N/A', confidence, autoCalculated, previousMarkets.doubleChance),
        asianHandicap: normalizeMarket(markets.asianHandicap, 'N/A', confidence, autoCalculated, previousMarkets.asianHandicap)
      },
      reason: source.reason || previous?.reason || 'Automatic NOMAD SYSTEM analysis.',
      abcResult: source.abc_result || source.abcResult || previous?.abcResult || 'LIMITED — no reliable common-opponent sample',
      source: config.system || 'NOMAD SYSTEM',
      status: previous?.status || 'WAITING_FOR_RESULT',
      resultSource: previous?.resultSource || null,
      resultConfirmed: Boolean(previous?.resultConfirmed),
      outcome: previous?.outcome || 'pending',
      homeScore: previous?.homeScore ?? null,
      awayScore: previous?.awayScore ?? null,
      autoAnalysis: source.auto_analysis || source.autoAnalysis || previous?.autoAnalysis || null,
      selectionOrigin: source.selection_origin || previous?.selectionOrigin || 'CURRENT_ADD_K_RUN',
      lockedByRerunPolicy: Boolean(source.locked_by_rerun_policy || previous?.lockedByRerunPolicy),
      lockedAt: config.locked_at_utc
    };
  }

  async function fetchConfig() {
    const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {cache: 'no-store'});
    if (!response.ok) throw new Error(`Selected set HTTP ${response.status}`);
    return response.json();
  }

  async function fetchProviderFeed() {
    try {
      const response = await fetch(`${RESULT_FEED_URL}?t=${Date.now()}`, {cache: 'no-store'});
      if (!response.ok) throw new Error(`Result feed HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      console.debug('Provider schedule lookup pending', error);
      return null;
    }
  }

  function updatePageMeta(config, count, excludedCount) {
    const system = config.system || 'NOMAD SYSTEM';
    const eyebrow = document.querySelector('.home-page .hero .eyebrow');
    if (eyebrow) eyebrow.textContent = system;
    const intro = document.querySelector('.home-page .hero p:not(.analysis-disclaimer)');
    if (intro) {
      const rawNewCount = Number(config?.addKRunMerge?.newSelectionCount ?? config?.runSelectionCount ?? count);
      const newCount = Math.max(0, Math.min(count, rawNewCount));
      const minimum = Number(config.rules?.confidence_minimum ?? config.rules?.confidence_fixed ?? 58);
      const windowNote = excludedCount
        ? ` ${excludedCount} rescheduled fixture${excludedCount === 1 ? '' : 's'} moved outside the selection window and ${excludedCount === 1 ? 'was' : 'were'} excluded.`
        : '';
      intro.textContent = config.noPick
        ? `Add K completed with NO PICK for this run. ${Math.max(0, count - newCount)} already-started prediction${count - newCount === 1 ? '' : 's'} may remain locked for result tracking.${windowNote}`
        : `Automatic sports analysis for ${config.selection_date || 'the current selection window'}. ${newCount} new qualifying match prediction${newCount === 1 ? '' : 's'} with NOMAD Confidence ${minimum}% or higher; already-started matches remain locked and future picks are replaceable on rerun.${windowNote}`;
    }
  }

  async function syncSelectedSet() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const [config, providerFeed] = await Promise.all([fetchConfig(), fetchProviderFeed()]);
      if (!Array.isArray(config.matches)) return;

      const raw = localStorage.getItem(STORAGE_KEY);
      const state = raw ? JSON.parse(raw) : {};
      const existing = new Map((state.publishedPicks || []).map(record => [String(record.fixtureId), record]));
      const providers = providerMap(providerFeed);
      const excluded = [];

      const eligibleSources = config.matches.flatMap(source => {
        const key = fixtureKey(source);
        const previous = existing.get(key);
        const provider = providers.get(providerKey(source)) || providers.get(key) || null;
        const resolved = sourceWithProviderSchedule(source, previous, provider);
        if (outsideSelectionWindow(resolved, config)) {
          excluded.push({
            fixtureId: key,
            providerFixtureId: providerKey(source) || previous?.providerFixtureId || null,
            home: source.home || previous?.home || null,
            away: source.away || previous?.away || null,
            kickoffUtc: resolved.kickoff_utc || null,
            windowEndLocal: config.window_end_local || null,
            authority: resolved.provider_schedule_source
          });
          return [];
        }
        return [resolved];
      });

      const remoteDatasetId = `remote:${config.selection_date}:${config.locked_at_utc}:${config.controlVersion || 0}`;
      const records = eligibleSources.map(source => toRecord(source, config, existing.get(fixtureKey(source))));
      const excludedIds = excluded.map(item => item.fixtureId);
      const changed = state.remoteDatasetId !== remoteDatasetId
        || !same(state.publishedPicks, records)
        || !same(state.windowExcludedFixtureIds, excludedIds)
        || Boolean(state.noPick) !== Boolean(config.noPick);

      updatePageMeta(config, records.length, excluded.length);
      if (!changed) return;

      const now = new Date().toISOString();
      const minimumConfidence = Number(config.rules?.confidence_minimum ?? config.rules?.confidence_fixed ?? 58);
      const maximumConfidence = Number(config.rules?.confidence_maximum ?? config.confidencePolicy?.maximum ?? 85);
      state.datasetId = remoteDatasetId;
      state.remoteDatasetId = remoteDatasetId;
      state.mode = config.environment === 'TEST_ONLY' ? 'AUTO_TEST' : 'REMOTE';
      state.ruleVersions = [{
        id: remoteDatasetId,
        name: config.system || 'NOMAD SYSTEM',
        createdAt: config.locked_at_utc || now,
        minimumOdds: Number(config.rules?.odds_min || 0),
        minimumConfidence,
        maximumConfidence,
        confidenceMode: config.rules?.confidence_dynamic || config.confidencePolicy ? 'DYNAMIC_MINIMUM' : 'LEGACY',
        unlimitedSelections: Boolean(config.rules?.unlimited_qualifying_matches)
      }];
      state.publishedPicks = records;
      state.selectionWindowEndLocal = config.window_end_local || null;
      state.windowExcludedFixtureIds = excludedIds;
      state.windowExcludedFixtures = excluded;
      state.providerScheduleFeedGeneratedAt = providerFeed?.generatedAt || null;
      state.providerScheduleFeedSource = providerFeed?.source || null;
      state.noPick = Boolean(config.noPick);
      state.noPickReason = config.noPickReason || null;
      state.addKTheKingOfSoccer = config.addKTheKingOfSoccer || null;
      state.addKRunMerge = config.addKRunMerge || null;
      state.controlVersion = Number(config.controlVersion || 0);
      state.runStatus = config.runStatus || null;
      state.runOutcome = config.runOutcome || null;
      state.runSelectionCount = Number(config.runSelectionCount ?? records.length);
      state.effectiveSelectionCount = records.length;
      state.oddsPolicy = config.oddsPolicy || null;
      state.confidencePolicy = config.confidencePolicy || {
        type: 'DYNAMIC_MINIMUM',
        minimum: minimumConfidence,
        maximum: maximumConfidence,
        scale: 15
      };
      state.auditLog = Array.isArray(state.auditLog) ? state.auditLog.slice(-99) : [];
      state.auditLog.push({
        id: `remote-sync-${Date.now()}`,
        createdAt: now,
        actor: 'github-test-auto-selector',
        action: config.noPick ? 'REMOTE_NO_PICK_SYNCED' : 'REMOTE_SET_SYNCED',
        entity: config.selection_date,
        details: {
          count: records.length,
          newSelectionCount: Number(config?.addKRunMerge?.newSelectionCount ?? config?.runSelectionCount ?? records.length),
          preservedStartedCount: Number(config?.addKRunMerge?.preservedStartedCount ?? 0),
          windowExcludedCount: excluded.length,
          windowExcludedFixtureIds: excludedIds,
          providerScheduleAuthority: 'RESULT_FEED_THEN_PRESERVED_RESULT_STATE_THEN_SELECTION_SOURCE',
          system: config.system,
          productionWrite: false,
          minimumConfidence,
          independentOverUnder: true,
          noPick: Boolean(config.noPick)
        }
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
