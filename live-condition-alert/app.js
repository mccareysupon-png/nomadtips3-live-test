(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const POLL_MS = 60_000;
  const SETTLEMENT_MS = 120_000;
  const ALERT_KEY = 'nomadtips3.page5.home-any-score.v3.alerts';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const STAKE = 100;
  const TERMINAL = new Set(['FT', 'AET', 'PEN', 'WO', 'AWD', 'CANC', 'ABD', 'PST']);
  const VOID_STATUS = new Set(['CANC', 'ABD', 'PST', 'WO', 'AWD']);
  const WEIGHTS = { attacks: 0.16, dangerous_attacks: 0.52, shots: 2, shots_on_target: 4, corners: 1.25 };

  const state = {
    fixtures: new Map(),
    alerts: readArray(ALERT_KEY),
    trades: readArray(TRADE_KEY),
    timer: null,
    nextAt: Date.now(),
    settling: false,
    lastSettlementAt: 0
  };

  const $ = id => document.getElementById(id);
  const num = value => {
    const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const round2 = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
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

  function saveTrades() {
    try { localStorage.setItem(TRADE_KEY, JSON.stringify(state.trades.slice(0, 500))); } catch {}
  }

  function fixtureState(id) {
    const key = String(id);
    if (!state.fixtures.has(key)) {
      state.fixtures.set(key, {
        snapshots: [],
        points: [],
        streak: 0,
        triggered: false,
        lastProcessedStamp: null
      });
    }
    return state.fixtures.get(key);
  }

  function activity(current, base, side) {
    let weighted = 0;
    let evidence = 0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      const now = num(current.stats[key]?.[side]);
      const old = num(base?.stats?.[key]?.[side]);
      const delta = old === null ? 0 : Math.max(0, (now ?? 0) - old);
      weighted += delta * weight;
      if (['dangerous_attacks', 'shots', 'shots_on_target', 'corners'].includes(key)) evidence += delta;
    }
    weighted += Math.max(0, num(current.stats.possession?.[side]) || 0) * 0.07;
    return { weighted, evidence };
  }

  function calculateMomentum(fixture, current) {
    if (fixture.snapshots.length < 2) return null;
    const bases = fixture.snapshots.filter(snapshot =>
      snapshot.stamp !== current.stamp && snapshot.minute >= current.minute - 5
    );
    const base = bases[0] || fixture.snapshots.at(-2);
    const home = activity(current, base, 'home');
    const away = activity(current, base, 'away');
    const total = home.weighted + away.weighted;
    let homePercent = total > 0 ? (home.weighted / total) * 100 : 50;
    const previous = fixture.points.at(-1);
    if (previous) homePercent = previous.home * 0.55 + homePercent * 0.45;
    homePercent = Math.round(clamp(homePercent, 0, 100));
    return { home: homePercent, away: 100 - homePercent, evidence: home.evidence };
  }

  function momentumChart(points) {
    const data = points.slice(-15);
    if (!data.length) return '';
    const x = index => 10 + (data.length === 1 ? 280 : index * 560 / (data.length - 1));
    const y = value => 7 + (100 - value) * 0.64;
    const home = data.map((point, index) => `${x(index)},${y(point.home)}`).join(' ');
    const away = data.map((point, index) => `${x(index)},${y(point.away)}`).join(' ');
    return `<svg viewBox="0 0 580 78" aria-label="NOMAD Momentum graph">
      <line x1="10" y1="39" x2="570" y2="39" stroke="#365448" stroke-dasharray="4 4"/>
      <polyline points="${home}" fill="none" stroke="#00df91" stroke-width="3" stroke-linejoin="round"/>
      <polyline points="${away}" fill="none" stroke="#ff6573" stroke-width="3" stroke-linejoin="round"/>
    </svg>`;
  }

  function scoreView(candidate) {
    const difference = Number(candidate.goalDifference || 0);
    if (candidate.scoreState === 'HOME_LEADING') {
      return {
        label: `เจ้าบ้านนำ ${Math.abs(difference)} ลูก`,
        css: 'leading',
        risk: 'เจ้าบ้านกำลังนำอยู่ ประตูเพิ่มจะช่วยยืนยัน Home Win และ AH แต่ระบบยังต้องเห็นแรงกดดันจริงสองรอบ'
      };
    }
    if (candidate.scoreState === 'HOME_TRAILING') {
      const behind = Math.abs(difference);
      return {
        label: `เจ้าบ้านตาม ${behind} ลูก`,
        css: 'trailing',
        risk: behind === 1
          ? 'เจ้าบ้านตามหนึ่งลูก ประตูถัดไปอาจทำให้เสมอ แต่ Home Win ยังเสี่ยงกว่าสถานะเสมอหรือนำ'
          : `เจ้าบ้านตาม ${behind} ลูก ประตูเดียวอาจยังไม่พอ สถานการณ์นี้มีความเสี่ยงสูงแม้ Momentum ผ่าน`
      };
    }
    return {
      label: 'สกอร์เสมอ',
      css: 'tied',
      risk: 'สกอร์เสมอ ประตูของเจ้าบ้านจะทำให้ขึ้นนำทันที จึงสอดคล้องกับ Home Win มากกว่าสถานะที่เจ้าบ้านกำลังตาม'
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
      return;
    }
    if (Notification.permission === 'granted') {
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

  function notifySignal(candidate, momentum, ahOdds) {
    if (!notificationReady()) return;
    const ah = num(candidate.markets.homeAh);
    try {
      new Notification('NOMADTIPS3 · เข้าเงื่อนไข', {
        body: `${candidate.home} vs ${candidate.away} · ${candidate.minute}′ · Momentum ${momentum.home}% · AH ${ah >= 0 ? '+' : ''}${ah} @ ${ahOdds ?? 'N/A'} · 100 Units`,
        tag: `nomad-${candidate.fixtureId}`,
        renotify: false
      });
    } catch {}
  }

  function createPaperTrade(candidate, momentum) {
    const fixtureId = Number(candidate.fixtureId);
    if (state.trades.some(trade => Number(trade.fixtureId) === fixtureId)) return null;

    const ahLine = num(candidate.markets?.homeAh);
    const ahOdds = num(candidate.markets?.homeAhOdds);
    if (ahLine === null || ahOdds === null || ahOdds <= 1) return null;

    const score = scoreView(candidate);
    const trade = {
      id: `P5-${fixtureId}`,
      fixtureId,
      createdAt: Date.now(),
      entryMinute: Number(candidate.minute),
      entryHomeScore: Number(candidate.score.home),
      entryAwayScore: Number(candidate.score.away),
      home: candidate.home,
      away: candidate.away,
      league: candidate.league || '',
      country: candidate.country || '',
      scoreState: score.label,
      momentum: Number(momentum.home),
      homeWinOdds: num(candidate.markets.homeWin),
      ahLine,
      ahOdds,
      stakeUnits: STAKE,
      status: 'PENDING',
      result: 'PENDING',
      settlement: 'PENDING',
      finalHomeScore: null,
      finalAwayScore: null,
      postEntryHomeGoals: null,
      postEntryAwayGoals: null,
      profitUnits: 0,
      returnedUnits: null,
      settledAt: null,
      note: 'Paper trade · in-play AH settled from goals after alert'
    };
    state.trades.unshift(trade);
    saveTrades();
    renderPaper();
    notifySignal(candidate, momentum, ahOdds);
    return trade;
  }

  function recordAlert(candidate, momentum) {
    const key = String(candidate.fixtureId);
    if (state.alerts.some(alert => String(alert.key) === key)) return;

    const score = scoreView(candidate);
    const trade = createPaperTrade(candidate, momentum);
    state.alerts.unshift({
      key,
      at: Date.now(),
      fixtureId: Number(candidate.fixtureId),
      match: `${candidate.home} vs ${candidate.away}`,
      minute: candidate.minute,
      score: `${candidate.score.home}-${candidate.score.away}`,
      scoreState: score.label,
      momentum: momentum.home,
      win: candidate.markets.homeWin,
      ah: candidate.markets.homeAh,
      ahOdds: candidate.markets.homeAhOdds ?? null,
      invested: Boolean(trade)
    });
    saveAlerts();
    renderAlertLog();
  }

  function renderAlertLog() {
    const box = $('alertLog');
    if (!state.alerts.length) {
      box.innerHTML = '<div>ยังไม่มี Alert</div>';
      return;
    }
    box.innerHTML = state.alerts.map(alert => `
      <div>
        <b>${escapeHtml(alert.match)}</b> · ${escapeHtml(alert.score)} · ${escapeHtml(alert.scoreState)}<br>
        ${alert.minute}′ · Momentum ${alert.momentum}% · Home Win ${alert.win} · AH ${alert.ah >= 0 ? '+' : ''}${alert.ah}${alert.ahOdds ? ` @ ${alert.ahOdds}` : ' · Odds N/A'}
        · ${alert.invested ? 'ลงทุนจำลอง 100 Units' : 'ไม่ลงทุน—ราคา AH Odds ไม่ครบ'} · ${new Date(alert.at).toLocaleString()}
      </div>
    `).join('');
  }

  function renderCard(candidate, fixture, momentum) {
    const threshold = candidate.minute <= 74 ? 60 : 65;
    const ready = Boolean(momentum);
    const momentumPass = ready && momentum.home >= threshold;
    const evidencePass = ready && momentum.evidence >= 1;
    const pass = momentumPass && evidencePass;

    if (fixture.lastProcessedStamp !== candidate.sampleStamp) {
      fixture.streak = pass ? fixture.streak + 1 : 0;
      fixture.triggered = fixture.streak >= 2;
      fixture.lastProcessedStamp = candidate.sampleStamp;
    }
    if (fixture.triggered && momentum) recordAlert(candidate, momentum);

    const status = fixture.triggered ? 'เข้าเงื่อนไข' : !ready ? 'เก็บตัวอย่าง' : pass ? 'รอยืนยันรอบ 2' : 'กำลังตรวจ';
    const score = scoreView(candidate);
    const ah = num(candidate.markets.homeAh);
    const ahOdds = num(candidate.markets.homeAhOdds);

    return `<article class="card ${fixture.triggered ? 'triggered' : ''}">
      <div class="card-head"><span>${escapeHtml(candidate.country)} · ${escapeHtml(candidate.league)} · ${candidate.fixtureId}</span><b class="badge ${fixture.triggered ? 'ok' : ''}">${status}</b></div>
      <div class="card-body">
        <div>
          <div class="match">
            <div class="team"><strong>${escapeHtml(candidate.home)}</strong><small>HOME ONLY</small></div>
            <div class="score"><span>${candidate.minute}′</span><b>${candidate.score.home} : ${candidate.score.away}</b><em class="${score.css}">${score.label}</em></div>
            <div class="team"><strong>${escapeHtml(candidate.away)}</strong><small>AWAY</small></div>
          </div>
          <div class="momentum">
            <div class="momentum-top"><small>NOMAD MOMENTUM · ROLLING 5 MIN</small><b><em>${ready ? momentum.home : '—'}</em> – <i>${ready ? momentum.away : '—'}</i></b></div>
            <div class="bar"><span class="home" style="width:${ready ? momentum.home : 50}%"></span><span class="away" style="width:${ready ? momentum.away : 50}%"></span></div>
            <div class="chart">${momentumChart(fixture.points)}</div>
          </div>
        </div>
        <div class="facts">
          <div class="fact"><small>Required Momentum</small><b class="${momentumPass ? 'green' : 'yellow'}">${threshold}%</b></div>
          <div class="fact"><small>Consecutive scans</small><b class="${fixture.streak >= 2 ? 'green' : 'yellow'}">${fixture.streak} / 2</b></div>
          <div class="fact"><small>Home Win</small><b class="green">${Number(candidate.markets.homeWin).toFixed(2)}</b></div>
          <div class="fact"><small>Home AH</small><b class="green">${ah >= 0 ? '+' : ''}${ah}</b></div>
          <div class="fact"><small>AH Odds</small><b class="${ahOdds ? 'green' : 'yellow'}">${ahOdds ?? 'N/A'}</b></div>
          <div class="fact"><small>Paper Investment</small><b class="${ahOdds ? 'green' : 'yellow'}">${ahOdds ? '100 Units' : 'NO BET'}</b></div>
          <div class="fact"><small>Red cards H–A</small><b class="green">${candidate.redCards.home}–${candidate.redCards.away}</b></div>
          <div class="fact"><small>Attack evidence</small><b class="${evidencePass ? 'green' : 'yellow'}">${ready ? momentum.evidence : 'WAIT'}</b></div>
        </div>
        <div class="analysis"><b>วิเคราะห์ตามสกอร์:</b> ${score.risk}</div>
        <div class="alert"><strong>${fixture.triggered ? 'เข้าเงื่อนไข' : status}</strong><p>${fixture.triggered
          ? `${escapeHtml(candidate.home)} · ${score.label} · Momentum ${momentum.home}% · AH ${ah >= 0 ? '+' : ''}${ah} @ ${ahOdds ?? 'N/A'} · ${ahOdds ? 'Paper 100 Units' : 'ไม่ลงทุนเพราะไม่มี AH Odds'}`
          : 'Momentum และหลักฐานการบุกต้องผ่านสองรอบติดกัน'}</p></div>
      </div>
    </article>`;
  }

  function splitHandicap(line) {
    const rounded = Math.round(Number(line) * 4) / 4;
    const quarterIndex = Math.round(Math.abs(rounded) * 4);
    if (quarterIndex % 2 === 1) {
      const lower = Math.floor(rounded * 2) / 2;
      return [lower, lower + 0.5];
    }
    return [rounded];
  }

  function settleAsian(postGoalDifference, line, odds, stake) {
    const parts = splitHandicap(line);
    const stakePart = stake / parts.length;
    const outcomes = [];
    let profit = 0;

    for (const part of parts) {
      const adjusted = postGoalDifference + part;
      if (adjusted > 0.00001) {
        outcomes.push('WIN');
        profit += stakePart * (odds - 1);
      } else if (adjusted < -0.00001) {
        outcomes.push('LOSS');
        profit -= stakePart;
      } else {
        outcomes.push('PUSH');
      }
    }

    let settlement = 'PUSH';
    if (outcomes.every(value => value === 'WIN')) settlement = 'FULL WIN';
    else if (outcomes.every(value => value === 'LOSS')) settlement = 'FULL LOSS';
    else if (outcomes.includes('WIN') && outcomes.includes('PUSH')) settlement = 'HALF WIN';
    else if (outcomes.includes('LOSS') && outcomes.includes('PUSH')) settlement = 'HALF LOSS';
    else if (outcomes.every(value => value === 'PUSH')) settlement = 'PUSH';
    else settlement = 'SPLIT';

    const result = settlement.includes('WIN') ? 'CORRECT'
      : settlement.includes('LOSS') ? 'INCORRECT'
      : 'NEUTRAL';

    return {
      settlement,
      result,
      profitUnits: round2(profit),
      returnedUnits: round2(stake + profit),
      splitLines: parts
    };
  }

  function regulatoryScore(result) {
    const status = String(result.status || '').toUpperCase();
    const fulltimeHome = num(result.fulltime?.home);
    const fulltimeAway = num(result.fulltime?.away);
    if (['AET', 'PEN'].includes(status) && fulltimeHome !== null && fulltimeAway !== null) {
      return { home: fulltimeHome, away: fulltimeAway };
    }
    return { home: num(result.homeScore), away: num(result.awayScore) };
  }

  function applySettlement(trade, result) {
    const status = String(result.status || '').toUpperCase();
    if (!TERMINAL.has(status) && !result.resultConfirmed) return false;

    trade.finalStatus = status;
    trade.settledAt = Date.now();

    if (VOID_STATUS.has(status)) {
      trade.status = 'VOID';
      trade.result = 'NEUTRAL';
      trade.settlement = 'VOID';
      trade.profitUnits = 0;
      trade.returnedUnits = trade.stakeUnits;
      trade.note = `Void by fixture status ${status}`;
      return true;
    }

    const finalScore = regulatoryScore(result);
    if (finalScore.home === null || finalScore.away === null) return false;
    if (finalScore.home < trade.entryHomeScore || finalScore.away < trade.entryAwayScore) {
      trade.status = 'VOID';
      trade.result = 'NEUTRAL';
      trade.settlement = 'VOID';
      trade.profitUnits = 0;
      trade.returnedUnits = trade.stakeUnits;
      trade.note = 'Void in test ledger because final score was lower than entry score';
      return true;
    }

    const postHome = finalScore.home - trade.entryHomeScore;
    const postAway = finalScore.away - trade.entryAwayScore;
    const settlement = settleAsian(postHome - postAway, trade.ahLine, trade.ahOdds, trade.stakeUnits);

    trade.status = 'SETTLED';
    trade.result = settlement.result;
    trade.settlement = settlement.settlement;
    trade.finalHomeScore = finalScore.home;
    trade.finalAwayScore = finalScore.away;
    trade.postEntryHomeGoals = postHome;
    trade.postEntryAwayGoals = postAway;
    trade.profitUnits = settlement.profitUnits;
    trade.returnedUnits = settlement.returnedUnits;
    trade.splitLines = settlement.splitLines;
    return true;
  }

  function chunks(values, size) {
    const output = [];
    for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
    return output;
  }

  async function settlePendingTrades(force = false) {
    if (state.settling) return;
    if (!force && Date.now() - state.lastSettlementAt < SETTLEMENT_MS) return;
    const pending = state.trades.filter(trade => trade.status === 'PENDING');
    if (!pending.length) {
      $('settlementStatus').textContent = 'ไม่มีรายการรอผล';
      return;
    }

    state.settling = true;
    state.lastSettlementAt = Date.now();
    $('settlementStatus').textContent = `กำลังตรวจผล ${pending.length} รายการ`;

    try {
      const resultMap = new Map();
      for (const group of chunks(pending.map(trade => trade.fixtureId), 10)) {
        const response = await fetch(`${WORKER}/fixtures?ids=${group.join(',')}&t=${Date.now()}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) continue;
        for (const result of payload.results || []) resultMap.set(Number(result.fixtureId), result);
      }

      let changed = 0;
      for (const trade of pending) {
        const result = resultMap.get(Number(trade.fixtureId));
        if (result && applySettlement(trade, result)) changed += 1;
      }
      if (changed) saveTrades();
      $('settlementStatus').textContent = changed ? `ตัดสินผลใหม่ ${changed} รายการ` : `รอการแข่งขันจบ ${pending.length} รายการ`;
    } catch (error) {
      $('settlementStatus').textContent = `ตรวจผลไม่สำเร็จ: ${error.message}`;
    } finally {
      state.settling = false;
      renderPaper();
    }
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
      return { index: index + 1, value: cumulative, trade };
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

    const width = 760;
    const height = 220;
    const pad = { left: 46, right: 18, top: 18, bottom: 30 };
    const values = data.map(point => point.value);
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    if (min === max) { min -= 10; max += 10; }
    const range = max - min;
    const x = index => pad.left + index * (width - pad.left - pad.right) / Math.max(1, data.length - 1);
    const y = value => pad.top + (max - value) * (height - pad.top - pad.bottom) / range;
    const points = data.map((point, index) => `${x(index)},${y(point.value)}`).join(' ');
    const zeroY = y(0);
    const last = data.at(-1);

    box.innerHTML = `<svg viewBox="0 0 ${width} ${height}" aria-label="Cumulative net units graph">
      <line x1="${pad.left}" y1="${zeroY}" x2="${width - pad.right}" y2="${zeroY}" stroke="#52675d" stroke-dasharray="5 5"/>
      <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="#29483b"/>
      <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="#29483b"/>
      <polyline points="${points}" fill="none" stroke="${last.value >= 0 ? '#00df91' : '#ff6573'}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
      ${data.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="${index === data.length - 1 ? 5 : 3}" fill="${point.value >= 0 ? '#00df91' : '#ff6573'}"/>`).join('')}
      <text x="8" y="${pad.top + 4}" fill="#91aa9e" font-size="10">${max.toFixed(0)}</text>
      <text x="8" y="${height - pad.bottom + 4}" fill="#91aa9e" font-size="10">${min.toFixed(0)}</text>
      <text x="${width - 155}" y="${Math.max(14, y(last.value) - 9)}" fill="${last.value >= 0 ? '#00df91' : '#ff6573'}" font-size="12" font-weight="800">Net ${last.value >= 0 ? '+' : ''}${last.value} Units</text>
      <text x="${pad.left}" y="${height - 8}" fill="#91aa9e" font-size="10">0</text>
      <text x="${width - pad.right - 12}" y="${height - 8}" fill="#91aa9e" font-size="10">${data.length - 1}</text>
    </svg>`;
  }

  function tradeStatusClass(trade) {
    if (trade.status === 'PENDING') return 'pending';
    if (trade.result === 'CORRECT') return 'win';
    if (trade.result === 'INCORRECT') return 'loss';
    return 'neutral';
  }

  function renderTrades() {
    const box = $('tradeList');
    if (!state.trades.length) {
      box.innerHTML = '<div class="empty">ยังไม่มีรายการลงทุน</div>';
      return;
    }

    box.innerHTML = [...state.trades].sort((a, b) => b.createdAt - a.createdAt).map(trade => {
      const line = `${trade.ahLine >= 0 ? '+' : ''}${trade.ahLine}`;
      const profit = num(trade.profitUnits) || 0;
      const finalText = trade.status === 'PENDING'
        ? 'รอผลการแข่งขัน'
        : trade.settlement === 'VOID'
          ? 'ยกเลิกรายการ · คืน 100 Units'
          : `Final ${trade.finalHomeScore}-${trade.finalAwayScore} · หลัง Alert ${trade.postEntryHomeGoals}-${trade.postEntryAwayGoals}`;
      return `<article class="trade">
        <div class="trade-top"><b>${escapeHtml(trade.home)} vs ${escapeHtml(trade.away)}</b><span class="trade-status ${tradeStatusClass(trade)}">${trade.settlement}</span></div>
        <div class="trade-meta">Alert ${trade.entryMinute}′ · Entry ${trade.entryHomeScore}-${trade.entryAwayScore} · ${escapeHtml(trade.scoreState)} · Momentum ${trade.momentum}%<br>Home AH ${line} @ ${trade.ahOdds} · Investment ${trade.stakeUnits} Units<br>${finalText}</div>
        <div class="trade-profit ${profit > 0 ? 'green' : profit < 0 ? 'red' : 'yellow'}">${trade.status === 'PENDING' ? 'PENDING' : `ผล ${trade.result === 'CORRECT' ? 'ถูก' : trade.result === 'INCORRECT' ? 'ผิด' : 'กลาง'} · ${profit >= 0 ? '+' : ''}${profit} Units · Return ${trade.returnedUnits} Units`}</div>
      </article>`;
    }).join('');
  }

  function renderPaper() {
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
    const counts = payload.counts || {};
    $('allLive').textContent = counts.allLive ?? 0;
    $('minuteWindow').textContent = counts.minute60To80 ?? counts.tiedMinute60To80 ?? 0;
    $('completeStats').textContent = counts.completeStats ?? 0;
    $('completeMarkets').textContent = counts.completeMarkets ?? 0;
    $('baseCandidates').textContent = counts.baseCandidates ?? 0;
    $('updatedAt').textContent = `${new Date(payload.generatedAt || Date.now()).toLocaleString()} · cache 60s`;

    const activeIds = new Set();
    const rows = [];
    for (const candidate of payload.candidates || []) {
      const id = String(candidate.fixtureId);
      const fixture = fixtureState(id);
      const stamp = payload.generatedAt || new Date().toISOString();
      const snapshot = { stamp, minute: candidate.minute, stats: candidate.stats };
      activeIds.add(id);
      candidate.sampleStamp = stamp;

      if (!fixture.snapshots.length || fixture.snapshots.at(-1).stamp !== stamp) {
        fixture.snapshots.push(snapshot);
        fixture.snapshots = fixture.snapshots.slice(-8);
      }
      const momentum = calculateMomentum(fixture, snapshot);
      if (momentum && (!fixture.points.length || fixture.points.at(-1).stamp !== stamp)) {
        fixture.points.push({ stamp, home: momentum.home, away: momentum.away });
        fixture.points = fixture.points.slice(-20);
      }
      rows.push({ candidate, fixture, momentum });
    }

    for (const [id, fixture] of state.fixtures) {
      if (!activeIds.has(id)) {
        fixture.streak = 0;
        fixture.triggered = false;
        fixture.lastProcessedStamp = null;
      }
    }

    rows.sort((a, b) =>
      Number(b.fixture.triggered) - Number(a.fixture.triggered) ||
      (b.momentum?.home || 0) - (a.momentum?.home || 0) ||
      Number(b.candidate.goalDifference || 0) - Number(a.candidate.goalDifference || 0)
    );

    $('cards').innerHTML = rows.length
      ? rows.map(row => renderCard(row.candidate, row.fixture, row.momentum)).join('')
      : '<div class="empty"><b>ยังไม่มีคู่เจ้าบ้านผ่านตัวกรองพื้นฐาน</b><br>Worker ตรวจทุกสกอร์ในนาที 60–80 แล้ว แต่ยังไม่มีคู่ที่สถิติ ราคา AH และใบแดงครบตามเงื่อนไขก่อน Momentum</div>';
    $('conditionHits').textContent = rows.filter(row => row.fixture.triggered).length;
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
      await settlePendingTrades(false);
      state.timer = setTimeout(scan, POLL_MS);
    }
  }

  function updateCountdown() {
    const seconds = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
    $('nextScan').textContent = `Next scan in ${seconds}s · keep this page open`;
  }

  $('notifyButton')?.addEventListener('click', enableNotifications);
  updateNotifyButton();
  renderAlertLog();
  renderPaper();
  setInterval(updateCountdown, 1_000);
  settlePendingTrades(true);
  scan();
})();