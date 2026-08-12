(() => {
  'use strict';

  const body = document.body;
  const STATE_URL = String(body.dataset.stateUrl || '').trim();
  const HEALTH_URL = String(body.dataset.healthUrl || '').trim();
  const ANALYTICS_URL = String(body.dataset.analyticsUrl || '').trim();
  const REFRESH_MS = Math.max(5000, Number(body.dataset.refreshMs) || 10000);
  const ANALYTICS_REFRESH_MS = 60000;
  const DAY_MS = 86400000;
  const HISTORY_DAYS = 30;
  let lastGoodMonitor = null;
  let latestTrades = [];

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
    return `${Math.round(minutes / 60)}h ago`;
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

  function bangkokDateKey(value) {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(ms));
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
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

  function engineHealthView(health) {
    const controlMode = String(health?.control?.mode || 'RUNNING').toUpperCase();
    const state = String(health?.state || health?.liveScan?.status || '').toUpperCase();
    const workerOnline = health?.worker?.ok === true || String(health?.worker?.status || '').toUpperCase() === 'ONLINE';
    if (!health?.ok || !workerOnline) return { level: 'offline', label: 'UNAVAILABLE', scan: 'NO STATUS' };
    if (controlMode !== 'RUNNING') return { level: 'stale', label: controlMode, scan: controlMode };
    if (['DEGRADED','WAITING_API','DERATING','RECOVERING','VERIFYING','REPAIRING'].includes(state)) {
      return { level: 'stale', label: 'DEGRADED', scan: first(health?.watchdog?.currentAction, state, 'DEGRADED') };
    }
    return { level: 'online', label: 'ONLINE', scan: 'RUNNING' };
  }

  function normalizeCandidate(item = {}, config = {}) {
    const side = String(first(item.selectedSide, item.selected_side, 'HOME')).toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
    const selectedTeam = first(item.selectedTeam, item.selected_team, item.home, 'Selected');
    const opponent = first(item.opponent, item.away, 'Opponent');
    const actualHome = first(item.actualHome, side === 'AWAY' ? opponent : selectedTeam);
    const actualAway = first(item.actualAway, side === 'AWAY' ? selectedTeam : opponent);
    const selectedScore = first(item.score?.home, item.selected_score, 0);
    const opponentScore = first(item.score?.away, item.opponent_score, 0);
    const actualHomeScore = first(item.actualScore?.home, side === 'AWAY' ? opponentScore : selectedScore, '—');
    const actualAwayScore = first(item.actualScore?.away, side === 'AWAY' ? selectedScore : opponentScore, '—');
    const market = String(first(item.selectedMarket, item.market, config.market, 'AH')).toUpperCase();
    const odds = first(item.markets?.selectedOdds, item.markets?.homeAhOdds, item.ah_odds, item.odds, item.selected_odds);
    const confidence = first(item.serverMomentum?.home, item.momentum, item.last_home_percent);
    return {
      id: first(item.fixtureId, item.fixture_id),
      league: first(item.league, item.country, 'Live Football'),
      home: actualHome,
      away: actualAway,
      minute: number(first(item.minute, item.last_minute)),
      status: item.serverTriggered ? 'TRIGGERED' : 'WATCH',
      homeScore: actualHomeScore,
      awayScore: actualAwayScore,
      selection: selectedTeam,
      selectedSide: side,
      market,
      odds,
      confidence,
      matched: Boolean(first(item.serverTriggered, item.triggered, false)),
      streak: number(first(item.serverStreak, item.streak, 0)) || 0,
    };
  }

  function normalizeTrade(item = {}) {
    const result = String(item.result || '').toUpperCase();
    const status = String(item.status || '').toUpperCase();
    const settlement = String(item.settlement || '').toUpperCase();
    let outcome = 'PENDING';
    if (result === 'CORRECT') outcome = 'WIN';
    else if (result === 'INCORRECT') outcome = 'LOSS';
    else if (status === 'VOID' || settlement === 'VOID') outcome = 'VOID';
    else if (settlement === 'PUSH') outcome = 'PUSH';
    else if (status === 'SETTLED' && result === 'NEUTRAL') outcome = 'PUSH';
    const entrySelected = first(item.entryHomeScore, item.entrySelectedScore);
    const entryOpponent = first(item.entryAwayScore, item.entryOpponentScore);
    const score = entrySelected != null && entryOpponent != null ? `${entrySelected}–${entryOpponent}` : '—';
    const line = number(item.ahLine);
    return {
      id: first(item.tradeKey, item.id, `${item.fixtureId || 'trade'}:${item.createdAt || ''}`),
      fixtureId: item.fixtureId,
      selectedTeam: first(item.selectedTeam, item.home, '—'),
      opponent: first(item.opponent, item.away, '—'),
      market: line === null ? 'AH' : `AH ${line >= 0 ? '+' : ''}${line}`,
      minute: number(item.entryMinute),
      score,
      odds: first(item.ahOdds, item.selectedWinOdds, item.homeWinOdds),
      confidence: item.momentum,
      outcome,
      profitUnits: number(item.profitUnits) || 0,
      createdAt: item.createdAt,
      settledAt: item.settledAt,
    };
  }

  function matchCard(candidate, compact = false) {
    const minute = candidate.minute == null ? '—' : `${candidate.minute}'`;
    const score = `${candidate.homeScore ?? '—'}–${candidate.awayScore ?? '—'}`;
    if (compact) {
      return `<article class="match-card">
        <div><div class="match-name">${escapeHtml(candidate.home)} <span class="match-status">vs</span> ${escapeHtml(candidate.away)}</div><div class="match-meta">${escapeHtml(candidate.league)}</div></div>
        <div class="match-value"><small>MIN</small><b>${escapeHtml(minute)}</b></div>
        <div class="match-value"><small>SCORE</small><b>${escapeHtml(score)}</b></div>
        <div class="match-value"><small>STATE</small><b class="${candidate.matched ? 'good' : 'match-status'}">${escapeHtml(candidate.status)}</b></div>
      </article>`;
    }
    return `<article class="match-card">
      <div><div class="match-name">${escapeHtml(candidate.home)} <span class="match-status">vs</span> ${escapeHtml(candidate.away)}</div><div class="match-meta">${escapeHtml(candidate.league)} · ${escapeHtml(minute)} · ${escapeHtml(score)}</div></div>
      <div class="match-value"><small>SELECTION</small><b>${escapeHtml(candidate.selection)}</b></div>
      <div class="match-value"><small>ODDS</small><b>${escapeHtml(formatOdds(candidate.odds))}</b></div>
      <div class="match-value"><small>MOMENTUM</small><b class="${candidate.matched ? 'good' : ''}">${escapeHtml(formatPercent(candidate.confidence))}</b></div>
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

  function renderRules(config = {}) {
    const node = $('ruleRows');
    if (!node) return;
    const entries = Object.entries(config).filter(([key, value]) =>
      !/secret|token|key|password|credential/i.test(key) &&
      (value === null || ['string','number','boolean'].includes(typeof value) || Array.isArray(value)));
    node.innerHTML = entries.length
      ? entries.map(([key, value]) => `<div class="status-row"><span>${escapeHtml(prettyRule(key))}</span><b>${escapeHtml(ruleValue(value))}</b></div>`).join('')
      : '<div class="status-row"><span>Rule details</span><b>NOT PUBLISHED</b></div>';
  }

  function renderMonitor(state = {}, health = {}) {
    const view = engineHealthView(health);
    const config = state.config || {};
    const counts = state.counts || health?.liveScan?.counts || {};
    const candidates = (Array.isArray(state.candidates) ? state.candidates : []).map(item => normalizeCandidate(item, config));
    const active = candidates.filter(item => item.minute != null || item.matched);
    const triggered = candidates.filter(item => item.matched);
    const lastScan = first(health?.liveScan?.lastSuccessfulScanAt, state.generatedAt);
    const feedStale = Boolean(state.stale);

    lastGoodMonitor = { state, health };
    text('liveFixtures', first(counts.allLive, counts.live, counts.liveFixtures, 0));
    text('minuteWindow', first(counts.minuteWindow, counts.inMinuteWindow, active.length, 0));
    text('baseCandidates', first(counts.baseCandidates, counts.serverCandidates, candidates.length, 0));
    text('matchedSignals', first(counts.triggered, triggered.length, 0));
    text('runtimeEngine', view.label);
    text('runtimeScan', view.scan);
    text('runtimeUpdate', formatClock(lastScan));
    text('headerStatus', view.label);
    text('engineStatus', view.label);
    text('sysSharedState', state.ok === false ? 'UNAVAILABLE' : feedStale ? 'STORED · STALE' : 'STORED · READY');
    text('sysEngineData', first(health?.state, view.label));
    text('sysLastGood', lastScan ? `${formatDateTime(lastScan)} · ${ageLabel(lastScan)}` : '—');
    text('sysRefresh', `${Math.round(REFRESH_MS / 1000)} sec`);
    text('sysSettlementPending', first(health?.d1?.paper?.pending, '—'));
    setDot('headerDot', view.level);
    setDot('engineDot', view.level);
    setValueClass('runtimeEngine', view.level);
    setValueClass('runtimeScan', view.level);
    setValueClass('sysSharedState', state.ok === false ? 'offline' : feedStale ? 'stale' : 'online');
    setValueClass('sysEngineData', view.level);

    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale', 'offline');
      freshness.classList.add(view.level === 'online' && !feedStale ? 'fresh' : feedStale ? 'stale' : view.level);
      freshness.textContent = lastScan
        ? `${view.label} · LAST SCAN ${ageLabel(lastScan)}${feedStale ? ' · STORED DATA' : ''}`
        : `${view.label} · WAITING FOR SCAN`;
    }

    const signalHero = $('signalHero');
    const lead = triggered[0] || null;
    if (lead) {
      signalHero?.classList.add('matched');
      signalHero?.classList.remove('empty-state');
      text('signalHeadline', `${lead.home} ${lead.homeScore}–${lead.awayScore} ${lead.away}`);
      text('signalSubline', [
        lead.minute == null ? null : `${lead.minute}'`, lead.market, lead.selection,
        lead.odds != null ? `Odds ${formatOdds(lead.odds)}` : null,
        lead.confidence != null ? `Momentum ${formatPercent(lead.confidence)}` : null,
        lead.streak ? `Confirm ${lead.streak}` : null
      ].filter(Boolean).join(' · '));
    } else {
      signalHero?.classList.remove('matched');
      signalHero?.classList.add('empty-state');
      text('signalHeadline', view.level === 'offline'
        ? 'Engine 3 status is currently unavailable.'
        : 'No triggered Engine 3 signal is active right now.');
      text('signalSubline', candidates.length
        ? `${candidates.length} candidate${candidates.length === 1 ? '' : 's'} currently stored in the Engine 3 monitor.`
        : 'Engine 3 is online; there is no current candidate in the stored scanner view.');
    }

    const candidateList = $('candidateList');
    if (candidateList) candidateList.innerHTML = candidates.length
      ? candidates.slice(0, 20).map(item => matchCard(item, false)).join('')
      : '<div class="list-empty">No current Engine 3 candidates.</div>';
    text('candidateNote', `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}`);

    const fixtureList = $('fixtureList');
    if (fixtureList) fixtureList.innerHTML = active.length
      ? active.slice(0, 30).map(item => matchCard(item, true)).join('')
      : '<div class="list-empty">No active Engine 3 states in the stored view.</div>';
    text('fixtureNote', `${active.length} active state${active.length === 1 ? '' : 's'}`);
    renderRules(config);
  }

  function renderUnavailable(message) {
    text('headerStatus', 'UNAVAILABLE');
    text('engineStatus', 'UNAVAILABLE');
    text('runtimeEngine', 'UNAVAILABLE');
    text('runtimeScan', lastGoodMonitor ? 'LAST GOOD DATA' : 'WAITING');
    text('sysSharedState', 'UNAVAILABLE');
    text('sysEngineData', lastGoodMonitor ? 'LAST GOOD DATA' : 'UNAVAILABLE');
    setDot('headerDot', 'offline');
    setDot('engineDot', 'offline');
    setValueClass('runtimeEngine', 'offline');
    setValueClass('runtimeScan', lastGoodMonitor ? 'stale' : 'offline');
    const freshness = $('freshnessLabel');
    if (freshness) {
      freshness.classList.remove('fresh', 'stale');
      freshness.classList.add('offline');
      freshness.textContent = message || 'Engine 3 monitor unavailable';
    }
  }

  function historyMatch(signal) {
    return signal.selectedTeam && signal.opponent !== '—'
      ? `${signal.selectedTeam} vs ${signal.opponent}`
      : signal.selectedTeam || `Fixture ${signal.fixtureId || '—'}`;
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

  function buildDaily(signals) {
    const today = bangkokDateKey(Date.now());
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const rows = [];
    const map = new Map();
    for (let index = HISTORY_DAYS - 1; index >= 0; index -= 1) {
      const date = new Date(todayMs - index * DAY_MS).toISOString().slice(0, 10);
      const row = { date, netUnits: 0, cumulativeUnits: 0 };
      rows.push(row);
      map.set(date, row);
    }
    for (const signal of signals) {
      const key = bangkokDateKey(signal.createdAt);
      const row = map.get(key);
      if (row) row.netUnits += number(signal.profitUnits) || 0;
    }
    let cumulative = 0;
    for (const row of rows) {
      row.netUnits = Math.round(row.netUnits * 100) / 100;
      cumulative = Math.round((cumulative + row.netUnits) * 100) / 100;
      row.cumulativeUnits = cumulative;
    }
    return rows;
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

  function renderAnalytics(payload = {}) {
    const allSignals = (Array.isArray(payload.trades) ? payload.trades : []).map(normalizeTrade);
    latestTrades = allSignals;
    const cutoff = Date.now() - HISTORY_DAYS * DAY_MS;
    const signals = allSignals.filter(signal => (parseTime(signal.createdAt) || 0) >= cutoff);
    const win = signals.filter(signal => signal.outcome === 'WIN').length;
    const loss = signals.filter(signal => signal.outcome === 'LOSS').length;
    const pending = signals.filter(signal => signal.outcome === 'PENDING').length;
    const validOdds = signals.map(signal => number(signal.odds)).filter(value => value !== null && value > 1);
    const avgOdds = validOdds.length ? validOdds.reduce((sum, value) => sum + value, 0) / validOdds.length : null;
    const netUnits = signals.reduce((sum, signal) => sum + (number(signal.profitUnits) || 0), 0);
    const accuracy = win + loss ? win / (win + loss) * 100 : 0;
    const daily = buildDaily(signals);

    text('histTotal', signals.length);
    text('histWin', win);
    text('histLoss', loss);
    text('histPending', pending);
    text('histAccuracy', formatPercent(accuracy));
    text('histAvgOdds', avgOdds === null ? '—' : avgOdds.toFixed(2));
    text('histNetUnits', `NET ${formatUnits(netUnits)}`);
    text('historyNote', `${signals.length} signal${signals.length === 1 ? '' : 's'} · 30 days`);

    const chart = $('performanceChart');
    if (chart) chart.innerHTML = chartSvg(daily);
    const list = $('historyList');
    if (list) list.innerHTML = signals.length
      ? signals.slice(0, 25).map(historyRow).join('')
      : '<div class="list-empty">No Engine 3 signal history recorded in the last 30 days.</div>';

    const freshness = $('historyFreshness');
    if (freshness) {
      freshness.classList.remove('stale','offline');
      freshness.classList.add('fresh');
      freshness.textContent = payload.generatedAt ? `D1 HISTORY · ${ageLabel(payload.generatedAt)}` : 'D1 HISTORY · READY';
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
    if (!STATE_URL || !HEALTH_URL) return renderUnavailable('Engine 3 endpoints are not configured');
    try {
      const [state, health] = await Promise.all([fetchJson(STATE_URL), fetchJson(HEALTH_URL)]);
      renderMonitor(state, health);
    } catch (error) {
      renderUnavailable(error?.name === 'AbortError' ? 'Engine 3 monitor request timed out' : (error?.message || 'Engine 3 monitor unavailable'));
    }
  }

  async function refreshAnalytics() {
    if (!ANALYTICS_URL) return;
    try {
      const data = await fetchJson(ANALYTICS_URL, 10000);
      renderAnalytics(data);
    } catch (error) {
      const freshness = $('historyFreshness');
      if (freshness) {
        freshness.classList.remove('fresh','stale');
        freshness.classList.add('offline');
        freshness.textContent = 'D1 HISTORY UNAVAILABLE';
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
