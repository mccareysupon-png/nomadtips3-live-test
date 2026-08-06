(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const SYNC_MS = 60_000;
  let syncing = false;

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
      note.innerHTML = 'ข้อมูลหลักบันทึกใน <b>Cloudflare D1</b> และตรวจผลอัตโนมัติแม้ปิดเบราว์เซอร์ Local Storage ใช้เป็นสำเนาสำรองในเครื่องเท่านั้น';
    }
  }

  async function request(path, options = {}) {
    const response = await fetch(`${WORKER}${path}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
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
      localStorage.setItem(TRADE_KEY, JSON.stringify(trades));
      setStatus(`D1 ONLINE · ${trades.length} รายการ`, true);

      if (changed) {
        const signature = trades.map(trade => `${trade.fixtureId}:${trade.status}:${trade.updatedAt || 0}`).join('|');
        if (sessionStorage.getItem('nomad-d1-last-reload') !== signature) {
          sessionStorage.setItem('nomad-d1-last-reload', signature);
          location.reload();
        }
      }
    } catch (error) {
      setStatus(`D1 สำรองไม่สำเร็จ · ใช้ข้อมูลในเครื่อง (${error.message})`, false);
    } finally {
      syncing = false;
    }
  }

  window.addEventListener('storage', event => {
    if (event.key === TRADE_KEY) sync();
  });
  setTimeout(sync, 1200);
  setInterval(sync, SYNC_MS);
})();
