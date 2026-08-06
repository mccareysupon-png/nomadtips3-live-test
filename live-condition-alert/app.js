(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const POLL_MS = 60_000;
  const STORAGE_KEY = 'nomadtips3.page5.home-any-score.v2';
  const WEIGHTS = {
    attacks: 0.16,
    dangerous_attacks: 0.52,
    shots: 2,
    shots_on_target: 4,
    corners: 1.25
  };

  const state = {
    fixtures: new Map(),
    alerts: loadAlerts(),
    timer: null,
    nextAt: Date.now()
  };

  const $ = id => document.getElementById(id);
  const number = value => {
    const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  function loadAlerts() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAlerts() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.alerts.slice(0, 30)));
    } catch {
      // Local storage is optional for this isolated test.
    }
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
      const now = number(current.stats[key]?.[side]);
      const old = number(base?.stats?.[key]?.[side]);
      const delta = old === null ? 0 : Math.max(0, (now ?? 0) - old);
      weighted += delta * weight;

      if (['dangerous_attacks', 'shots', 'shots_on_target', 'corners'].includes(key)) {
        evidence += delta;
      }
    }

    weighted += Math.max(0, number(current.stats.possession?.[side]) || 0) * 0.07;
    return { weighted, evidence };
  }

  function calculateMomentum(fixture, current) {
    if (fixture.snapshots.length < 2) return null;

    const eligibleBases = fixture.snapshots.filter(snapshot =>
      snapshot.stamp !== current.stamp && snapshot.minute >= current.minute - 5
    );
    const base = eligibleBases[0] || fixture.snapshots.at(-2);
    const home = activity(current, base, 'home');
    const away = activity(current, base, 'away');
    const total = home.weighted + away.weighted;

    let homePercent = total > 0 ? (home.weighted / total) * 100 : 50;
    const previous = fixture.points.at(-1);
    if (previous) {
      homePercent = previous.home * 0.55 + homePercent * 0.45;
    }

    homePercent = Math.round(clamp(homePercent, 0, 100));
    return {
      home: homePercent,
      away: 100 - homePercent,
      evidence: home.evidence
    };
  }

  function chart(points) {
    const data = points.slice(-15);
    if (!data.length) return '';

    const width = 580;
    const height = 78;
    const x = index => 10 + (data.length === 1 ? 280 : index * 560 / (data.length - 1));
    const y = value => 7 + (100 - value) * 0.64;
    const home = data.map((point, index) => `${x(index)},${y(point.home)}`).join(' ');
    const away = data.map((point, index) => `${x(index)},${y(point.away)}`).join(' ');

    return `<svg viewBox="0 0 ${width} ${height}" aria-label="NOMAD Momentum graph">
      <line x1="10" y1="39" x2="570" y2="39" stroke="#365448" stroke-dasharray="4 4" />
      <polyline points="${home}" fill="none" stroke="#00df91" stroke-width="3" stroke-linejoin="round" />
      <polyline points="${away}" fill="none" stroke="#ff6573" stroke-width="3" stroke-linejoin="round" />
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
          ? 'เจ้าบ้านตามหนึ่งลูก ประตูถัดไปอาจทำให้เสมอ แต่ Home Win ยังต้องมีโอกาสยิงเพิ่มอีก จึงเสี่ยงกว่าสถานะเสมอหรือนำ'
          : `เจ้าบ้านตาม ${behind} ลูก ประตูเดียวอาจยังไม่พอให้ Home Win หรือ AH ชนะ สัญญาณนี้จึงเป็นสถานการณ์เสี่ยงสูงแม้ Momentum ผ่าน`
      };
    }

    return {
      label: 'สกอร์เสมอ',
      css: 'tied',
      risk: 'สกอร์เสมอ ประตูของเจ้าบ้านจะทำให้ขึ้นนำทันที จึงสอดคล้องกับ Home Win มากกว่าสถานะที่เจ้าบ้านกำลังตาม'
    };
  }

  function recordAlert(candidate, momentum) {
    const key = `${candidate.fixtureId}:${Math.floor(candidate.minute / 3)}`;
    if (state.alerts.some(alert => alert.key === key)) return;

    const score = scoreView(candidate);
    state.alerts.unshift({
      key,
      at: Date.now(),
      match: `${candidate.home} vs ${candidate.away}`,
      minute: candidate.minute,
      score: `${candidate.score.home}-${candidate.score.away}`,
      scoreState: score.label,
      momentum: momentum.home,
      win: candidate.markets.homeWin,
      ah: candidate.markets.homeAh
    });
    saveAlerts();
    renderLog();
  }

  function renderLog() {
    const box = $('alertLog');
    if (!state.alerts.length) {
      box.innerHTML = '<div>ยังไม่มี Alert</div>';
      return;
    }

    box.innerHTML = state.alerts.map(alert => `
      <div>
        <b>${escapeHtml(alert.match)}</b> · ${escapeHtml(alert.score)} · ${escapeHtml(alert.scoreState)}<br>
        ${alert.minute}′ · Momentum ${alert.momentum}% · Win ${alert.win} · AH ${alert.ah >= 0 ? '+' : ''}${alert.ah} · ${new Date(alert.at).toLocaleString()}
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

    if (fixture.triggered && momentum) {
      recordAlert(candidate, momentum);
    }

    const homeMomentum = ready ? momentum.home : '—';
    const awayMomentum = ready ? momentum.away : '—';
    const homeWidth = ready ? momentum.home : 50;
    const awayWidth = ready ? momentum.away : 50;
    const status = fixture.triggered
      ? 'เข้าเงื่อนไข'
      : !ready
        ? 'เก็บตัวอย่าง'
        : pass
          ? 'รอยืนยันรอบ 2'
          : 'กำลังตรวจ';
    const score = scoreView(candidate);
    const ah = candidate.markets.homeAh;

    return `<article class="card ${fixture.triggered ? 'triggered' : ''}">
      <div class="card-head">
        <span>${escapeHtml(candidate.country)} · ${escapeHtml(candidate.league)} · ${candidate.fixtureId}</span>
        <b class="badge ${fixture.triggered ? 'ok' : ''}">${status}</b>
      </div>
      <div class="card-body">
        <div>
          <div class="match">
            <div class="team"><strong>${escapeHtml(candidate.home)}</strong><small>HOME ONLY</small></div>
            <div class="score">
              <span>${candidate.minute}′</span>
              <b>${candidate.score.home} : ${candidate.score.away}</b>
              <em class="${score.css}">${score.label}</em>
            </div>
            <div class="team"><strong>${escapeHtml(candidate.away)}</strong><small>AWAY</small></div>
          </div>
          <div class="momentum">
            <div class="momentum-top">
              <small>NOMAD MOMENTUM · ROLLING 5 MIN</small>
              <b><em>${homeMomentum}</em> – <i>${awayMomentum}</i></b>
            </div>
            <div class="bar">
              <span class="home" style="width:${homeWidth}%"></span>
              <span class="away" style="width:${awayWidth}%"></span>
            </div>
            <div class="chart">${chart(fixture.points)}</div>
          </div>
        </div>

        <div class="facts">
          <div class="fact"><small>Required Momentum</small><b class="${momentumPass ? 'green' : 'yellow'}">${threshold}%</b></div>
          <div class="fact"><small>Consecutive scans</small><b class="${fixture.streak >= 2 ? 'green' : 'yellow'}">${fixture.streak} / 2</b></div>
          <div class="fact"><small>Home Win</small><b class="green">${Number(candidate.markets.homeWin).toFixed(2)}</b></div>
          <div class="fact"><small>Home AH</small><b class="green">${ah >= 0 ? '+' : ''}${ah}</b></div>
          <div class="fact"><small>Complete stats</small><b class="green">6 / 6</b></div>
          <div class="fact"><small>Red cards H–A</small><b class="green">${candidate.redCards.home}–${candidate.redCards.away}</b></div>
          <div class="fact"><small>Attack evidence</small><b class="${evidencePass ? 'green' : 'yellow'}">${ready ? momentum.evidence : 'WAIT'}</b></div>
          <div class="fact"><small>Score restriction</small><b class="green">NONE</b></div>
        </div>

        <div class="analysis"><b>วิเคราะห์ตามสกอร์:</b> ${score.risk}</div>
        <div class="alert">
          <strong>${fixture.triggered ? 'เข้าเงื่อนไข' : status}</strong>
          <p>${fixture.triggered
            ? `${escapeHtml(candidate.home)} · ${score.label} · Momentum ${momentum.home}% · Win ${candidate.markets.homeWin} · AH ${ah >= 0 ? '+' : ''}${ah}`
            : 'สกอร์ไม่ใช้ตัดคู่ แต่ Momentum และหลักฐานการบุกต้องผ่านสองรอบติดกัน'}</p>
        </div>
      </div>
    </article>`;
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
      const snapshot = {
        stamp,
        minute: candidate.minute,
        stats: candidate.stats
      };

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

    const cards = $('cards');
    cards.innerHTML = rows.length
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
      const response = await fetch(`${WORKER}/live-condition-scan?t=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);

      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      processPayload(payload);
    } catch (error) {
      $('cards').innerHTML = `<div class="empty"><b>Worker กำลัง Deploy หรือเชื่อมต่อไม่สำเร็จ</b><br>${escapeHtml(error.message)}<br>จะลองใหม่ใน 60 วินาที</div>`;
    } finally {
      state.timer = setTimeout(scan, POLL_MS);
    }
  }

  function updateCountdown() {
    const seconds = Math.max(0, Math.ceil((state.nextAt - Date.now()) / 1000));
    $('nextScan').textContent = `Next scan in ${seconds}s · keep this page open`;
  }

  renderLog();
  setInterval(updateCountdown, 1_000);
  scan();
})();
