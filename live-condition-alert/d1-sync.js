(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const SYNC_MS = 60_000;
  let syncing = false;
  let internalWrite = false;
  let scannerText = 'กำลังรอ Worker สแกนอัตโนมัติ';

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
      note.innerHTML = 'ข้อมูลหลักบันทึกใน <b>Cloudflare D1</b> ตัวสแกนและการตรวจผลทำงานบน Worker แม้ปิดเบราว์เซอร์ Local Storage เป็นสำเนาสำรองเท่านั้น';
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
      const remoteTrades = Array.isArray(remote.trades) ? remote.trades : [];
      const remoteMap = new Map(remoteTrades.map(trade => [Number(trade.fixtureId), trade]));
      const upload = local.filter(trade => {
        const stored = remoteMap.get(Number(trade.fixtureId));
        return !stored || (stored.status === 'PENDING' && trade.status !== 'PENDING');
      });

      if (upload.length) {
        await request('/paper-trades/import', {
          method: 'POST',
          body: JSON.stringify({ trades: upload })
        });
      }

      if ((remote.summary?.pending || 0) > 0 || upload.some(trade => trade.status === 'PENDING')) {
        await request('/paper-settle', { method: 'POST', body: '{}' });
      }

      if (upload.length || (remote.summary?.pending || 0) > 0) {
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
  setInterval(updateScannerLabel, 1000);
  setTimeout(sync, 1200);
  setInterval(sync, SYNC_MS);
})();
