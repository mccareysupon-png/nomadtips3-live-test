(() => {
  'use strict';

  const body = document.body;
  const STATE_URL = String(body.dataset.stateUrl || '').trim();
  const ANALYTICS_URL = String(body.dataset.analyticsUrl || '').trim();
  const REFRESH_MS = Math.max(5000, Number(body.dataset.refreshMs) || 10000);
  const ANALYTICS_REFRESH_MS = 60000;
  const FRESH_MS = 120000;
  const STALE_MS = 15 * 60 * 1000;
  let lastGoodState = null;

  const $ = id => document.getElementById(id);
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  const number = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const text = (id, value) => {
    const node = $(id);
    if (node) node.textContent = value == null || value === '' ? '—' : String(value);
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  function parseTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1e11) return numeric;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : null;
  }

  function formatClock(value) {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date(ms));
  }

  function formatDateTime(value) {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(ms));
  }

  function ageLabel(value) {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) return 'unknown age';
    const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    return `${hours}h ago`;
  }

  function formatOdds(value) {
    const parsed = number(value);
    return parsed === null ? '—' : parsed.toFixed(2);
  }

  function formatPercent(value) {
    const parsed = number(value);
    return parsed === null ? '—' : `${parsed.toFixed(parsed % 1 ? 1 : 0)}%`;
  }

  function formatUnits(value) {
    const parsed = number(value);
    if (parsed === null) return '—';
    return `${parsed > 0 ? '+' : ''}${parsed.toFixed(2)}u`;
  }

  function normalizeFixture(item = {}) {
    const fixture = item.fixture || {};
    const teams = item.teams || {};
    const goals = item.goals || item.score || {};
    const homeObj = teams.home || item.home || {};
    const awayObj = teams.away || item.away || {};
    return {
      id: first(item.fixture_id, item.fixtureId, fixture.id, item.id),
      league: first(item.league_name, item.league?.name, typeof item.league === 'string' ? item.league : null, item.country, 'Live Football'),
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
    const side = first(item.selected_side, item.selectedSide, item.side, item.selection_side);
    return {
      ...fixture,
      market: first(item.market, item.market_name, item.bet_name, item.bet, '—'),
      selection: first(item.selected_team, item.team_name, item.teamName, item.selection,
        side === 'HOME' ? fixture.home : side === 'AWAY' ? fixture.away : side, '—'),
      odds: first(item.target_odds, item.odds, item.odd, item.price, '—'),
      confidence: first(item.confidence, item.momentum, item.momentum_score, '—'),
      matched: false,
    };
  }

  function normalizeSignal(item = {}) {
    const outcome = String(first(item.outcome, item.result, item.status, 'PENDING')).toUpperCase();
    return {
      id: first(item.signalId, item.signal_id, `${item.fixtureId || item.fixture_id || 'signal'}:${item.createdAt || item.created_at || ''}`),
      fixtureId: first(item.fixtureId, item.fixture_id),
      home: first(item.home, item.home_name),
      away: first(item.away, item.away_name),
      selectedTeam: first(item.selectedTeam, item.selected_team, item.selection, item.selectedSide, item.selected_side, '—'),
      opponent: first(item.opponent, '—'),
      market: first(item.market, '—'),
      minute: number(first(item.entryMinute, item.entry_minute, item.minute)),
      score: first(item.entryScore, item.entry_score, item.score, '—'),
      odds: first(item.targetOdds, item.target_odds, item.odds, item.odd),
      confidence: first(item.confidence, item.momentum),
      outcome: ['WIN','LOSS','PUSH','VOID','PENDING'].includes(outcome) ? outcome : 'PENDING',
      finalScore: first(item.finalScore, item.final_score, '—'),
      profitUnits: number(first(item.profitUnits, item.profit_units, 0)) || 0,
      createdAt: first(item.createdAt, item.created_at),
      settledAt: first(item.settledAt, item.settled_at),
    };
  }

  function healthFor(timestamp, runtime = {}) {
    const ms = parseTime(timestamp);
    if (!Number.isFinite(ms)) return { level: 'offline', label: 'UNAVAILABLE' };
    const age = Date.now() - ms;
    if (runtime?.ok === false && age <= STALE_MS) return { level: 'stale', label: 'DEGRADED' };
    if (age <= FRESH_MS) return { level: 'online', label: 'ONLINE' };
    if (age <= STALE_MS) return { level: 'stale', label: 'STALE' };
    return { level: 'offline', label: 'OFFLINE' };
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

  function currentSignal(signals) {
    const now = Date.now();
    return signals.find(signal => {
      const created = parseTime(signal.createdAt);
      return Number.isFinite(created) && now - created <= 45 * 60 * 1000;
    }) || null;
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
      <div class="match-value"><small>CONFIDENCE</small><b class="${candidate.matched ? 'good' : ''}">${escapeHtml(formatPercent(candidate.confidence))}</b></div>
    </article>`;
  }

  function prettyRule(key) {
    return String(key).replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  }

  function ruleValue(value) {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'ON' : 'OFF';
    if (value === null) return 'UNLIMITED';
    return String(value);
  }

  function renderRules(condition = {}) {
    const node = $('ruleRows');
    if (!node) return;
    const entries = Object.entries(condition).filter(([, value]) =>
      value === null || ['string','number','boolean'].includes(typeof value) || Array.isArray(value));
    node.innerHTML = entries.length
      ? entries.map(([key, value]) => `<div class="status-row"><span>${escapeHtml(prettyRule(key))}</span><b>${escapeHtml(ruleValue(value))}</b></div>`).join('')
      : '<div class="status-row"><span>Rule details</span><b>NOT PUBLISHED</b></div>';
  }

  function renderMonitor(state) {
    const payload = state?.payload || {};
    const runtime = payload.runtime || {};
    const timestamp = first(state.generatedAt, payload.generated_at, state.ingestedAt);
    const health = healthFor(timestamp, runtime);
    const fixtures = (Array.isArray(payload.fixtures) ? payload.fixtures : []).map(normalizeFixture);
    const recentSignals = (Array.isArray(payload.engine?.recent_signals) ? payload.engine.recent_signals : []).map(normalizeSignal);
    const activeSignal = currentSignal(recentSignals);
    const matchedIds = new Set(recentSignals.filter(signal => {
      const created = parseTime(signal.createdAt);
      return Number.isFinite(created) && Date.now() - created <= 45 * 60 * 1000;
    }).map(signal => String(signal.fixtureId)));
    const candidates = (Array.isArray(payload.preliminary_candidates) ? payload.preliminary_candidates : [])
      .map(normalizeCandidate)
      .map(candidate => ({ ...candidate, matched: matchedIds.has(String(candidate.id)) }));
    const condition = payload.condition || {};
    const minuteMin = number(condition.minute_min) ?? 50;
    const minuteMax = number(condition.minute_max) ?? 95;
    const minuteWindow = fixtures.filter(item => item.minute != null && item.minute >= minuteMin && item.minute <= minuteMax).length;
    const engineCounts = payload.engine?.counts || {};
    const currentMatched = first(engineCounts.new_signals, engineCounts.matched, activeSignal ? 1 : 0, 0);

    lastGoodState = state;
    text('liveFixtures', first(state.liveCount, payload.live_count, fixtures.length, 0));
    text('minuteWindow', minuteWindow);
    text('baseCandidates', first(state.candidateCount, payload.preliminary_candidate_count, candidates.length, 0));
    text('matchedSignals', currentMatched);
    text('runtimeEngine', health.label);
    text('runtimeScan', health.level === 'online' ? 'RUNNING' : health.level === 'stale' ? 'LAST GOOD DATA' : 'NO FRESH DATA');
    text('runtimeUpdate', formatClock(timestamp));
    text('headerStatus', health.label);
    text('engineStatus', health.label);
    text('sysSharedState', health.level === 'online' ? 'CONNECTED' : health.label);
    text('sysEngineData', runtime.ok === false ? 'DEGRADED' : health.label);
    text('sysLastGood', timestamp ? `${formatDateTime(timestamp)} · ${ageLabel(timestamp)}` : '—');
    text('sysRefresh', `${Math.round(REFRESH_MS / 1000)} sec`);
    text('sysSettlementPending', first(payload.settlement_telemetry?.pending, '—'));
    setDot('headerDot', health.level);
    setDot('engineDot', health.level);
    setValueClass('runtimeEngine', health.level);
    setValueClass('runtimeScan', health.level);
    setValueClass('sysSharedState', health.level);
    setValueClass('sysEngineData', runtime.ok === false ? 'stale' : health.level);

    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale', 'offline');
      freshness.classList.add(health.level === 'online' ? 'fresh' : health.level);
      freshness.textContent = timestamp ? `${health.label} · ${ageLabel(timestamp)}` : 'State timestamp unavailable';
    }

    const signalHero = $('signalHero');
    if (activeSignal) {
      signalHero?.classList.add('matched');
      signalHero?.classList.remove('empty-state');
      const teams = activeSignal.home && activeSignal.away
        ? `${activeSignal.home} vs ${activeSignal.away}`
        : `${activeSignal.selectedTeam}${activeSignal.opponent !== '—' ? ` vs ${activeSignal.opponent}` : ''}`;
      text('signalHeadline', teams || 'Engine 3 signal detected');
      text('signalSubline', [
        activeSignal.minute == null ? null : `${activeSignal.minute}'`,
        activeSignal.score !== '—' ? activeSignal.score : null,
        activeSignal.market !== '—' ? activeSignal.market : null,
        activeSignal.selectedTeam !== '—' ? activeSignal.selectedTeam : null,
        activeSignal.odds != null ? `Odds ${formatOdds(activeSignal.odds)}` : null,
      ].filter(Boolean).join(' · '));
    } else {
      signalHero?.classList.remove('matched');
      signalHero?.classList.add('empty-state');
      text('signalHeadline', health.level === 'offline'
        ? 'No fresh Engine 3 state is currently available.'
        : 'No new Engine 3 signal is active in the current window.');
      text('signalSubline', candidates.length
        ? `${candidates.length} preliminary candidate${candidates.length === 1 ? '' : 's'} currently under observation.`
        : 'No preliminary candidate is published in this snapshot.');
    }

    const candidateList = $('candidateList');
    if (candidateList) candidateList.innerHTML = candidates.length
      ? candidates.slice(0, 20).map(item => matchCard(item, false)).join('')
      : '<div class="list-empty">No current preliminary candidates.</div>';
    text('candidateNote', `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);

    const fixtureList = $('fixtureList');
    if (fixtureList) fixtureList.innerHTML = fixtures.length
      ? fixtures.slice(0, 30).map(item => matchCard(item, true)).join('')
      : '<div class="list-empty">No live fixtures currently published.</div>';
    text('fixtureNote', `${fixtures.length} fixture${fixtures.length === 1 ? '' : 's'}`);
    renderRules(condition);
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
    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale');
      freshness.classList.add('offline');
      freshness.textContent = message || 'Shared state unavailable';
    }
  }

  function historyMatch(signal) {
    if (signal.home && signal.away) return `${signal.home} vs ${signal.away}`;
    if (signal.selectedTeam && signal.opponent !== '—') return `${signal.selectedTeam} vs ${signal.opponent}`;
    return signal.selectedTeam || `Fixture ${signal.fixtureId || '—'}`;
  }

  function outcomeClass(outcome) {
    const value = String(outcome || 'PENDING').toLowerCase();
    return ['win','loss','push','void','pending'].includes(value) ? value : 'pending';
  }

  function historyRow(signal) {
    return `<article class="history-row">
      <div class="history-time">${escapeHtml(formatDateTime(signal.createdAt))}</div>
      <div class="history-match"><b>${escapeHtml(historyMatch(signal))}</b><span>${escapeHtml(signal.score || '—')} · ${signal.minute == null ? '—' : `${signal.minute}'`}</span></div>
      <div class="history-pick"><b>${escapeHtml(signal.selectedTeam || '—')}</b><span>${escapeHtml(signal.market || '—')}</span></div>
      <div class="history-odds">${escapeHtml(formatOdds(signal.odds))}</div>
      <div class="outcome ${outcomeClass(signal.outcome)}">${escapeHtml(signal.outcome || 'PENDING')}</div>
    </article>`;
  }

  function chartSvg(daily) {
    const rows = daily.filter(row => row && row.date);
    if (!rows.length) return '<div class="list-empty">No performance history recorded yet.</div>';
    const W = 960, H = 190, L = 34, R = 12, T = 12, B = 24;
    const values = rows.map(row => number(row.cumulativeUnits) || 0);
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    if (min === max) { min -= 1; max += 1; }
    const pad = Math.max(.5, (max - min) * .12);
    min -= pad; max += pad;
    const x = index => L + (rows.length === 1 ? 0 : index / (rows.length - 1)) * (W - L - R);
    const y = value => T + (max - value) / (max - min) * (H - T - B);
    const path = values.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
    const area = `${path} L${x(rows.length - 1).toFixed(1)},${(H-B).toFixed(1)} L${x(0).toFixed(1)},${(H-B).toFixed(1)} Z`;
    const zeroY = y(0).toFixed(1);
    const labelIndexes = [...new Set([0, Math.floor((rows.length - 1) / 3), Math.floor((rows.length - 1) * 2 / 3), rows.length - 1])];
    const xLabels = labelIndexes.map(index => {
      const label = String(rows[index].date).slice(5);
      return `<text class="chart-label" x="${x(index).toFixed(1)}" y="184" text-anchor="${index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}">${escapeHtml(label)}</text>`;
    }).join('');
    const yLabels = [max, (max + min) / 2, min].map(value =>
      `<text class="chart-label" x="2" y="${(y(value)+3).toFixed(1)}">${value.toFixed(1)}</text>`).join('');
    const dots = values.map((value,index) => index === values.length - 1
      ? `<circle class="chart-dot" cx="${x(index).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3"/>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Engine 3 cumulative performance over the last 30 days">
      <defs><linearGradient id="performanceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#45cc7c" stop-opacity=".22"/><stop offset="1" stop-color="#45cc7c" stop-opacity="0"/></linearGradient></defs>
      <line class="chart-zero" x1="${L}" y1="${zeroY}" x2="${W-R}" y2="${zeroY}"/>
      <path class="chart-area" d="${area}"/><path class="chart-line" d="${path}"/>${dots}${xLabels}${yLabels}
    </svg>`;
  }

  function renderAnalytics(analytics = {}) {
    const summary = analytics.summary || {};
    const daily = Array.isArray(analytics.daily) ? analytics.daily : [];
    const signals = (Array.isArray(analytics.signals) ? analytics.signals : []).map(normalizeSignal);
    const validOdds = signals.map(signal => number(signal.odds)).filter(value => value !== null && value > 0);
    const avgOdds = validOdds.length ? validOdds.reduce((sum, value) => sum + value, 0) / validOdds.length : null;

    text('histTotal', first(summary.total, signals.length, 0));
    text('histWin', first(summary.win, 0));
    text('histLoss', first(summary.loss, 0));
    text('histPending', first(summary.pending, 0));
    text('histAccuracy', formatPercent(first(summary.accuracyPercent, 0)));
    text('histAvgOdds', avgOdds === null ? '—' : avgOdds.toFixed(2));
    text('histNetUnits', `NET ${formatUnits(first(summary.netUnits, 0))}`);
    text('historyNote', `${signals.length} recent signal${signals.length === 1 ? '' : 's'}`);

    const chart = $('performanceChart');
    if (chart) chart.innerHTML = chartSvg(daily);
    const list = $('historyList');
    if (list) list.innerHTML = signals.length
      ? signals.slice(0, 25).map(historyRow).join('')
      : '<div class="list-empty">No Engine 3 signal history recorded yet.</div>';

    const freshness = $('historyFreshness');
    if (freshness) {
      const generated = analytics.generatedAt;
      freshness.classList.remove('stale','offline');
      freshness.classList.add('fresh');
      freshness.textContent = generated ? `D1 HISTORY · ${ageLabel(generated)}` : 'D1 HISTORY';
    }
  }

  async function fetchJson(url, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function refreshMonitor() {
    if (!STATE_URL) return renderUnavailable('Monitor endpoint is not configured');
    try {
      const data = await fetchJson(STATE_URL);
      if (!data.state) return renderUnavailable('No Engine 3 shared state stored yet');
      renderMonitor(data.state);
    } catch (error) {
      renderUnavailable(error?.name === 'AbortError' ? 'Monitor request timed out' : (error?.message || 'Monitor unavailable'));
    }
  }

  async function refreshAnalytics() {
    if (!ANALYTICS_URL) return;
    try {
      const data = await fetchJson(ANALYTICS_URL, 10000);
      renderAnalytics(data.analytics || {});
    } catch (error) {
      const freshness = $('historyFreshness');
      if (freshness) {
        freshness.classList.remove('fresh','stale');
        freshness.classList.add('offline');
        freshness.textContent = 'HISTORY UNAVAILABLE';
      }
    }
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
      const target = button.dataset.tab;
      document.querySelectorAll('.tab').forEach(tab => {
        const active = tab === button;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(panel => {
        const active = panel.id === `panel-${target}`;
        panel.classList.toggle('active', active);
        panel.hidden = !active;
      });
    }));
  }

  function tickClock() {
    text('pageClock', new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).format(new Date()));
  }

  setupTabs();
  tickClock();
  setInterval(tickClock, 1000);
  refreshMonitor();
  refreshAnalytics();
  setInterval(refreshMonitor, REFRESH_MS);
  setInterval(refreshAnalytics, ANALYTICS_REFRESH_MS);
})();
