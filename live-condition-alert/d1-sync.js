(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const SYNC_MS = 60_000;
  let syncing = false;
  let internalWrite = false;
  let scannerText = 'กำลังรอ Worker สแกนอัตโนมัติ';
  let configState = null;

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(TRADE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function stable(value) {
    return JSON.stringify([...value].sort((a, b) => Number(a.fixtureId) - Number(b.fixtureId)));
  }

  function setStatus(text, good = true) {
    const status = document.getElementById('settlementStatus');
    if (status) {
      status.textContent = text;
      status.style.color = good ? '#00df91' : '#ff6573';
    }
    const note = document.querySelector('.paper-note');
    if (note && good) {
      note.innerHTML = 'ข้อมูลหลักบันทึกใน <b>Cloudflare D1</b> ตัวสแกนและการตรวจผลทำงานบน Worker แม้ปิดเบราว์เซอร์ Local Storage เป็นสำเนาแสดงผลเท่านั้น';
    }
  }

  function updateScannerLabel() {
    const label = document.getElementById('nextScan');
    if (label) label.textContent = scannerText;
  }

  async function request(path, options = {}) {
    const response = await fetch(`${WORKER}${path}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
  }

  function sideLabel(value) {
    return value === 'AWAY' ? 'ทีมเยือน' : 'เจ้าบ้าน';
  }

  function marketLabel(value) {
    return value === 'AH' ? 'Asian Handicap' : 'ชนะตรง';
  }

  function lineText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 'ไม่จำกัด';
    return `${number >= 0 ? '+' : ''}${number}`;
  }

  function summaryText(config) {
    if (!config) return 'กำลังโหลดเงื่อนไข';
    return `${sideLabel(config.side)} · นาที ${config.minuteMin}–${config.minuteMax} · ${marketLabel(config.market)} Odds ≥ ${Number(config.oddsMin).toFixed(2)} · AH ≥ ${lineText(config.ahMin)} · บุก ≥ ${config.momentumMin}%`;
  }

  function injectStyles() {
    if (document.getElementById('conditionControlStyles')) return;
    const style = document.createElement('style');
    style.id = 'conditionControlStyles';
    style.textContent = `
      .condition-control{margin:12px 0 16px;border:1px solid #315744;border-radius:15px;background:#0b1d15;overflow:hidden}
      .condition-control summary{list-style:none;cursor:pointer;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12px;font-weight:900;color:#eaf8f0}
      .condition-control summary::-webkit-details-marker{display:none}.condition-control summary::after{content:'ตั้งค่า';color:#00df91;font-size:10px;padding:4px 8px;border:1px solid #276146;border-radius:999px}
      .condition-control[open] summary::after{content:'ปิด'}
      .condition-current{color:#9eb8aa;font-size:10px;font-weight:600;text-align:right;line-height:1.4}
      .condition-panel{border-top:1px solid #29483b;padding:13px}.condition-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}
      .condition-field{display:flex;flex-direction:column;gap:5px;padding:9px;border:1px solid #203d30;border-radius:11px;background:#08170f}
      .condition-field label{font-size:9px;color:#91aa9e;font-weight:800}.condition-field input,.condition-field select{width:100%;border:1px solid #355646;border-radius:8px;background:#10231a;color:#eff9f3;padding:8px;font:inherit;font-size:12px;outline:none}
      .condition-field input:focus,.condition-field select:focus{border-color:#00df91}.condition-field input:disabled{opacity:.45}
      .condition-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.condition-actions button{border:1px solid #416353;border-radius:9px;padding:8px 13px;font-size:11px;font-weight:900;cursor:pointer;background:#10271d;color:#e9f8f0}
      .condition-actions .run{background:#00a96f;border-color:#00df91;color:#04120c}.condition-actions button:disabled{opacity:.55;cursor:wait}
      .condition-message{min-height:18px;margin-top:8px;text-align:right;color:#91aa9e;font-size:10px}.condition-message.good{color:#00df91}.condition-message.bad{color:#ff6573}
      @media(max-width:850px){.condition-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.condition-control summary{align-items:flex-start;flex-direction:column}.condition-current{text-align:left}.condition-grid{grid-template-columns:1fr}.condition-actions{justify-content:stretch}.condition-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function controlMarkup() {
    return `
      <details class="condition-control" id="conditionControl">
        <summary><span>⚙️ NOMAD Condition Control</span><span class="condition-current" id="conditionCurrent">กำลังโหลดเงื่อนไข</span></summary>
        <div class="condition-panel">
          <div class="condition-grid">
            <div class="condition-field"><label>เลือกทีม</label><select id="ccSide"><option value="HOME">เจ้าบ้าน</option><option value="AWAY">ทีมเยือน</option></select></div>
            <div class="condition-field"><label>นาทีเริ่ม</label><input id="ccMinuteMin" type="number" min="1" max="119" step="1"></div>
            <div class="condition-field"><label>นาทีสิ้นสุด</label><input id="ccMinuteMax" type="number" min="2" max="120" step="1"></div>
            <div class="condition-field"><label>ตลาดราคา</label><select id="ccMarket"><option value="WIN">ชนะตรง</option><option value="AH">Asian Handicap</option></select></div>
            <div class="condition-field"><label>Odds ขั้นต่ำ</label><input id="ccOddsMin" type="number" min="1.01" max="100" step="0.01"></div>
            <div class="condition-field"><label>Odds สูงสุด (เว้นว่าง = ไม่จำกัด)</label><input id="ccOddsMax" type="number" min="1.01" max="100" step="0.01" placeholder="ไม่จำกัด"></div>
            <div class="condition-field"><label>AH Line ขั้นต่ำ</label><input id="ccAhMin" type="number" min="-5" max="5" step="0.25"></div>
            <div class="condition-field"><label>AH Line สูงสุด (เว้นว่าง = ไม่จำกัด)</label><input id="ccAhMax" type="number" min="-5" max="5" step="0.25" placeholder="ไม่จำกัด"></div>
            <div class="condition-field"><label>อัตราการบุกขั้นต่ำ (%)</label><input id="ccMomentum" type="number" min="1" max="99" step="1"></div>
            <div class="condition-field"><label>ผลต่างสกอร์</label><select id="ccGapMode"><option value="UNLIMITED">ไม่จำกัด</option><option value="LIMITED">จำกัด</option></select></div>
            <div class="condition-field"><label>ผลต่างไม่เกินกี่ลูก</label><input id="ccMaxGap" type="number" min="0" max="20" step="1"></div>
            <div class="condition-field"><label>ยืนยันกี่รอบติดกัน</label><input id="ccRounds" type="number" min="1" max="10" step="1"></div>
            <div class="condition-field"><label>จำนวนสัญญาณต่อวัน</label><select id="ccLimitMode"><option value="UNLIMITED">ไม่จำกัด</option><option value="LIMITED">จำกัด</option></select></div>
            <div class="condition-field"><label>สูงสุดกี่สัญญาณ</label><input id="ccMaxSignals" type="number" min="1" max="100" step="1"></div>
          </div>
          <div class="condition-actions">
            <button type="button" id="ccReset">กลับค่าเดิม</button>
            <button type="button" id="ccSave">เซฟ</button>
            <button type="button" class="run" id="ccRun">รัน</button>
          </div>
          <div class="condition-message" id="ccMessage"></div>
        </div>
      </details>`;
  }

  function injectControl() {
    if (document.getElementById('conditionControl')) return;
    injectStyles();
    const summary = document.querySelector('.summary');
    if (!summary) return;
    summary.insertAdjacentHTML('beforebegin', controlMarkup());
    document.getElementById('ccGapMode')?.addEventListener('change', updateDisabledFields);
    document.getElementById('ccLimitMode')?.addEventListener('change', updateDisabledFields);
    document.getElementById('ccReset')?.addEventListener('click', () => {
      fillForm(configState?.defaults || configState?.active);
      showMessage('คืนค่าตั้งต้นในช่องแล้ว กดรันเมื่อต้องการใช้งาน', true);
    });
    document.getElementById('ccSave')?.addEventListener('click', () => submitConfig('save'));
    document.getElementById('ccRun')?.addEventListener('click', () => submitConfig('run'));
  }

  function field(id) {
    return document.getElementById(id);
  }

  function fillForm(config) {
    if (!config) return;
    field('ccSide').value = config.side;
    field('ccMinuteMin').value = config.minuteMin;
    field('ccMinuteMax').value = config.minuteMax;
    field('ccMarket').value = config.market;
    field('ccOddsMin').value = config.oddsMin;
    field('ccOddsMax').value = config.oddsMax ?? '';
    field('ccAhMin').value = config.ahMin;
    field('ccAhMax').value = config.ahMax ?? '';
    field('ccMomentum').value = config.momentumMin;
    field('ccGapMode').value = config.goalGapLimited ? 'LIMITED' : 'UNLIMITED';
    field('ccMaxGap').value = config.maxGoalGap;
    field('ccRounds').value = config.confirmationRounds;
    field('ccLimitMode').value = config.signalLimitEnabled ? 'LIMITED' : 'UNLIMITED';
    field('ccMaxSignals').value = config.maxSignalsPerDay;
    updateDisabledFields();
  }

  function updateDisabledFields() {
    if (!field('ccMaxGap')) return;
    field('ccMaxGap').disabled = field('ccGapMode').value !== 'LIMITED';
    field('ccMaxSignals').disabled = field('ccLimitMode').value !== 'LIMITED';
  }

  function optionalNumber(id) {
    const value = field(id).value.trim();
    return value === '' ? null : Number(value);
  }

  function readForm() {
    const minuteMin = Number(field('ccMinuteMin').value);
    const minuteMax = Number(field('ccMinuteMax').value);
    if (!Number.isFinite(minuteMin) || !Number.isFinite(minuteMax) || minuteMin >= minuteMax) {
      throw new Error('นาทีเริ่มต้องน้อยกว่านาทีสิ้นสุด');
    }
    return {
      side: field('ccSide').value,
      minuteMin,
      minuteMax,
      market: field('ccMarket').value,
      oddsMin: Number(field('ccOddsMin').value),
      oddsMax: optionalNumber('ccOddsMax'),
      ahMin: Number(field('ccAhMin').value),
      ahMax: optionalNumber('ccAhMax'),
      momentumMin: Number(field('ccMomentum').value),
      goalGapLimited: field('ccGapMode').value === 'LIMITED',
      maxGoalGap: Number(field('ccMaxGap').value),
      confirmationRounds: Number(field('ccRounds').value),
      signalLimitEnabled: field('ccLimitMode').value === 'LIMITED',
      maxSignalsPerDay: Number(field('ccMaxSignals').value)
    };
  }

  function showMessage(text, good) {
    const box = field('ccMessage');
    if (!box) return;
    box.textContent = text;
    box.className = `condition-message ${good ? 'good' : 'bad'}`;
  }

  function setButtonsDisabled(disabled) {
    ['ccReset', 'ccSave', 'ccRun'].forEach(id => {
      const button = field(id);
      if (button) button.disabled = disabled;
    });
  }

  async function loadConfig() {
    injectControl();
    try {
      const payload = await request('/condition-config');
      configState = payload;
      fillForm(payload.draft || payload.active || payload.defaults);
      const current = field('conditionCurrent');
      if (current) current.textContent = summaryText(payload.active);
    } catch (error) {
      showMessage(`โหลดเงื่อนไขไม่สำเร็จ: ${error.message}`, false);
    }
  }

  async function submitConfig(action) {
    try {
      const config = readForm();
      setButtonsDisabled(true);
      showMessage(action === 'run' ? 'กำลังส่งค่าเข้าเครื่องยนต์…' : 'กำลังเซฟ…', true);
      const payload = await request('/condition-config', {
        method: 'POST',
        body: JSON.stringify({ action, config })
      });
      configState = payload;
      const current = field('conditionCurrent');
      if (current) current.textContent = summaryText(payload.active);
      showMessage(action === 'run' ? 'รันเงื่อนไขใหม่แล้ว ระบบจะเริ่มใช้ในรอบถัดไป' : 'เซฟไว้แล้ว ยังไม่เปลี่ยนเครื่องยนต์', true);
      if (action === 'run') {
        const details = field('conditionControl');
        if (details) details.open = false;
        setTimeout(() => location.reload(), 1200);
      }
    } catch (error) {
      showMessage(error.message, false);
    } finally {
      setButtonsDisabled(false);
    }
  }

  async function scannerStatus() {
    try {
      const status = await request('/auto-scan-status');
      if (!status.ok || !status.online) {
        scannerText = status.error ? `AUTO SCAN รอแก้ไข · ${status.error}` : 'AUTO SCAN กำลังเริ่มทำงาน';
        return false;
      }
      const time = status.generatedAt ? new Date(status.generatedAt).toLocaleTimeString() : '—';
      const live = status.counts?.allLive ?? 0;
      const base = status.counts?.baseCandidates ?? 0;
      scannerText = `WORKER ONLINE 24/7 · ${time} · สด ${live} · ผู้สมัคร ${base}`;
      return true;
    } catch (error) {
      scannerText = `AUTO SCAN เชื่อมต่อไม่ได้ · ${error.message}`;
      return false;
    }
  }

  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const local = readLocal();
      let remote = await request('/paper-trades?limit=10000');
      if ((remote.summary?.pending || 0) > 0) {
        await request('/paper-settle', { method: 'POST', body: '{}' });
        remote = await request('/paper-trades?limit=10000');
      }

      const trades = Array.isArray(remote.trades) ? remote.trades : [];
      const changed = stable(local) !== stable(trades);
      internalWrite = true;
      localStorage.setItem(TRADE_KEY, JSON.stringify(trades));
      internalWrite = false;
      const autoOnline = await scannerStatus();
      setStatus(`${autoOnline ? 'D1 + AUTO ONLINE' : 'D1 ONLINE'} · ${trades.length} รายการ`, true);

      if (changed) {
        const signature = trades.map(trade => `${trade.fixtureId}:${trade.status}:${trade.updatedAt || 0}`).join('|');
        if (sessionStorage.getItem('nomad-d1-last-reload') !== signature) {
          sessionStorage.setItem('nomad-d1-last-reload', signature);
          location.reload();
        }
      }
    } catch (error) {
      internalWrite = false;
      await scannerStatus();
      setStatus(`D1 สำรองไม่สำเร็จ · ใช้ข้อมูลในเครื่อง (${error.message})`, false);
    } finally {
      syncing = false;
      updateScannerLabel();
    }
  }

  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    nativeSetItem.call(this, key, value);
    if (!internalWrite && this === localStorage && key === TRADE_KEY) setTimeout(sync, 0);
  };

  window.addEventListener('storage', event => {
    if (event.key === TRADE_KEY) sync();
  });
  injectControl();
  loadConfig();
  setInterval(updateScannerLabel, 1000);
  setTimeout(sync, 1200);
  setInterval(sync, SYNC_MS);
})();
