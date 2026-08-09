(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const POLL_MS = 30_000;
  let busy = false;

  const style = document.createElement('style');
  style.textContent = `
    .engine-monitor{margin:12px 0 16px;padding:15px;border-radius:17px;background:linear-gradient(180deg,#1b1e23,#121418)}
    .engine-monitor-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
    .engine-monitor h2{margin:0;font-size:14px}.engine-monitor-sub{margin-top:5px;color:#91aa9e;font-size:9px;line-height:1.45}
    .engine-state{padding:6px 10px;border-radius:999px;font-size:10px;font-weight:950;white-space:nowrap;background:#2a2d33}
    .engine-state.running{color:#00df91}.engine-state.degraded,.engine-state.maintenance{color:#f2c94c}.engine-state.stalled,.engine-state.needs_add_k{color:#ff6573}.engine-state.stopped{color:#b8bec8}
    .engine-monitor-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .engine-health-cell{padding:10px;border-radius:11px;background:#24272d;min-width:0}.engine-health-cell small{display:block;color:#91aa9e;font-size:8px}.engine-health-cell b{display:block;margin-top:4px;font-size:11px;overflow-wrap:anywhere}.engine-health-cell .ok{color:#00df91}.engine-health-cell .warn{color:#f2c94c}.engine-health-cell .bad{color:#ff6573}
    .engine-error{margin-top:9px;padding:10px;border-radius:11px;background:#292c32;color:#c8d2cd;font-size:10px;line-height:1.5;overflow-wrap:anywhere}.engine-error strong{color:#fff}
    .engine-controls{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}.engine-controls button{border:0;border-radius:10px;padding:9px 12px;background:#2a2d33;color:#eef5f1;font:inherit;font-size:10px;font-weight:900;cursor:pointer}.engine-controls button.run{background:#0d6948;color:#b9ffe1}.engine-controls button.maintenance{background:#5c4e1f;color:#ffe49b}.engine-controls button.stop{background:#5b2930;color:#ffc4ca}.engine-controls button:disabled{opacity:.42;cursor:default}
    .engine-control-message{margin-top:8px;min-height:14px;color:#91aa9e;font-size:9px}.engine-control-message.good{color:#00df91}.engine-control-message.bad{color:#ff6573}
    @media(max-width:760px){.engine-monitor-grid{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:520px){.engine-monitor-head{flex-direction:column}.engine-monitor-grid{grid-template-columns:1fr}.engine-controls{display:grid;grid-template-columns:1fr}.engine-controls button{width:100%}}
  `;
  document.head.appendChild(style);

  const monitor = document.createElement('section');
  monitor.className = 'engine-monitor';
  monitor.innerHTML = `
    <div class="engine-monitor-head">
      <div><h2>Engine Monitor · Add K Watchdog</h2><div class="engine-monitor-sub">ตรวจสุขภาพทุก 15 นาที · Monitor อ่านสถานะภายใน ไม่ยิง Football API เพิ่ม</div></div>
      <span id="engineMonitorState" class="engine-state">LOADING</span>
    </div>
    <div class="engine-monitor-grid">
      <div class="engine-health-cell"><small>Worker</small><b id="monWorker">—</b></div>
      <div class="engine-health-cell"><small>Live Scan</small><b id="monScan">—</b></div>
      <div class="engine-health-cell"><small>Football API Guard</small><b id="monApi">—</b></div>
      <div class="engine-health-cell"><small>D1 / Paper Ledger</small><b id="monD1">—</b></div>
      <div class="engine-health-cell"><small>Last Attempt</small><b id="monAttempt">—</b></div>
      <div class="engine-health-cell"><small>Last Successful Scan</small><b id="monSuccess">—</b></div>
      <div class="engine-health-cell"><small>Consecutive Failures</small><b id="monFailures">0</b></div>
      <div class="engine-health-cell"><small>Watchdog / Next Check</small><b id="monWatchdog">—</b></div>
      <div class="engine-health-cell"><small>Last Recovery</small><b id="monRecovery">—</b></div>
      <div class="engine-health-cell"><small>Paper Pending</small><b id="monPending">—</b></div>
      <div class="engine-health-cell"><small>Using Last Good Data</small><b id="monStale">NO</b></div>
      <div class="engine-health-cell"><small>Owner Mode</small><b id="monMode">—</b></div>
    </div>
    <div id="monError" class="engine-error"><strong>Last Error:</strong> —</div>
    <div class="engine-controls">
      <button type="button" class="run" data-mode="RUNNING">▶ START / RUNNING</button>
      <button type="button" class="maintenance" data-mode="MAINTENANCE">🟡 MAINTENANCE</button>
      <button type="button" class="stop" data-mode="STOPPED">■ STOP ENGINE</button>
    </div>
    <div id="engineControlMessage" class="engine-control-message"></div>
  `;

  const status = document.querySelector('.status');
  if (status) status.insertAdjacentElement('afterend', monitor);
  else document.querySelector('.wrap')?.prepend(monitor);

  const $ = id => document.getElementById(id);
  const fmt = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString('th-TH') : String(value);
  };
  const set = (id, text, cls = '') => {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = cls;
  };
  const stateClass = state => String(state || '').toLowerCase();

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
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
      clearTimeout(timeout);
    }
  }

  function render(payload) {
    const state = payload.state || payload.control?.mode || 'UNKNOWN';
    const stateEl = $('engineMonitorState');
    stateEl.textContent = state.replaceAll('_', ' ');
    stateEl.className = `engine-state ${stateClass(state)}`;

    const mode = payload.control?.mode || 'UNKNOWN';
    set('monWorker', payload.worker?.ok ? 'ONLINE' : 'ERROR', payload.worker?.ok ? 'ok' : 'bad');
    set('monScan', payload.liveScan?.usingLastGoodData ? 'DEGRADED · LAST GOOD DATA' : state, ['RUNNING'].includes(state) ? 'ok' : ['DEGRADED','MAINTENANCE'].includes(state) ? 'warn' : 'bad');

    const cooldown = Boolean(payload.api?.cooldownActive);
    const apiText = cooldown
      ? `COOLDOWN · ${payload.api?.consecutive429 || 0} strike(s)`
      : payload.api?.ok ? 'OK · GUARD ACTIVE' : 'STATUS ERROR';
    set('monApi', apiText, cooldown ? 'warn' : payload.api?.ok ? 'ok' : 'bad');

    set('monD1', payload.d1?.ok ? 'ONLINE' : 'ERROR', payload.d1?.ok ? 'ok' : 'bad');
    set('monAttempt', fmt(payload.liveScan?.lastAttemptAt));
    set('monSuccess', fmt(payload.liveScan?.lastSuccessfulScanAt));
    const failures = Number(payload.liveScan?.consecutiveFailures || 0);
    set('monFailures', String(failures), failures === 0 ? 'ok' : failures < 10 ? 'warn' : 'bad');
    set('monWatchdog', `${payload.watchdog?.action || 'NONE'} · ${fmt(payload.watchdog?.nextCheckAt)}`, payload.watchdog?.action === 'NONE' ? 'ok' : 'warn');
    set('monRecovery', payload.watchdog?.lastRecoveryAt ? `${fmt(payload.watchdog.lastRecoveryAt)} · ${payload.watchdog.lastRecoveryResult || ''}` : '—');
    set('monPending', String(payload.d1?.paper?.pending ?? '—'));
    set('monStale', payload.liveScan?.usingLastGoodData ? 'YES · DEGRADED' : 'NO', payload.liveScan?.usingLastGoodData ? 'warn' : 'ok');
    set('monMode', mode, mode === 'RUNNING' ? 'ok' : mode === 'MAINTENANCE' ? 'warn' : 'bad');

    $('monError').innerHTML = `<strong>Last Error:</strong> ${payload.liveScan?.lastError ? `${payload.liveScan.lastErrorCode || 'ERROR'} · ${payload.liveScan.lastError}` : '—'}`;
    const engineState = $('engineState');
    if (engineState) engineState.value = `${mode} · ${state}`;

    monitor.querySelectorAll('[data-mode]').forEach(button => {
      button.disabled = busy || button.dataset.mode === mode;
    });
  }

  function message(text, good = true) {
    const el = $('engineControlMessage');
    el.textContent = text;
    el.className = `engine-control-message ${good ? 'good' : 'bad'}`;
  }

  async function load() {
    try {
      const payload = await request('/engine-health');
      render(payload);
      if (!busy) message(`Monitor updated ${new Date().toLocaleTimeString('th-TH')}`, true);
    } catch (error) {
      $('engineMonitorState').textContent = 'MONITOR ERROR';
      $('engineMonitorState').className = 'engine-state needs_add_k';
      message(`Monitor เชื่อม Worker ไม่สำเร็จ: ${error.message}`, false);
    }
  }

  async function changeMode(mode) {
    const labels = {
      RUNNING: 'เปิดเครื่องและกลับมาสแกน',
      MAINTENANCE: 'เข้า Maintenance และหยุดการสแกน/Signal โดย Watchdog จะไม่เปิดกลับเอง',
      STOPPED: 'ปิด Live Engine จนกว่า Owner จะสั่งเปิดใหม่'
    };
    if (!window.confirm(`${labels[mode]} ใช่หรือไม่?`)) return;
    busy = true;
    monitor.querySelectorAll('[data-mode]').forEach(button => { button.disabled = true; });
    message(`กำลังเปลี่ยน Engine เป็น ${mode}…`, true);
    try {
      await request('/engine-control', {
        method: 'POST',
        body: JSON.stringify({ mode })
      });
      message(`ตั้ง Engine เป็น ${mode} แล้ว`, true);
      setTimeout(load, mode === 'RUNNING' ? 1800 : 250);
    } catch (error) {
      message(`เปลี่ยนสถานะไม่สำเร็จ: ${error.message}`, false);
    } finally {
      busy = false;
      setTimeout(load, 2200);
    }
  }

  monitor.querySelectorAll('[data-mode]').forEach(button => {
    button.addEventListener('click', () => changeMode(button.dataset.mode));
  });

  load();
  setInterval(load, POLL_MS);
})();
