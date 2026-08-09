(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const STATUS_URL = `${WORKER}/v2/live-status`;
  const CACHE_KEY = 'nomadtips3.car3.page5.v2.last-good';
  const POLL_MS = 30_000;
  const TIMEOUT_MS = 7_000;
  const $ = id => document.getElementById(id);

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function fmtLine(value) {
    const n = number(value);
    return n === null ? 'N/A' : `${n >= 0 ? '+' : ''}${n}`;
  }

  function conditionText(config = {}) {
    const side = config.side === 'BOTH' ? 'ทั้งสองทีม' : config.side === 'AWAY' ? 'ทีมเยือน' : 'ทีมเจ้าบ้าน';
    const market = config.market === 'AH' ? 'AH' : 'WIN';
    const oddsMax = config.oddsMax === null || config.oddsMax === undefined ? '∞' : config.oddsMax;
    const ahMax = config.ahMax === null || config.ahMax === undefined ? '∞' : fmtLine(config.ahMax);
    const evidence = config.attackEvidenceEnabled === false ? 'Evidence OFF' : 'Evidence ON';
    const gap = config.goalGapLimited ? `Gap ≤ ${config.maxGoalGap}` : 'ทุกสกอร์';
    const limit = config.signalLimitEnabled ? `Max ${config.maxSignalsPerDay}/day` : 'Unlimited signals';
    return `${side} · ${config.minuteMin ?? '?'}–${config.minuteMax ?? '?'}′ · ${market} · Odds ${config.oddsMin ?? '?'}–${oddsMax} · AH ${fmtLine(config.ahMin)}–${ahMax} · Momentum ≥ ${config.momentumMin ?? '?'}% · ${evidence} · ${gap} · Confirm ${config.confirmationRounds ?? '?'} · ${limit}`;
  }

  function saveLastGood(payload) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
  }

  function readLastGood() {
    try {
      const payload = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return payload && typeof payload === 'object' ? payload : null;
    } catch { return null; }
  }

  function renderCandidate(candidate) {
    const triggered = Boolean(candidate.serverTriggered);
    const actualHome = candidate.actualHome || (candidate.selectedSide === 'AWAY' ? candidate.away : candidate.home) || 'Home';
    const actualAway = candidate.actualAway || (candidate.selectedSide === 'AWAY' ? candidate.home : candidate.away) || 'Away';
    const scoreHome = candidate.actualScore?.home ?? candidate.score?.home ?? 0;
    const scoreAway = candidate.actualScore?.away ?? candidate.score?.away ?? 0;
    const momentum = number(candidate.serverMomentum?.home);
    const selectedOdds = number(candidate.markets?.selectedOdds);
    const ahLine = number(candidate.markets?.homeAh);
    const ahOdds = number(candidate.markets?.homeAhOdds);
    const selected = candidate.selectedSide === 'AWAY' ? 'AWAY' : 'HOME';
    const streak = Number(candidate.serverStreak || 0);
    return `<article class="card ${triggered ? 'triggered' : ''}">
      <div class="cardhead"><span>${escapeHtml(candidate.country || '')} · ${escapeHtml(candidate.league || '')} · ${escapeHtml(candidate.fixtureId || '')}</span><span class="badge">${triggered ? 'MATCHED' : 'MONITORING'}</span></div>
      <div class="body">
        <div class="match">
          <div class="team"><strong>${escapeHtml(actualHome)}</strong><small>HOME${selected === 'HOME' ? ' · SELECTED' : ''}</small></div>
          <div class="score"><span>${escapeHtml(candidate.minute ?? '—')}′</span><b>${escapeHtml(scoreHome)} : ${escapeHtml(scoreAway)}</b></div>
          <div class="team"><strong>${escapeHtml(actualAway)}</strong><small>AWAY${selected === 'AWAY' ? ' · SELECTED' : ''}</small></div>
        </div>
        <div class="facts">
          <div class="fact"><small>Momentum</small><b class="${momentum !== null ? 'green' : 'yellow'}">${momentum === null ? 'SEEDING' : `${momentum}%`}</b></div>
          <div class="fact"><small>Confirm streak</small><b>${streak}</b></div>
          <div class="fact"><small>Selected Odds</small><b>${selectedOdds?.toFixed(2) ?? 'N/A'}</b></div>
          <div class="fact"><small>AH Line</small><b>${fmtLine(ahLine)}</b></div>
          <div class="fact"><small>AH Odds</small><b>${ahOdds?.toFixed(2) ?? 'N/A'}</b></div>
          <div class="fact"><small>Selected side</small><b class="green">${selected}</b></div>
        </div>
      </div>
    </article>`;
  }

  function render(payload, fromCache = false) {
    const counts = payload.counts || {};
    $('allLive').textContent = counts.allLive ?? 0;
    $('minuteWindow').textContent = counts.minuteWindow ?? counts.minute60To80 ?? 0;
    $('completeStats').textContent = counts.completeStats ?? 0;
    $('completeMarkets').textContent = counts.completeMarkets ?? 0;
    $('baseCandidates').textContent = counts.baseCandidates ?? counts.serverCandidates ?? 0;
    $('triggered').textContent = counts.triggered ?? 0;
    $('priceGate').textContent = String(counts.priceGateDiagnosis || '—').replaceAll('_', ' ');
    $('oddsSource').textContent = counts.liveOddsSource || '—';
    $('conditionSummary').textContent = conditionText(payload.config || {});

    const engineMode = payload.engine?.mode || (payload.enginePaused ? payload.engineMode : 'RUNNING');
    const state = fromCache || payload.stale ? 'LAST GOOD DATA' : engineMode;
    const engine = $('engineState');
    engine.textContent = state;
    engine.className = `state ${state === 'RUNNING' ? 'ok' : state === 'LAST GOOD DATA' ? 'warn' : 'bad'}`;

    const generated = payload.generatedAt ? new Date(payload.generatedAt) : null;
    $('updatedAt').textContent = generated && Number.isFinite(generated.getTime())
      ? `${generated.toLocaleString('th-TH')} · D1 stored scan`
      : 'ยังไม่มีเวลาสแกน';
    $('freshness').textContent = fromCache
      ? 'Worker ช้า · แสดงสำเนาล่าสุดในเบราว์เซอร์'
      : payload.stale
        ? `ข้อมูลเก่า ${payload.staleAgeSeconds ?? '?'} วินาที · รอ background scanner`
        : 'ข้อมูลจาก background scanner · Browser ไม่ยิง API';

    const rows = Array.isArray(payload.candidates) ? payload.candidates.slice(0, 60) : [];
    $('cards').innerHTML = rows.length
      ? rows.map(renderCandidate).join('')
      : '<div class="empty">ยังไม่มีคู่ผ่านตัวกรองพื้นฐานในผลสแกนล่าสุด</div>';

    const warnings = Array.isArray(payload.warnings) ? payload.warnings.filter(Boolean).slice(-5) : [];
    const warning = $('warning');
    if (payload.scannerError) warnings.push(payload.scannerError);
    if (warnings.length) {
      warning.hidden = false;
      warning.textContent = warnings.join(' · ');
    } else {
      warning.hidden = true;
      warning.textContent = '';
    }
  }

  async function load() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${STATUS_URL}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      render(payload, false);
      saveLastGood(payload);
    } catch (error) {
      const cached = readLastGood();
      if (cached) {
        render(cached, true);
        const warning = $('warning');
        warning.hidden = false;
        warning.textContent = `V2 status fetch failed: ${error?.message || error} · ใช้ Last Good Data ชั่วคราว`;
      } else {
        $('engineState').textContent = 'WAITING';
        $('engineState').className = 'state warn';
        $('cards').innerHTML = `<div class="empty">ยังอ่าน Worker ไม่สำเร็จ<br>${escapeHtml(error?.message || error)}</div>`;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  load();
  setInterval(load, POLL_MS);
})();
