(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const POLL_MS = 60_000;
  const ALERT_KEY = 'nomadtips3.page5.condition-control.v1.alerts';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const STAKE = 100;
  const pointsByCandidate = new Map();

  const DEFAULT_CONFIG = {
    side: 'HOME', minuteMin: 60, minuteMax: 80, market: 'WIN',
    oddsMin: 1.70, oddsMax: null, ahMin: 0.25, ahMax: null,
    momentumMin: 60, goalGapLimited: false, maxGoalGap: 1,
    confirmationRounds: 2, signalLimitEnabled: false, maxSignalsPerDay: 3
  };

  const state = {
    alerts: readArray(ALERT_KEY),
    trades: readArray(TRADE_KEY),
    timer: null,
    nextAt: Date.now(),
    config: { ...DEFAULT_CONFIG }
  };

  const $ = id => document.getElementById(id);
  const num = value => {
    const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function readArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAlerts() {
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(state.alerts.slice(0, 100))); } catch {}
  }

  function sideLabel(side) {
    if (side === 'AWAY') return 'ทีมเยือน';
    if (side === 'BOTH') return 'ทั้งสองทีม';
    return 'ทีมเจ้าบ้าน';
  }

  function marketLabel(market) {
    return market === 'AH' ? 'Asian Handicap' : 'ชนะตรง';
  }

  function formatLine(value) {
    const number = num(value);
    if (number === null) return 'N/A';
    return `${number >= 0 ? '+' : ''}${number}`;
  }

  function configSummary(config = state.config) {
    const oddsMax = config.oddsMax === null ? 'ไม่จำกัด' : Number(config.oddsMax).toFixed(2);
    const ahMax = config.ahMax === null ? 'ไม่จำกัด' : formatLine(config.ahMax);
    const gap = config.goalGapLimited ? `ผลต่าง ≤ ${config.maxGoalGap}` : 'ทุกสกอร์';
    const limit = config.signalLimitEnabled ? `สูงสุด ${config.maxSignalsPerDay} สัญญาณ/วัน` : 'สัญญาณไม่จำกัด';
    return `${sideLabel(config.side)} · นาที ${config.minuteMin}–${config.minuteMax} · ${marketLabel(config.market)} Odds ${Number(config.oddsMin).toFixed(2)}–${oddsMax} · AH ${formatLine(config.ahMin)}–${ahMax} · บุก ≥ ${config.momentumMin}% · ${gap} · ยืนยัน ${config.confirmationRounds} รอบ · ${limit}`;
  }

  function scoreView(candidate) {
    const difference = Number(candidate.goalDifference || 0);
    if (candidate.scoreState === 'HOME_LEADING') {
      return {
        label: `ทีมที่เลือกนำ ${Math.abs(difference)} ลูก`,
        css: 'leading',
        risk: 'ทีมที่เลือกกำลังนำ แต่ระบบยังต้องเห็นแรงบุกตามเปอร์เซ็นต์และจำนวนรอบที่ตั้งไว้'
      };
    }
    if (candidate.scoreState === 'HOME_TRAILING') {
      return {
        label: `ทีมที่เลือกตาม ${Math.abs(difference)} ลูก`,
        css: 'trailing',
        risk: 'ทีมที่เลือกกำลังตาม จึงต้องใช้ Momentum ที่ผ่านเกณฑ์เพื่อยืนยันว่ากำลังกดดันเพื่อยิงเพิ่ม'
      };
    }
    return {
      label: 'สกอร์เสมอ',
      css: 'tied',
      risk: 'สกอร์เสมอ ประตูถัดไปของทีมที่เลือกจะเปลี่ยนสถานการณ์ทันที'
    };
  }

  function notificationReady() {
    return 'Notification' in window && Notification.permission === 'granted';
  }

  function updateNotifyButton() {
    const button = $('notifyButton');
    if (!button) return;
    if (!('Notification' in window)) {
      button.textContent = 'เบราว์เซอร์ไม่รองรับแจ้งเตือน';
      button.disabled = true;
    } else if (Notification.permission === 'granted') {
      button.textContent = 'แจ้งเตือนเบราว์เซอร์เปิดแล้ว';
      button.disabled = true;
    } else if (Notification.permission === 'denied') {
      button.textContent = 'การแจ้งเตือนถูกบล็อก';
      button.disabled = true;
    }
  }

  async function enableNotifications() {
    if (!('Notification' in window)) return;
    try { await Notification.requestPermission(); } catch {}
    updateNotifyButton();
  }

  function notifySignal(candidate, momentum) {
    if (!notificationReady()) return;
    try {
      const actualHome = candidate.actualHome || (candidate.selectedSide === 'AWAY' ? candidate.away : candidate.home);
      const actualAway = candidate.actualAway || (candidate.selectedSide === 'AWAY' ? candidate.home : candidate.away);
      new Notification('NOMADTIPS3 · เข้าเงื่อนไข', {
        body: `${actualHome} vs ${actualAway} · ${candidate.minute}′ · Momentum ${momentum}% · ${marketLabel(candidate.selectedMarket)} ${candidate.markets?.selectedOdds ?? 'N/A'}`,
        tag: `nomad-${candidate.fixtureId}-${candidate.selectedSide || 'HOME'}`,
        renotify: false
      });
    } catch {}
  }

  function recordServerAlert(candidate) {
    if (!candidate.serverTriggered) return;
    const key = `${candidate.fixtureId}:${candidate.selectedSide || 'HOME'}`;
    if (state.alerts.some(alert => alert.key === key)) return;
    const score = scoreView(candidate);
    const momentum = num(candidate.serverMomentum?.home);
    const actualHome = candidate.actualHome || (candidate.selectedSide === 'AWAY' ? candidate.away : candidate.home);
    const actualAway = candidate.actualAway || (candidate.selectedSide === 'AWAY' ? candidate.home : candidate.away);
    const actualHomeScore = candidate.actualScore?.home ?? (candidate.selectedSide === 'AWAY' ? candidate.score?.away : candidate.score?.home);
    const actualAwayScore = candidate.actualScore?.away ?? (candidate.selectedSide === 'AWAY' ? candidate.score?.home : candidate.score?.away);
    state.alerts.unshift({
      key,
      at: Date.now(),
      fixtureId: Number(candidate.fixtureId),
      match: `${actualHome} vs ${actualAway}`,
      minute: candidate.minute,
      score: `${actualHomeScore}-${actualAwayScore}`,
      scoreState: score.label,
      momentum,
      selectedSide: candidate.selectedSide || 'HOME',
      market: candidate.selectedMarket || state.config.market,
      odds: candidate.markets?.selectedOdds ?? null,
      ah: candidate.markets?.homeAh ?? null,
      ahOdds: candidate.markets?.homeAhOdds ?? null
    });
    saveAlerts();
    renderAlertLog();
    notifySignal(candidate, momentum);
  }

  function renderAlertLog() {
    const box = $('alertLog');
    if (!box) return;
    if (!state.alerts.length) {
      box.innerHTML = '<div>ยังไม่มี Alert</div>';
      return;
    }
    box.innerHTML = state.alerts.map(alert => `
      <div>
        <b>${escapeHtml(alert.match)}</b> · ${escapeHtml(alert.score)} · ${escapeHtml(alert.scoreState)}<br>
        ${alert.minute}′ · Momentum ${alert.momentum ?? 'N/A'}% · ${marketLabel(alert.market)} ${alert.odds ?? 'N/A'} · AH ${formatLine(alert.ah)}${alert.ahOdds ? ` @ ${alert.ahOdds}` : ''} · ${new Date(alert.at).toLocaleString()}
      </div>
    `).join('');
  }

  function momentumChart(fixtureId, selectedSide, value) {
    const key = `${fixtureId}:${selectedSide || 'HOME'}`;
    const points = pointsByCandidate.get(key) || [];
    if (value !== null && (points.length === 0 || points.at(-1) !== value)) points.push(value);
    pointsByCandidate.set(key, points.slice(-15));
    const data = pointsByCandidate.get(key);
    if (!data.length) return '';
    const x = index => 10 + (data.length === 1 ? 280 : index * 560 / (data.length - 1));
    const y = point => 7 + (100 - point) * 0.64;
    const selected = data.map((point, index) => `${x(index)},${y(point)}`).join(' ');
    const opponent = data.map((point, index) => `${x(index)},${y(100 - point)}`).join(' ');
    return `<svg viewBox="0 0 580 78" aria-label="NOMAD Momentum graph">
      <line x1="10" y1="39" x2="570" y2="39" stroke="#365448" stroke-dasharray="4 4"/>
      <polyline points="${selected}" fill="none" stroke="#00df91" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="${opponent}" fill="none" stroke="#ff6573" stroke-width="3" stroke-linejoin="round"/>
    </svg>`;
  }

  function renderCard(candidate) {
    const config = state.config;
    const momentum = num(candidate.serverMomentum?.home);
    const opponentMomentum = momentum === null ? null : 100 - momentum;
    const evidence = num(candidate.serverMomentum?.evidence);
    const streak = Number(candidate.serverStreak || 0);
    const ready = momentum !== null;
    const momentumPass = ready && momentum >= config.momentumMin;
    const evidencePass = ready && (evidence || 0) >= 1;
    const triggered = Boolean(candidate.serverTriggered);
    const status = triggered
      ? 'เข้าเงื่อนไข'
      : candidate.signalLimitReached
        ? 'ครบจำนวนสัญญาณวันนี้'
        : !ready
          ? 'เก็บตัวอย่าง'
          : momentumPass && evidencePass
            ? `รอยืนยัน ${Math.min(streak + 1, config.confirmationRounds)} / ${config.confirmationRounds}`
            : 'กำลังตรวจ';
    const score = scoreView(candidate);
    const selectedOdds = num(candidate.markets?.selectedOdds);
    const ah = num(candidate.markets?.homeAh);
    const ahOdds = num(candidate.markets?.homeAhOdds);
    const actualHome = candidate.actualHome || (candidate.selectedSide === 'AWAY' ? candidate.away : candidate.home);
    const actualAway = candidate.actualAway || (candidate.selectedSide === 'AWAY' ? candidate.home : candidate.away);
    const actualHomeScore = candidate.actualScore?.home ?? (candidate.selectedSide === 'AWAY' ? candidate.score?.away : candidate.score?.home);
    const actualAwayScore = candidate.actualScore?.away ?? (candidate.selectedSide === 'AWAY' ? candidate.score?.home : candidate.score?.away);
    const homeSelected = candidate.selectedSide === 'HOME';
    const awaySelected = candidate.selectedSide === 'AWAY';

    if (triggered) recordServerAlert(candidate);

    return `<article class="card ${triggered ? 'triggered' : ''}">
      <div class="card-head"><span>${escapeHtml(candidate.country)} · ${escapeHtml(candidate.league)} · ${candidate.fixtureId}</span><b class="badge ${triggered ? 'ok' : ''}">${status}</b></div>
      <div class="card-body">
        <div>
          <div class="match">
            <div class="team"><strong>${escapeHtml(actualHome)}</strong><small>ทีมเจ้าบ้าน${homeSelected ? ' · SELECTED' : ''}</small></div>
            <div class="score"><span>${candidate.minute}′</span><b>${actualHomeScore} : ${actualAwayScore}</b><em class="${score.css}">${score.label}</em></div>
            <div class="team"><strong>${escapeHtml(actualAway)}</strong><small>ทีมเยือน${awaySelected ? ' · SELECTED' : ''}</small></div>
          </div>
          <div class="momentum">
            <div class="momentum-top"><small>NOMAD MOMENTUM · SERVER 24/7 · SELECTED vs OPPONENT</small><b><em>${ready ? momentum : '—'}</em> – <i>${ready ? opponentMomentum : '—'}</i></b></div>
            <div class="bar"><span class="home" style="width:${ready ? momentum : 50}%"></span><span class="away" style="width:${ready ? opponentMomentum : 50}%"></span></div>
            <div class="chart">${momentumChart(candidate.fixtureId, candidate.selectedSide, momentum)}</div>
          </div>
        </div>
        <div class="facts">
          <div class="fact"><small>Required Momentum</small><b class="${momentumPass ? 'green' : 'yellow'}">${config.momentumMin}%</b></div>
          <div class="fact"><small>Consecutive scans</small><b class="${streak >= config.confirmationRounds ? 'green' : 'yellow'}">${streak} / ${config.confirmationRounds}</b></div>
          <div class="fact"><small>${marketLabel(candidate.selectedMarket)}</small><b class="${selectedOdds ? 'green' : 'yellow'}">${selectedOdds?.toFixed(2) ?? 'N/A'}</b></div>
          <div class="fact"><small>Asian Handicap</small><b class="${ah !== null ? 'green' : 'yellow'}">${formatLine(ah)}</b></div>
          <div class="fact"><small>AH Odds</small><b class="${ahOdds ? 'green' : 'yellow'}">${ahOdds?.toFixed(2) ?? 'N/A'}</b></div>
          <div class="fact"><small>Paper Investment</small><b class="${candidate.selectedSide === 'HOME' && ahOdds ? 'green' : 'yellow'}">${candidate.selectedSide === 'HOME' && ahOdds ? '100 Units' : 'ALERT ONLY'}</b></div>
          <div class="fact"><small>Red cards Selected–Opponent</small><b class="green">${candidate.redCards.home}–${candidate.redCards.away}</b></div>
          <div class="fact"><small>Attack evidence</small><b class="${evidencePass ? 'green' : 'yellow'}">${ready ? evidence : 'WAIT'}</b></div>
        </div>
        <div class="analysis"><b>วิเคราะห์ตามสกอร์:</b> ${score.risk}</div>
        <div class="alert"><strong>${status}</strong><p>${triggered
          ? `${escapeHtml(candidate.home)} · ${score.label} · Momentum ${momentum}% · ${marketLabel(candidate.selectedMarket)} ${selectedOdds?.toFixed(2) ?? 'N/A'} · AH ${formatLine(ah)} @ ${ahOdds?.toFixed(2) ?? 'N/A'}`
          : `ต้องผ่านอัตราการบุก ${config.momentumMin}% และยืนยัน ${config.confirmationRounds} รอบตามค่าที่กำลังรัน`}</p></div>
      </div>
    </article>`;
  }

  function paperMetrics() {
    const trades = state.trades;
    const pending = trades.filter(trade => trade.status === 'PENDING');
    const decided = trades.filter(trade => ['SETTLED', 'VOID'].includes(trade.status));
    const correct = decided.filter(trade => trade.result === 'CORRECT').length;
    const incorrect = decided.filter(trade => trade.result === 'INCORRECT').length;
    const net = round2(decided.reduce((sum, trade) => sum + (num(trade.profitUnits) || 0), 0));
    const settledStake = decided.reduce((sum, trade) => sum + (num(trade.stakeUnits) || STAKE), 0);
    const invested = trades.reduce((sum, trade) => sum + (num(trade.stakeUnits) || STAKE), 0);
    const returned = round2(decided.reduce((sum, trade) => sum + (num(trade.returnedUnits) || 0), 0));
    const roi = settledStake > 0 ? round2(net / settledStake * 100) : 0;
    const accuracy = correct + incorrect > 0 ? round2(correct / (correct + incorrect) * 100) : 0;
    return { total: trades.length, pending: pending.length, decided, correct, incorrect, net, invested, returned, roi, accuracy };
  }

  function equityData(decided) {
    const sorted = [...decided].filter(trade => trade.settledAt).sort((a, b) => a.settledAt - b.settledAt);
    let cumulative = 0;
    return [{ index: 0, value: 0 }, ...sorted.map((trade, index) => {
      cumulative = round2(cumulative + (num(trade.profitUnits) || 0));
      return { index: index + 1, value: cumulative };
    })];
  }

  function maximumDrawdown(points) {
    let peak = 0;
    let max = 0;
    for (const point of points) {
      peak = Math.max(peak, point.value);
      max = Math.max(max, peak - point.value);
    }
    return round2(max);
  }

  function renderEquity(decided) {
    const box = $('equityChart');
    const data = equityData(decided);
    const drawdown = maximumDrawdown(data);
    $('drawdownText').textContent = `Max drawdown ${drawdown} Units`;
    if (data.length <= 1) {
      box.innerHTML = '<div class="empty">กราฟจะเริ่มเมื่อมีผลการลงทุนรายการแรก</div>';
      return;
    }
    const width = 760, height = 220;
    const pad = { left: 46, right: 18, top: 18, bottom: 30 };
    const values = data.map(point => point.value);
    let min = Math.min(0, ...values), max = Math.max(0, ...values);
    if (min === max) { min -= 10; max += 10; }
    const range = max - min;
    const x = index => pad.left + index * (width - pad.left - pad.right) / Math.max(1, data.length - 1);
    const y = value => pad.top + (max - value) * (height - pad.top - pad.bottom) / range;
    const points = data.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
    const zeroY = y(0), last = data.at(-1);
    box.innerHTML = `<svg viewBox="0 0 ${width} ${height}">
      <line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" stroke="#52675d" stroke-dasharray="5 5"/>
      <polyline points="${points}" fill="none" stroke="${last.value >= 0 ? '#00df91' : '#ff6573'}" stroke-width="4" stroke-linejoin="round"/>
      ${data.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="3" fill="${point.value >= 0 ? '#00df91' : '#ff6573'}"/>`).join('')}
      <text x="${width - 155}" y="${Math.max(14, y(last.value) - 9)}" fill="${last.value >= 0 ? '#00df91' : '#ff6573'}" font-size="12" font-weight="800">Net ${last.value >= 0 ? '+' : ''}${last.value} Units</text>
    </svg>`;
  }

  function renderTrades() {
    const box = $('tradeList');
    if (!state.trades.length) {
      box.innerHTML = '<div class="empty">ยังไม่มีรายการลงทุน</div>';
      return;
    }
    box.innerHTML = [...state.trades].sort((a, b) => b.createdAt - a.createdAt).map(trade => {
      const line = formatLine(trade.ahLine);
      const profit = num(trade.profitUnits) || 0;
      const finalText = trade.status === 'PENDING'
        ? 'รอผลการแข่งขัน'
        : trade.settlement === 'VOID'
          ? 'ยกเลิกรายการ · คืน 100 Units'
          : `Final ${trade.finalHomeScore}-${trade.finalAwayScore} · หลัง Alert ${trade.postEntryHomeGoals}-${trade.postEntryAwayGoals}`;
      return `<article class="trade">
        <div class="trade-top"><b>${escapeHtml(trade.home)} vs ${escapeHtml(trade.away)}</b><span class="trade-status ${trade.status === 'PENDING' ? 'pending' : trade.result === 'CORRECT' ? 'win' : trade.result === 'INCORRECT' ? 'loss' : 'neutral'}">${trade.settlement}</span></div>
        <div class="trade-meta">Alert ${trade.entryMinute}′ · Entry ${trade.entryHomeScore}-${trade.entryAwayScore} · ${escapeHtml(trade.scoreState)} · Momentum ${trade.momentum}%<br>Home AH ${line} @ ${trade.ahOdds} · Investment ${trade.stakeUnits} Units<br>${finalText}</div>
        <div class="trade-profit ${profit > 0 ? 'green' : profit < 0 ? 'red' : 'yellow'}">${trade.status === 'PENDING' ? 'PENDING' : `ผล ${trade.result === 'CORRECT' ? 'ถูก' : trade.result === 'INCORRECT' ? 'ผิด' : 'กลาง'} · ${profit >= 0 ? '+' : ''}${profit} Units · Return ${trade.returnedUnits} Units`}</div>
      </article>`;
    }).join('');
  }

  function renderPaper() {
    state.trades = readArray(TRADE_KEY);
    const metrics = paperMetrics();
    $('tradeTotal').textContent = metrics.total;
    $('tradePending').textContent = metrics.pending;
    $('unitsInvested').textContent = `${metrics.invested} Units`;
    $('netUnits').textContent = `${metrics.net >= 0 ? '+' : ''}${metrics.net} Units`;
    $('roiPercent').textContent = `${metrics.roi >= 0 ? '+' : ''}${metrics.roi.toFixed(2)}%`;
    $('correctWrong').textContent = `${metrics.correct} / ${metrics.incorrect}`;
    $('accuracyPercent').textContent = `${metrics.accuracy.toFixed(2)}%`;
    $('unitsReturned').textContent = `${metrics.returned} Units`;
    for (const [id, value] of [['netUnits', metrics.net], ['roiPercent', metrics.roi]]) {
      const element = $(id);
      element.classList.remove('positive', 'negative');
      if (value > 0) element.classList.add('positive');
      if (value < 0) element.classList.add('negative');
    }
    renderEquity(metrics.decided);
    renderTrades();
  }

  function processPayload(payload) {
    state.config = { ...DEFAULT_CONFIG, ...(payload.config || {}) };
    const counts = payload.counts || {};
    $('allLive').textContent = counts.allLive ?? 0;
    $('minuteWindow').textContent = counts.minuteWindow ?? counts.minute60To80 ?? 0;
    $('completeStats').textContent = counts.completeStats ?? 0;
    $('completeMarkets').textContent = counts.completeMarkets ?? 0;
    $('baseCandidates').textContent = counts.baseCandidates ?? 0;
    $('conditionHits').textContent = counts.triggered ?? 0;
    $('updatedAt').textContent = `${new Date(payload.generatedAt || Date.now()).toLocaleString()} · Worker 24/7`;

    const tag = document.querySelector('.top .tag');
    if (tag) tag.textContent = `PAGE 5 · ${sideLabel(state.config.side).toUpperCase()} · CONDITION CONTROL`;
    const note = document.querySelector('.note');
    if (note) note.innerHTML = `<strong>เงื่อนไขที่กำลังรัน:</strong> ${escapeHtml(configSummary())}`;

    const rows = Array.isArray(payload.candidates) ? payload.candidates : [];
    rows.sort((a, b) => Number(b.serverTriggered) - Number(a.serverTriggered) || (b.serverMomentum?.home || 0) - (a.serverMomentum?.home || 0));
    $('cards').innerHTML = rows.length
      ? rows.map(renderCard).join('')
      : `<div class="empty"><b>ยังไม่มีคู่ผ่านตัวกรองพื้นฐาน</b><br>${escapeHtml(configSummary())}</div>`;
  }

  async function scan() {
    clearTimeout(state.timer);
    state.nextAt = Date.now() + POLL_MS;
    updateCountdown();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const response = await fetch(`${WORKER}/live-condition-scan?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      clearTimeout(timeout);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      processPayload(payload);
    } catch (error) {
      $('cards').innerHTML = `<div class="empty"><b>Worker กำลัง Deploy หรือเชื่อมต่อไม่สำเร็จ</b><br>${escapeHtml(error.message)}<br>จะลองใหม่ใน 60 วินาที</div>`;
    } finally {
      state.timer = setTimeout(scan, POLL_MS);
    }
  }

  function updateCountdown() {
    const seconds = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
    $('nextScan').textContent = `Next scan in ${seconds}s · Worker runs 24/7`;
  }

  $('notifyButton')?.addEventListener('click', enableNotifications);
  window.addEventListener('storage', event => {
    if (event.key === TRADE_KEY) renderPaper();
  });
  updateNotifyButton();
  renderAlertLog();
  renderPaper();
  setInterval(updateCountdown, 1_000);
  scan();
})();
