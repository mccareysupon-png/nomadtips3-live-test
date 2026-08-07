(() => {
  'use strict';

  const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';
  const SYNC_MS = 60_000;
  let syncing = false;
  let internalWrite = false;
  let patchScheduled = false;
  let scannerText = 'กำลังรอ Worker สแกนอัตโนมัติ';

  function readLocal() {
    try {
      const value = JSON.parse(localStorage.getItem(TRADE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  function keyOf(trade) {
    return String(trade?.tradeKey || `${Number(trade?.fixtureId)}:${String(trade?.selectedSide || 'HOME').toUpperCase()}`);
  }

  function stable(value) {
    return JSON.stringify([...value].sort((a, b) => keyOf(a).localeCompare(keyOf(b))));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function number(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function setStatus(text, good = true) {
    const status = document.getElementById('settlementStatus');
    if (status && status.textContent !== text) {
      status.textContent = text;
      status.style.color = good ? '#00df91' : '#ff6573';
    }
    const note = document.querySelector('.paper-note');
    const noteHtml = 'ข้อมูลหลักบันทึกใน <b>Cloudflare D1</b> ตัวสแกนและการตรวจผลทำงานบน Worker แม้ปิดเบราว์เซอร์ Local Storage เป็นสำเนาสำรองเท่านั้น';
    if (note && good && note.innerHTML !== noteHtml) note.innerHTML = noteHtml;
  }

  function updateScannerLabel() {
    const label = document.getElementById('nextScan');
    if (label && label.textContent !== scannerText) label.textContent = scannerText;
  }

  function selectedSideLabel(side) {
    return String(side || 'HOME').toUpperCase() === 'AWAY'
      ? 'ทีมเยือน (AWAY)'
      : 'ทีมเจ้าบ้าน (HOME)';
  }

  function patchTradeSelectedTeams() {
    const trades = readLocal();
    const cards = [...document.querySelectorAll('#tradeList .trade')];

    cards.forEach((card, index) => {
      if (card.dataset.selectedTeamPatched === '1') return;
      const trade = trades[index];
      const meta = card.querySelector('.trade-meta');
      if (!trade || !meta) return;

      const selectedTeam = String(trade.selectedTeam || trade.home || '').trim();
      if (!selectedTeam) return;

      const line = document.createElement('div');
      line.className = 'trade-selected-team';
      line.style.marginBottom = '3px';

      const prefix = document.createElement('strong');
      prefix.textContent = 'ทีมที่เลือก: ';
      prefix.style.color = '#eff9f3';

      const team = document.createElement('strong');
      team.textContent = selectedTeam;
      team.style.color = '#00df91';

      line.append(prefix, team, document.createTextNode(` · ${selectedSideLabel(trade.selectedSide)}`));
      meta.prepend(line);
      card.dataset.selectedTeamPatched = '1';
    });
  }

  function cardFixtureKey(card) {
    if (card.dataset.fixtureKey) return card.dataset.fixtureKey;
    const head = card.querySelector('.card-head span')?.textContent || '';
    const match = head.match(/·\s*(\d+)\s*$/);
    if (!match) return '';
    const selectedAway = [...card.querySelectorAll('.team small')]
      .some(node => node.textContent.includes('ทีมเยือน') && node.textContent.includes('SELECTED'));
    const key = `${Number(match[1])}:${selectedAway ? 'AWAY' : 'HOME'}`;
    card.dataset.fixtureKey = key;
    return key;
  }

  function retainedScore(trade) {
    const side = String(trade.selectedSide || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
    const actualHomeScore = number(trade.entryActualHomeScore) ?? (side === 'AWAY' ? number(trade.entryAwayScore) : number(trade.entryHomeScore)) ?? 0;
    const actualAwayScore = number(trade.entryActualAwayScore) ?? (side === 'AWAY' ? number(trade.entryHomeScore) : number(trade.entryAwayScore)) ?? 0;
    const selectedScore = side === 'AWAY' ? actualAwayScore : actualHomeScore;
    const opponentScore = side === 'AWAY' ? actualHomeScore : actualAwayScore;
    const difference = selectedScore - opponentScore;
    return {
      actualHomeScore,
      actualAwayScore,
      label: difference > 0
        ? `ทีมที่เลือกนำ ${difference} ลูก`
        : difference < 0
          ? `ทีมที่เลือกตาม ${Math.abs(difference)} ลูก`
          : 'สกอร์เสมอ',
      css: difference > 0 ? 'leading' : difference < 0 ? 'trailing' : 'tied'
    };
  }

  function retainedCardHtml(trade) {
    const side = String(trade.selectedSide || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
    const selectedTeam = String(trade.selectedTeam || trade.home || 'Selected');
    const opponent = String(trade.opponent || trade.away || 'Opponent');
    const actualHome = String(trade.actualHome || (side === 'AWAY' ? opponent : selectedTeam));
    const actualAway = String(trade.actualAway || (side === 'AWAY' ? selectedTeam : opponent));
    const score = retainedScore(trade);
    const selectedMomentum = number(trade.momentum);
    const opponentMomentum = selectedMomentum === null ? null : Math.max(0, 100 - selectedMomentum);
    const homeMomentum = side === 'AWAY' ? opponentMomentum : selectedMomentum;
    const awayMomentum = side === 'AWAY' ? selectedMomentum : opponentMomentum;
    const ahLine = number(trade.ahLine);
    const ahOdds = number(trade.ahOdds);
    const selectedOdds = number(trade.selectedWinOdds ?? trade.homeWinOdds);
    const lineText = ahLine === null ? 'N/A' : `${ahLine >= 0 ? '+' : ''}${ahLine}`;
    const fixtureId = Number(trade.fixtureId) || 0;
    const entryMinute = Number(trade.entryMinute || 0);
    const homeSelected = side === 'HOME';
    const awaySelected = side === 'AWAY';

    return `<article class="card triggered" data-retained-trade="1" data-fixture-key="${fixtureId}:${side}" style="animation:none">
      <div class="card-head"><span>${escapeHtml(trade.country || '')} · ${escapeHtml(trade.league || '')} · ${fixtureId}</span><b class="badge ok">เลือกแล้ว · กำลังลุ้น</b></div>
      <div class="card-body">
        <div>
          <div class="match">
            <div class="team"><strong>${escapeHtml(actualHome)}</strong><small>ทีมเจ้าบ้าน${homeSelected ? ' · SELECTED' : ''}</small></div>
            <div class="score"><span>ล็อกที่ ${entryMinute}′</span><b>${score.actualHomeScore} : ${score.actualAwayScore}</b><em class="${score.css}">${escapeHtml(score.label)}</em></div>
            <div class="team"><strong>${escapeHtml(actualAway)}</strong><small>ทีมเยือน${awaySelected ? ' · SELECTED' : ''}</small></div>
          </div>
          <div class="momentum">
            <div class="momentum-top"><small>NOMAD MOMENTUM ตอนเข้าเงื่อนไข · HOME (GREEN) vs AWAY (RED)</small><b><em>${homeMomentum ?? '—'}</em> – <i>${awayMomentum ?? '—'}</i></b></div>
            <div class="bar"><span class="home" style="width:${homeMomentum ?? 50}%"></span><span class="away" style="width:${awayMomentum ?? 50}%"></span></div>
          </div>
        </div>
        <div class="facts">
          <div class="fact"><small>ทีมที่เลือก</small><b class="green">${escapeHtml(selectedTeam)}</b></div>
          <div class="fact"><small>สถานะ</small><b class="green">กำลังลุ้นจนจบเกม</b></div>
          <div class="fact"><small>Selected Odds</small><b class="${selectedOdds ? 'green' : 'yellow'}">${selectedOdds?.toFixed(2) ?? 'N/A'}</b></div>
          <div class="fact"><small>Asian Handicap</small><b class="${ahLine !== null ? 'green' : 'yellow'}">${lineText}</b></div>
          <div class="fact"><small>AH Odds</small><b class="${ahOdds ? 'green' : 'yellow'}">${ahOdds?.toFixed(3) ?? 'N/A'}</b></div>
          <div class="fact"><small>Paper Investment</small><b class="green">${number(trade.stakeUnits) ?? 100} Units</b></div>
          <div class="fact"><small>Momentum ตอนเลือก</small><b class="green">${selectedMomentum ?? 'N/A'}%</b></div>
          <div class="fact"><small>ล็อกการ์ด</small><b class="yellow">จนกว่าจะตรวจผลจบ</b></div>
        </div>
        <div class="analysis"><b>การ์ดถูกล็อกไว้แล้ว:</b> หลังระบบเลือกทีม การ์ดนี้จะไม่หายเพราะพ้นช่วงนาทีหรือราคาเปลี่ยน ระบบเดิมจะตรวจสกอร์สุดท้ายเมื่อการแข่งขันจบ</div>
        <div class="alert"><strong>เลือกแล้ว · คงการ์ดไว้จนจบเกม</strong><p>เมื่อ Worker ตรวจพบผลจบและตัดสินรายการแล้ว การ์ดนี้จะถูกนำออกอัตโนมัติ</p></div>
      </div>
    </article>`;
  }

  function ensureRetainedSelectedCards() {
    const box = document.getElementById('cards');
    if (!box) return;

    const pending = readLocal().filter(trade => String(trade?.status || '').toUpperCase() === 'PENDING');
    const pendingKeys = new Set(pending.map(keyOf));

    box.querySelectorAll('.card[data-retained-trade="1"]').forEach(card => {
      const key = card.dataset.fixtureKey || '';
      if (!pendingKeys.has(key)) card.remove();
    });

    box.querySelectorAll('.card:not([data-retained-trade="1"])').forEach(cardFixtureKey);
    const existing = new Set([...box.querySelectorAll('.card[data-fixture-key]')].map(card => card.dataset.fixtureKey));
    const missing = pending.filter(trade => !existing.has(keyOf(trade)));
    if (!missing.length) return;

    box.querySelectorAll(':scope > .empty').forEach(node => node.remove());
    missing.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)).forEach(trade => {
      const template = document.createElement('template');
      template.innerHTML = retainedCardHtml(trade).trim();
      const card = template.content.firstElementChild;
      if (!card) return;
      card.dataset.sideColorPatched = '1';
      box.appendChild(card);
    });
  }

  function patchMomentumSideColors(card) {
    if (card.dataset.sideColorPatched === '1') return;

    const selectedAway = [...card.querySelectorAll('.team small')]
      .some(node => node.textContent.includes('ทีมเยือน') && node.textContent.includes('SELECTED'));

    const momentum = card.querySelector('.momentum');
    if (!momentum) return;

    const title = momentum.querySelector('.momentum-top small');
    if (title) title.textContent = 'NOMAD MOMENTUM · SERVER 24/7 · HOME (GREEN) vs AWAY (RED)';

    if (selectedAway) {
      const greenValue = momentum.querySelector('.momentum-top b em');
      const redValue = momentum.querySelector('.momentum-top b i');
      if (greenValue && redValue) {
        const selectedMomentum = greenValue.textContent;
        const opponentMomentum = redValue.textContent;
        greenValue.textContent = opponentMomentum;
        redValue.textContent = selectedMomentum;
      }

      const greenBar = momentum.querySelector('.bar .home');
      const redBar = momentum.querySelector('.bar .away');
      if (greenBar && redBar) {
        const selectedWidth = greenBar.style.width;
        const opponentWidth = redBar.style.width;
        greenBar.style.width = opponentWidth;
        redBar.style.width = selectedWidth;
      }

      const lines = [...momentum.querySelectorAll('.chart polyline')];
      if (lines.length >= 2) {
        lines[0].setAttribute('stroke', '#ff6573');
        lines[1].setAttribute('stroke', '#00df91');
      }
    }

    card.dataset.sideColorPatched = '1';
  }

  function patchSideAwareUi() {
    const paperTag = document.querySelector('#paperInvestment .paper-head .tag');
    if (paperTag && paperTag.textContent.includes('HOME LIVE ASIAN HANDICAP')) {
      paperTag.textContent = paperTag.textContent.replace('HOME LIVE ASIAN HANDICAP', 'SELECTED TEAM LIVE ASIAN HANDICAP');
    }

    document.querySelectorAll('.trade-meta').forEach(meta => {
      if (meta.innerHTML.includes('Home AH')) meta.innerHTML = meta.innerHTML.replace(/Home AH/g, 'Selected AH');
    });
    patchTradeSelectedTeams();
    ensureRetainedSelectedCards();

    document.querySelectorAll('.card').forEach(card => {
      cardFixtureKey(card);
      patchMomentumSideColors(card);

      const facts = [...card.querySelectorAll('.fact')];
      const paperFact = facts.find(fact => fact.querySelector('small')?.textContent.trim() === 'Paper Investment');
      const ahOddsFact = facts.find(fact => fact.querySelector('small')?.textContent.trim() === 'AH Odds');
      const paperValue = paperFact?.querySelector('b');
      const ahOddsValue = ahOddsFact?.querySelector('b')?.textContent.trim();
      if (!paperValue) return;

      const triggered = card.classList.contains('triggered') ||
        card.querySelector('.badge')?.textContent.trim() === 'เข้าเงื่อนไข';
      const hasAhOdds = Boolean(ahOddsValue && ahOddsValue !== 'N/A');
      const invested = triggered && hasAhOdds;

      paperValue.textContent = invested ? '100 Units' : 'WAIT SIGNAL';
      paperValue.classList.remove('green', 'yellow');
      paperValue.classList.add(invested ? 'green' : 'yellow');
    });
  }

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(() => {
      patchScheduled = false;
      patchSideAwareUi();
    });
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
      const remoteMap = new Map(remoteTrades.map(trade => [keyOf(trade), trade]));
      const upload = local.filter(trade => {
        const stored = remoteMap.get(keyOf(trade));
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
      schedulePatch();

      if (changed) {
        const signature = trades.map(trade => `${keyOf(trade)}:${trade.status}:${trade.updatedAt || 0}`).join('|');
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
      schedulePatch();
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

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(updateScannerLabel, 1000);
  setTimeout(sync, 1200);
  setInterval(sync, SYNC_MS);
})();