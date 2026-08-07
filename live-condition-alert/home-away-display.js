(()=>{
  'use strict';

  const TRADE_KEY = 'nomadtips3.page5.paper-ah.v1';

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const number = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(String(value).replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  };

  function readTrades() {
    try {
      const value = JSON.parse(localStorage.getItem(TRADE_KEY) || '[]');
      return Array.isArray(value)
        ? [...value].sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
        : [];
    } catch {
      return [];
    }
  }

  function selectedSide(trade) {
    return String(trade?.selectedSide || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
  }

  function actualNames(trade) {
    const side = selectedSide(trade);
    const selectedTeam = String(trade?.selectedTeam || trade?.home || 'Selected');
    const opponent = String(trade?.opponent || trade?.away || 'Opponent');
    return {
      side,
      selectedTeam,
      actualHome: String(trade?.actualHome || (side === 'AWAY' ? opponent : selectedTeam)),
      actualAway: String(trade?.actualAway || (side === 'AWAY' ? selectedTeam : opponent))
    };
  }

  function entryScore(trade, side) {
    const home = number(trade?.entryActualHomeScore)
      ?? (side === 'AWAY' ? number(trade?.entryAwayScore) : number(trade?.entryHomeScore));
    const away = number(trade?.entryActualAwayScore)
      ?? (side === 'AWAY' ? number(trade?.entryHomeScore) : number(trade?.entryAwayScore));
    return { home, away };
  }

  function finalScore(trade, side) {
    const home = number(trade?.finalActualHomeScore)
      ?? (side === 'AWAY' ? number(trade?.finalAwayScore) : number(trade?.finalHomeScore));
    const away = number(trade?.finalActualAwayScore)
      ?? (side === 'AWAY' ? number(trade?.finalHomeScore) : number(trade?.finalAwayScore));
    return { home, away };
  }

  function postAlertScore(trade, side) {
    const selected = number(trade?.postEntryHomeGoals);
    const opponent = number(trade?.postEntryAwayGoals);
    if (selected === null || opponent === null) return { home: null, away: null };
    return side === 'AWAY'
      ? { home: opponent, away: selected }
      : { home: selected, away: opponent };
  }

  function formatLine(value) {
    const parsed = number(value);
    if (parsed === null) return 'N/A';
    return `${parsed >= 0 ? '+' : ''}${parsed}`;
  }

  function patchHistory() {
    const trades = readTrades();
    const cards = [...document.querySelectorAll('#tradeList .trade')];
    cards.forEach((card, index) => {
      const trade = trades[index];
      if (!trade) return;

      const names = actualNames(trade);
      const entry = entryScore(trade, names.side);
      const final = finalScore(trade, names.side);
      const post = postAlertScore(trade, names.side);
      const header = card.querySelector('.trade-top b');
      const meta = card.querySelector('.trade-meta');
      if (!header || !meta) return;

      header.textContent = `${names.actualHome} vs ${names.actualAway}`;

      const finalText = String(trade.status || '').toUpperCase() === 'PENDING'
        ? 'รอผลการแข่งขัน'
        : String(trade.settlement || '').toUpperCase() === 'VOID'
          ? 'ยกเลิกรายการ · คืน 100 Units'
          : `Final HOME–AWAY ${final.home ?? 'N/A'}-${final.away ?? 'N/A'} · หลัง Alert HOME–AWAY ${post.home ?? 'N/A'}-${post.away ?? 'N/A'}`;

      meta.innerHTML = `
        <div class="trade-selected-team" style="margin-bottom:3px">
          <strong style="color:#eff9f3">ทีมที่เลือก: </strong><strong style="color:#00df91">${escapeHtml(names.selectedTeam)}</strong> · ${names.side === 'AWAY' ? 'ทีมเยือน (AWAY)' : 'ทีมเจ้าบ้าน (HOME)'}
        </div>
        Alert ${trade.entryMinute}′ · Entry HOME–AWAY ${entry.home ?? 'N/A'}-${entry.away ?? 'N/A'} · ${escapeHtml(trade.scoreState || '')} · Momentum ${trade.momentum ?? 'N/A'}%<br>
        Selected AH ${formatLine(trade.ahLine)} @ ${trade.ahOdds ?? 'N/A'} · Investment ${trade.stakeUnits ?? 100} Units<br>${finalText}`;

      card.dataset.selectedTeamPatched = '1';
      card.dataset.homeAwayPatched = '1';
    });
  }

  let queued = false;
  function schedulePatch() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      patchHistory();
    });
  }

  const observer = new MutationObserver(schedulePatch);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('storage', event => {
    if (event.key === TRADE_KEY) schedulePatch();
  });
  schedulePatch();
})();
