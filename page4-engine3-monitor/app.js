(() => {
  'use strict';

  const body = document.body;
  const STATE_URL = String(body.dataset.stateUrl || '').trim();
  const REFRESH_MS = Math.max(5000, Number(body.dataset.refreshMs) || 10000);
  const FRESH_MS = 120000;
  const STALE_MS = 15 * 60 * 1000;
  let lastGoodAt = null;
  let lastGoodState = null;

  const $ = id => document.getElementById(id);
  const text = (id, value) => {
    const node = $(id);
    if (node) node.textContent = value == null || value === '' ? '—' : String(value);
  };
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function getPath(source, path) {
    return String(path).split('.').reduce((value, key) => value == null ? undefined : value[key], source);
  }

  function any(source, paths, fallback = undefined) {
    for (const path of paths) {
      const value = getPath(source, path);
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function parseTime(value) {
    const ms = Date.parse(value || '');
    return Number.isFinite(ms) ? ms : null;
  }

  function formatClock(value) {
    const ms = typeof value === 'number' ? value : parseTime(value);
    if (!Number.isFinite(ms)) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ms));
  }

  function formatDateTime(value) {
    const ms = typeof value === 'number' ? value : parseTime(value);
    if (!Number.isFinite(ms)) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ms));
  }

  function ageLabel(value) {
    const ms = typeof value === 'number' ? value : parseTime(value);
    if (!Number.isFinite(ms)) return 'unknown age';
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  }

  function normalizeFixture(item = {}) {
    const fixture = item.fixture || {};
    const teams = item.teams || {};
    const goals = item.goals || item.score || {};
    const homeObj = teams.home || item.home || {};
    const awayObj = teams.away || item.away || {};
    return {
      id: first(item.fixture_id, item.fixtureId, fixture.id, item.id),
      league: first(item.league_name, item.league?.name, item.league, item.country, 'Live Football'),
      home: typeof homeObj === 'string' ? homeObj : first(item.home_name, item.homeName, homeObj.name, 'Home'),
      away: typeof awayObj === 'string' ? awayObj : first(item.away_name, item.awayName, awayObj.name, 'Away'),
      minute: number(first(item.minute, item.elapsed, fixture.status?.elapsed, item.status?.elapsed)),
      status: first(item.status_short, fixture.status?.short, typeof item.status === 'string' ? item.status : null, 'LIVE'),
      homeScore: first(item.home_score, item.homeScore, goals.home, item.score?.home, '—'),
      awayScore: first(item.away_score, item.awayScore, goals.away, item.score?.away, '—')
    };
  }

  function normalizeCandidate(item = {}) {
    const fixture = normalizeFixture(item);
    const selectedSide = first(item.selected_side, item.selectedSide, item.side, item.selection_side);
    const selectedTeam = first(item.team_name, item.teamName, item.selection, item.selected_team,
      selectedSide === 'HOME' ? fixture.home : selectedSide === 'AWAY' ? fixture.away : null);
    const decision = String(first(item.decision, item.signal, item.result, item.condition_status, item.status, '')).toUpperCase();
    const matched = item.pass === true || item.matched === true || item.qualified === true || item.signal === true ||
      ['PASS', 'PICK', 'MATCHED', 'QUALIFIED', 'SIGNAL', 'READY', 'WOULD_EXECUTE'].includes(decision);
    return {
      ...fixture,
      market: first(item.market, item.market_name, item.bet_name, item.bet, '—'),
      selection: first(selectedTeam, selectedSide, '—'),
      odds: first(item.odd, item.odds, item.price, item.target_odds, '—'),
      confidence: first(item.confidence, item.momentum, item.momentum_score, item.score_percent, '—'),
      decision: decision || (matched ? 'MATCHED' : 'CANDIDATE'),
      matched
    };
  }

  function stateTimestamp(state, payload) {
    return first(state?.generatedAt, state?.generated_at, payload?.generated_at, state?.ingestedAt, state?.ingested_at);
  }

  function stateHealth(timestamp) {
    const ms = parseTime(timestamp);
    if (!Number.isFinite(ms)) return { level: 'offline', label: 'UNAVAILABLE', age: Infinity };
    const age = Date.now() - ms;
    if (age <= FRESH_MS) return { level: 'online', label: 'ONLINE', age };
    if (age <= STALE_MS) return { level: 'stale', label: 'STALE', age };
    return { level: 'offline', label: 'OFFLINE', age };
  }

  function setDot(id, level) {
    const node = $(id);
    if (!node) return;
    node.classList.remove('online', 'stale', 'offline');
    node.classList.add(level);
  }

  function setValueClass(id, level) {
    const node = $(id);
    if (!node) return;
    node.classList.remove('good', 'warn', 'bad');
    node.classList.add(level === 'online' ? 'good' : level === 'stale' ? 'warn' : 'bad');
  }

  function formatConfidence(value) {
    if (value === '—' || value == null) return '—';
    const raw = String(value).replace('%', '');
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? `${Math.round(parsed)}%` : String(value);
  }

  function formatOdds(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value ?? '—');
  }

  function matchCard(candidate, compact = false) {
    const minute = candidate.minute == null ? '—' : `${candidate.minute}'`;
    const score = `${candidate.homeScore ?? '—'}–${candidate.awayScore ?? '—'}`;
    if (compact) {
      return `<article class="match-card">
        <div><div class="match-name">${escapeHtml(candidate.home)} <span class="match-status">vs</span> ${escapeHtml(candidate.away)}</div><div class="match-meta">${escapeHtml(candidate.league)}</div></div>
        <div class="match-value"><small>MIN</small><b>${escapeHtml(minute)}</b></div>
        <div class="match-value"><small>SCORE</small><b>${escapeHtml(score)}</b></div>
        <div class="match-value"><small>STATUS</small><b class="match-status">${escapeHtml(candidate.status || 'LIVE')}</b></div>
      </article>`;
    }
    return `<article class="match-card">
      <div><div class="match-name">${escapeHtml(candidate.home)} <span class="match-status">vs</span> ${escapeHtml(candidate.away)}</div><div class="match-meta">${escapeHtml(candidate.league)} · ${escapeHtml(minute)} · ${escapeHtml(score)}</div></div>
      <div class="match-value"><small>SELECTION</small><b>${escapeHtml(candidate.selection)}</b></div>
      <div class="match-value"><small>ODDS</small><b>${escapeHtml(formatOdds(candidate.odds))}</b></div>
      <div class="match-value"><small>CONFIDENCE</small><b class="${candidate.matched ? 'good' : ''}">${escapeHtml(formatConfidence(candidate.confidence))}</b></div>
    </article>`;
  }

  function renderRules(payload) {
    const rules = first(payload?.rules, payload?.condition, payload?.config, payload?.engine?.rules, null);
    const node = $('ruleRows');
    if (!node) return;
    if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
      node.innerHTML = '<div class="status-row"><span>Rule details</span><b>NOT PUBLISHED IN PUBLIC FEED</b></div>';
      return;
    }
    const blocked = /secret|token|key|password|authorization|credential/i;
    const entries = Object.entries(rules).filter(([key, value]) => !blocked.test(key) && ['string','number','boolean'].includes(typeof value));
    node.innerHTML = entries.length ? entries.slice(0, 18).map(([key, value]) =>
      `<div class="status-row"><span>${escapeHtml(key.replaceAll('_', ' '))}</span><b>${escapeHtml(value)}</b></div>`
    ).join('') : '<div class="status-row"><span>Rule details</span><b>NOT PUBLISHED IN PUBLIC FEED</b></div>';
  }

  function renderState(state) {
    const payload = state?.payload || {};
    const fixturesRaw = Array.isArray(payload.fixtures) ? payload.fixtures : [];
    const candidatesRaw = Array.isArray(payload.preliminary_candidates) ? payload.preliminary_candidates : [];
    const fixtures = fixturesRaw.map(normalizeFixture);
    const candidates = candidatesRaw.map(normalizeCandidate);
    const matched = candidates.filter(item => item.matched);
    const timestamp = stateTimestamp(state, payload);
    const health = stateHealth(timestamp);
    const minuteWindowCount = fixtures.filter(item => item.minute != null && item.minute >= 50 && item.minute <= 95).length;

    lastGoodAt = timestamp || lastGoodAt;
    lastGoodState = state;

    text('liveFixtures', first(state.liveCount, payload.live_count, fixtures.length, 0));
    text('minuteWindow', minuteWindowCount);
    text('baseCandidates', first(state.candidateCount, payload.preliminary_candidate_count, candidates.length, 0));
    text('matchedSignals', matched.length);
    text('runtimeEngine', health.label);
    text('runtimeScan', health.level === 'online' ? 'LIVE STATE' : health.level === 'stale' ? 'LAST GOOD DATA' : 'NO FRESH DATA');
    text('runtimeUpdate', formatClock(timestamp));
    text('headerStatus', health.label);
    text('engineStatus', health.label);
    text('sysSharedState', health.level === 'online' ? 'CONNECTED' : health.level === 'stale' ? 'STALE' : 'NO FRESH STATE');
    text('sysEngineData', health.label);
    text('sysLastGood', timestamp ? `${formatDateTime(timestamp)} · ${ageLabel(timestamp)}` : '—');
    text('sysRefresh', `${Math.round(REFRESH_MS / 1000)} sec`);
    setDot('headerDot', health.level);
    setDot('engineDot', health.level);
    setValueClass('runtimeEngine', health.level);
    setValueClass('runtimeScan', health.level);
    setValueClass('sysSharedState', health.level);
    setValueClass('sysEngineData', health.level);

    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale', 'offline');
      freshness.classList.add(health.level === 'online' ? 'fresh' : health.level);
      freshness.textContent = timestamp ? `${health.label} · ${ageLabel(timestamp)}` : 'State timestamp unavailable';
    }

    const signalHero = $('signalHero');
    if (matched.length) {
      const lead = matched[0];
      signalHero?.classList.add('matched');
      signalHero?.classList.remove('empty-state');
      text('signalHeadline', `${lead.home} ${lead.homeScore}–${lead.awayScore} ${lead.away}`);
      const parts = [lead.minute == null ? null : `${lead.minute}'`, lead.market !== '—' ? lead.market : null,
        lead.selection !== '—' ? lead.selection : null, lead.odds !== '—' ? `Odds ${formatOdds(lead.odds)}` : null,
        lead.confidence !== '—' ? `Confidence ${formatConfidence(lead.confidence)}` : null].filter(Boolean);
      text('signalSubline', parts.join(' · ') || 'A matched candidate is present in the public state.');
    } else {
      signalHero?.classList.remove('matched');
      signalHero?.classList.add('empty-state');
      text('signalHeadline', health.level === 'offline' ? 'No fresh Engine 3 state is currently available.' : 'No match currently passes every publicly identifiable active rule.');
      text('signalSubline', candidates.length ? `${candidates.length} preliminary candidate${candidates.length === 1 ? '' : 's'} currently under observation.` : 'Engine 3 has not published a current candidate in this snapshot.');
    }

    const candidateList = $('candidateList');
    if (candidateList) candidateList.innerHTML = candidates.length
      ? candidates.slice(0, 20).map(item => matchCard(item, false)).join('')
      : '<div class="list-empty">No current preliminary candidates in the shared state.</div>';
    text('candidateNote', `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);

    const fixtureList = $('fixtureList');
    if (fixtureList) fixtureList.innerHTML = fixtures.length
      ? fixtures.slice(0, 30).map(item => matchCard(item, true)).join('')
      : '<div class="list-empty">No live fixtures currently published in the shared state.</div>';
    text('fixtureNote', `${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}`);

    renderRules(payload);
  }

  function renderUnavailable(message) {
    text('headerStatus', 'UNAVAILABLE');
    text('engineStatus', 'UNAVAILABLE');
    text('runtimeEngine', 'UNAVAILABLE');
    text('runtimeScan', lastGoodState ? 'LAST GOOD DATA' : 'WAITING');
    text('sysSharedState', 'UNAVAILABLE');
    text('sysEngineData', lastGoodState ? 'LAST GOOD DATA' : 'UNAVAILABLE');
    setDot('headerDot', 'offline');
    setDot('engineDot', 'offline');
    setValueClass('runtimeEngine', 'offline');
    setValueClass('runtimeScan', lastGoodState ? 'stale' : 'offline');
    setValueClass('sysSharedState', 'offline');
    setValueClass('sysEngineData', lastGoodState ? 'stale' : 'offline');
    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale');
      freshness.classList.add('offline');
      freshness.textContent = message || 'Shared state unavailable';
    }
    if (!lastGoodState) {
      text('liveFixtures', '—');
      text('minuteWindow', '—');
      text('baseCandidates', '—');
      text('matchedSignals', '—');
      text('signalHeadline', 'Engine 3 shared state is unavailable.');
      text('signalSubline', 'The monitor will retry automatically. No ONLINE status is fabricated.');
    }
  }

  async function refresh() {
    if (!STATE_URL) {
      renderUnavailable('Shared-state endpoint is not configured');
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(8000, REFRESH_MS - 500));
    try {
      const url = new URL(STATE_URL);
      url.searchParams.set('_monitor', String(Date.now()));
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${response.status}`);
      if (!data?.state) throw new Error('NO_SHARED_STATE');
      renderState(data.state);
    } catch (error) {
      renderUnavailable(error?.name === 'AbortError' ? 'Shared-state request timed out' : (error?.message || 'Shared state unavailable'));
    } finally {
      clearTimeout(timeout);
    }
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
      const target = button.dataset.tab;
      document.querySelectorAll('.tab').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(panel => {
        const active = panel.id === `panel-${target}`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    }));
  }

  function tickClock() {
    text('pageClock', `Bangkok ${formatClock(Date.now())}`);
  }

  setupTabs();
  tickClock();
  setInterval(tickClock, 1000);
  refresh();
  setInterval(refresh, REFRESH_MS);
})();
