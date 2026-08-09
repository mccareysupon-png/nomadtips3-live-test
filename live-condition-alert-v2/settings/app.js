(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const $ = id => document.getElementById(id);
  const ids = ['side','minuteMin','minuteMax','market','oddsMin','oddsMax','ahMin','ahMax','momentumMin','attackEvidenceMode','gapMode','maxGoalGap','confirmationRounds','limitMode','maxSignalsPerDay'];
  let serverState = null;

  function sideLabel(value) {
    if (value === 'AWAY') return 'ทีมเยือน';
    if (value === 'BOTH') return 'ทั้งสองทีม';
    return 'ทีมเจ้าบ้าน';
  }

  function fmtLine(value) {
    if (value === null || value === undefined || value === '') return 'ไม่จำกัด';
    const n = Number(value);
    return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n}` : 'ไม่จำกัด';
  }

  function optional(id) {
    const text = $(id).value.trim();
    return text === '' ? null : Number(text);
  }

  function configText(config) {
    if (!config) return 'ยังไม่มีข้อมูล';
    const oddsMax = config.oddsMax === null || config.oddsMax === undefined ? 'ไม่จำกัด' : Number(config.oddsMax).toFixed(2);
    const evidence = config.attackEvidenceEnabled === false ? 'Evidence ปิด' : 'Evidence เปิด';
    const gap = config.goalGapLimited ? `ผลต่าง ≤ ${config.maxGoalGap}` : 'ทุกสกอร์';
    const limit = config.signalLimitEnabled ? `สูงสุด ${config.maxSignalsPerDay}/วัน` : 'สัญญาณไม่จำกัด';
    return `${sideLabel(config.side)} · นาที ${config.minuteMin}–${config.minuteMax} · ${config.market === 'AH' ? 'Asian Handicap' : 'ชนะตรง'} · Odds ${Number(config.oddsMin).toFixed(2)}–${oddsMax} · AH ${fmtLine(config.ahMin)}–${fmtLine(config.ahMax)} · Momentum ≥ ${config.momentumMin}% · ${evidence} · ${gap} · ยืนยัน ${config.confirmationRounds} รอบ · ${limit}`;
  }

  function updateDisabled() {
    $('maxGoalGap').disabled = $('gapMode').value !== 'LIMITED';
    $('maxSignalsPerDay').disabled = $('limitMode').value !== 'LIMITED';
  }

  function fill(config) {
    if (!config) return;
    $('side').value = config.side;
    $('minuteMin').value = config.minuteMin;
    $('minuteMax').value = config.minuteMax;
    $('market').value = config.market;
    $('oddsMin').value = config.oddsMin;
    $('oddsMax').value = config.oddsMax ?? '';
    $('ahMin').value = config.ahMin;
    $('ahMax').value = config.ahMax ?? '';
    $('momentumMin').value = config.momentumMin;
    $('attackEvidenceMode').value = config.attackEvidenceEnabled === false ? 'OFF' : 'ON';
    $('gapMode').value = config.goalGapLimited ? 'LIMITED' : 'UNLIMITED';
    $('maxGoalGap').value = config.maxGoalGap;
    $('confirmationRounds').value = config.confirmationRounds;
    $('limitMode').value = config.signalLimitEnabled ? 'LIMITED' : 'UNLIMITED';
    $('maxSignalsPerDay').value = config.maxSignalsPerDay;
    updateDisabled();
    updateDraftSummary();
  }

  function readForm() {
    const minuteMin = Number($('minuteMin').value);
    const minuteMax = Number($('minuteMax').value);
    const oddsMin = Number($('oddsMin').value);
    const ahMin = Number($('ahMin').value);
    const momentumMin = Number($('momentumMin').value);
    const confirmationRounds = Number($('confirmationRounds').value);
    const maxGoalGap = Number($('maxGoalGap').value);
    const maxSignalsPerDay = Number($('maxSignalsPerDay').value);
    if (!Number.isFinite(minuteMin) || !Number.isFinite(minuteMax) || minuteMin >= minuteMax) throw new Error('นาทีเริ่มต้องน้อยกว่านาทีสิ้นสุด');
    if (!Number.isFinite(oddsMin) || oddsMin < 1.01) throw new Error('Odds ขั้นต่ำไม่ถูกต้อง');
    if (!Number.isFinite(ahMin)) throw new Error('AH Line ขั้นต่ำไม่ถูกต้อง');
    if (!Number.isFinite(momentumMin) || momentumMin < 1 || momentumMin > 99) throw new Error('Momentum ต้องอยู่ระหว่าง 1–99%');
    if (!Number.isFinite(confirmationRounds) || confirmationRounds < 1) throw new Error('จำนวนรอบยืนยันไม่ถูกต้อง');
    return {
      side: $('side').value,
      minuteMin,
      minuteMax,
      market: $('market').value,
      oddsMin,
      oddsMax: optional('oddsMax'),
      ahMin,
      ahMax: optional('ahMax'),
      momentumMin,
      attackEvidenceEnabled: $('attackEvidenceMode').value === 'ON',
      goalGapLimited: $('gapMode').value === 'LIMITED',
      maxGoalGap,
      confirmationRounds,
      signalLimitEnabled: $('limitMode').value === 'LIMITED',
      maxSignalsPerDay
    };
  }

  function updateDraftSummary() {
    try { $('draftSummary').textContent = configText(readForm()); }
    catch (error) { $('draftSummary').textContent = error.message; }
  }

  function setMessage(text, good = true) {
    const el = $('message');
    el.textContent = text;
    el.className = `message ${good ? 'good' : 'bad'}`;
  }

  function busy(value) {
    ['reloadButton','saveButton','runButton'].forEach(id => { $(id).disabled = value; });
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${WORKER}${path}`, {
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
        signal: controller.signal
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
      return payload;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadActive() {
    busy(true);
    try {
      const payload = await request('/condition-config');
      serverState = payload;
      const active = payload.active || payload.draft || payload.defaults;
      fill(active);
      $('activeSummary').textContent = configText(payload.active || active);
      $('activeMeta').textContent = payload.active
        ? `Version ${payload.active.version ?? '?'} · Activated ${payload.active.activatedAt ? new Date(payload.active.activatedAt).toLocaleString('th-TH') : '—'}`
        : 'ยังไม่มี Active Version';
      setMessage('โหลด Active Condition เดิมจาก D1 แล้ว', true);
    } catch (error) {
      setMessage(`โหลดไม่สำเร็จ: ${error.message}`, false);
    } finally {
      busy(false);
    }
  }

  async function submit(action) {
    let config;
    try { config = readForm(); }
    catch (error) { setMessage(error.message, false); return; }
    busy(true);
    try {
      const payload = await request('/condition-config', {
        method: 'POST',
        body: JSON.stringify({ action, config })
      });
      serverState = payload;
      const active = payload.active || config;
      $('activeSummary').textContent = configText(active);
      $('activeMeta').textContent = `Version ${active.version ?? '?'} · Activated ${active.activatedAt ? new Date(active.activatedAt).toLocaleString('th-TH') : '—'}`;
      setMessage(action === 'run' ? 'RUN แล้ว · Car 3 V2 จะใช้ค่านี้ใน background scan รอบถัดไป' : 'บันทึก Draft แล้ว · Active ยังไม่เปลี่ยน', true);
    } catch (error) {
      setMessage(`${action.toUpperCase()} ไม่สำเร็จ: ${error.message}`, false);
    } finally {
      busy(false);
    }
  }

  ids.forEach(id => $(id)?.addEventListener('input', updateDraftSummary));
  $('gapMode').addEventListener('change', () => { updateDisabled(); updateDraftSummary(); });
  $('limitMode').addEventListener('change', () => { updateDisabled(); updateDraftSummary(); });
  $('reloadButton').addEventListener('click', loadActive);
  $('saveButton').addEventListener('click', () => submit('save'));
  $('runButton').addEventListener('click', () => submit('run'));
  loadActive();
})();
