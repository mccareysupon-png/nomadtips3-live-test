(() => {
  'use strict';
  const PAGE_SIZE = 25;
  const HISTORY_DAYS = 30;
  const DAY_MS = 86400000;
  const body = document.body;
  const list = document.getElementById('historyList');
  const nav = document.getElementById('historyPagination');
  const endpoint = String(body.dataset.analyticsUrl || '').trim();
  let signals = [];
  let currentPage = 1;
  let rendering = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = value => { const n = Number(value); return Number.isFinite(n) ? n : null; };
  const first = (...values) => values.find(value => value !== undefined && value !== null && value !== '');
  const parseTime = value => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const n = Number(value);
    if (Number.isFinite(n) && n > 1e11) return n;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : null;
  };
  const formatDateTime = value => {
    const ms = parseTime(value);
    if (!Number.isFinite(ms)) return '—';
    return new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));
  };
  const formatOdds = value => { const n = num(value); return n === null ? '—' : n.toFixed(2); };
  const outcomeClass = outcome => {
    const value = String(outcome || 'PENDING').toLowerCase();
    return ['win','loss','push','void','pending'].includes(value) ? value : 'pending';
  };
  const normalizeTrade = (item = {}) => {
    const result = String(item.result || '').toUpperCase();
    const status = String(item.status || '').toUpperCase();
    const settlement = String(item.settlement || '').toUpperCase();
    let outcome = 'PENDING';
    if (result === 'CORRECT') outcome = 'WIN';
    else if (result === 'INCORRECT') outcome = 'LOSS';
    else if (status === 'VOID' || settlement === 'VOID') outcome = 'VOID';
    else if (settlement === 'PUSH') outcome = 'PUSH';
    else if (status === 'SETTLED' && result === 'NEUTRAL') outcome = 'PUSH';
    const entrySelected = first(item.entryHomeScore, item.entrySelectedScore);
    const entryOpponent = first(item.entryAwayScore, item.entryOpponentScore);
    const line = num(item.ahLine);
    return {
      fixtureId:item.fixtureId,
      selectedTeam:first(item.selectedTeam,item.home,'—'),
      opponent:first(item.opponent,item.away,'—'),
      market:line === null ? 'AH' : `AH ${line >= 0 ? '+' : ''}${line}`,
      minute:num(item.entryMinute),
      score:entrySelected != null && entryOpponent != null ? `${entrySelected}–${entryOpponent}` : '—',
      odds:first(item.ahOdds,item.selectedWinOdds,item.homeWinOdds),
      outcome,
      createdAt:item.createdAt
    };
  };
  const historyMatch = signal => signal.selectedTeam && signal.opponent !== '—' ? `${signal.selectedTeam} vs ${signal.opponent}` : signal.selectedTeam || `Fixture ${signal.fixtureId || '—'}`;
  const row = signal => `<article class="history-row">
    <div class="history-time">${esc(formatDateTime(signal.createdAt))}</div>
    <div class="history-match"><b>${esc(historyMatch(signal))}</b><span>${esc(signal.score || '—')} · ${signal.minute == null ? '—' : `${signal.minute}'`}</span></div>
    <div class="history-pick"><b>${esc(signal.selectedTeam || '—')}</b><span>${esc(signal.market || '—')}</span></div>
    <div class="history-odds">${esc(formatOdds(signal.odds))}</div>
    <div class="outcome ${outcomeClass(signal.outcome)}">${esc(signal.outcome || 'PENDING')}</div>
  </article>`;

  function pageButtons(totalPages) {
    const pages = [];
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const end = Math.min(totalPages, Math.max(5, currentPage + 2));
    for (let p = start; p <= end; p += 1) pages.push(p);
    return pages.map(p => `<button type="button" class="history-page${p === currentPage ? ' active' : ''}" data-history-page="${p}" aria-current="${p === currentPage ? 'page' : 'false'}">${p}</button>`).join('');
  }

  function renderPage() {
    if (!list || !nav || !signals.length) return;
    const totalPages = Math.max(1, Math.ceil(signals.length / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    rendering = true;
    list.innerHTML = signals.slice(start, start + PAGE_SIZE).map(row).join('');
    if (totalPages > 1) {
      nav.hidden = false;
      nav.innerHTML = `<button type="button" class="history-page nav" data-history-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Prev</button>${pageButtons(totalPages)}<button type="button" class="history-page nav" data-history-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    } else {
      nav.hidden = true;
      nav.innerHTML = '';
    }
    requestAnimationFrame(() => { rendering = false; });
  }

  async function refreshHistoryPages() {
    if (!endpoint || !list || !nav) return;
    try {
      const response = await fetch(endpoint, {cache:'no-store', headers:{accept:'application/json'}});
      if (!response.ok) return;
      const payload = await response.json();
      const cutoff = Date.now() - HISTORY_DAYS * DAY_MS;
      signals = (Array.isArray(payload.trades) ? payload.trades : [])
        .map(normalizeTrade)
        .filter(signal => (parseTime(signal.createdAt) || 0) >= cutoff)
        .sort((a,b) => (parseTime(b.createdAt) || 0) - (parseTime(a.createdAt) || 0));
      renderPage();
    } catch (_) {
      /* app.js remains the source of truth if pagination refresh is unavailable */
    }
  }

  nav?.addEventListener('click', event => {
    const button = event.target.closest('[data-history-page]');
    if (!button || button.disabled) return;
    const page = Number(button.dataset.historyPage);
    if (!Number.isFinite(page)) return;
    currentPage = page;
    renderPage();
    document.querySelector('.history-head')?.scrollIntoView({behavior:'smooth',block:'start'});
  });

  const observer = list ? new MutationObserver(() => {
    if (!rendering && signals.length) renderPage();
  }) : null;
  if (observer && list) observer.observe(list, {childList:true});

  window.addEventListener('DOMContentLoaded', () => {
    window.setTimeout(refreshHistoryPages, 1200);
    window.setInterval(refreshHistoryPages, 60000);
  });
})();