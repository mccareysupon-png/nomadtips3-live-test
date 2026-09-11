(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-stats-v3.json';
  const PAGE_SIZE = 50;
  const $ = s => document.querySelector(s);
  const pct = n => Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : '—';
  const odds = n => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
  const money = n => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${x > 0 ? '+' : ''}${Math.round(x)}`;
  };
  const cls = result => ['WIN','HALF_WIN'].includes(result) ? 'win' : ['LOSS','HALF_LOSS'].includes(result) ? 'loss' : 'pending';
  const resultText = result => String(result || '').replaceAll('_', ' ');

  const query = new URLSearchParams(location.search);
  const queryTab = ['today','history','daily','rules'].includes(query.get('tab')) ? query.get('tab') : 'today';
  const requestedPage = Math.max(1, parseInt(query.get('page') || '1', 10) || 1);
  const pageState = {today:1, history:1, daily:1};
  if (pageState[queryTab] !== undefined) pageState[queryTab] = requestedPage;
  let lastData = null;
  let todayObserver = null;
  let todayQueued = false;
  let todayBusy = false;

  function ensurePresentationStyle() {
    if (document.getElementById('prediction2-borderless-gradient-v1')) return;
    const style = document.createElement('style');
    style.id = 'prediction2-borderless-gradient-v1';
    style.textContent = `
      body[data-page="prediction2"] .king-scorebar{
        gap:0!important;border:0!important;
        background:linear-gradient(115deg,rgba(28,40,33,.98),rgba(20,29,24,.99) 48%,rgba(15,22,18,.995))!important;
        border-radius:0!important;box-shadow:0 12px 30px rgba(0,0,0,.15)!important;overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-scorebar .metric{
        background:transparent!important;border:0!important;border-right:1px solid rgba(255,255,255,.055)!important;box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-scorebar .metric:last-child{border-right:0!important;}
      body[data-page="prediction2"] .king-panel{
        border:0!important;background:linear-gradient(160deg,rgba(24,33,28,.985),rgba(18,25,21,.992) 55%,rgba(14,20,17,.997))!important;
        border-radius:0!important;box-shadow:0 12px 30px rgba(0,0,0,.13)!important;overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-panel-head{
        border-bottom:1px solid rgba(255,255,255,.06)!important;background:linear-gradient(90deg,rgba(255,255,255,.018),transparent 72%)!important;
      }
      body[data-page="prediction2"] .king-table th,
      body[data-page="prediction2"] .king-table td{border-bottom:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-table th{background:rgba(255,255,255,.018)!important;}
      body[data-page="prediction2"] .king-table tbody tr:last-child td{border-bottom:0!important;}
      body[data-page="prediction2"] .king-table tbody tr:not(.king-expand-row){transition:background-color .16s ease;}
      body[data-page="prediction2"] .king-table tbody tr:not(.king-expand-row):hover{background:rgba(80,220,143,.025)!important;}
      body[data-page="prediction2"] .king-rules{gap:0!important;background:transparent!important;}
      body[data-page="prediction2"] .king-rules div{
        background:transparent!important;border:0!important;border-right:1px solid rgba(255,255,255,.055)!important;border-bottom:1px solid rgba(255,255,255,.055)!important;
      }
      body[data-page="prediction2"] .king-rules div:nth-child(3n){border-right:0!important;}
      body[data-page="prediction2"] .king-rules div:nth-last-child(-n+3){border-bottom:0!important;}
      body[data-page="prediction2"] .king-note{border-top:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-analysis-drawer{
        border:0!important;background:linear-gradient(160deg,rgba(23,32,27,.99),rgba(14,20,17,.997))!important;box-shadow:0 12px 30px rgba(0,0,0,.13)!important;
      }
      body[data-page="prediction2"] .king-analysis-drawer.is-open{border:0!important;}
      body[data-page="prediction2"] .king-analysis-grid{gap:0!important;background:linear-gradient(140deg,rgba(255,255,255,.018),rgba(80,220,143,.012))!important;}
      body[data-page="prediction2"] .king-analysis-block{background:transparent!important;border:0!important;border-right:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-analysis-block:last-child{border-right:0!important;}
      body[data-page="prediction2"] .king-expand-row td{
        background:linear-gradient(160deg,rgba(21,30,25,.995),rgba(13,19,16,.998))!important;border-bottom:1px solid rgba(255,255,255,.045)!important;
      }
      body[data-page="prediction2"] .king-expand-shell{
        background:linear-gradient(145deg,rgba(27,38,31,.66),rgba(15,22,18,.22))!important;border-top:1px solid rgba(80,220,143,.14)!important;
        border-bottom:0!important;box-shadow:none!important;
      }
      body[data-page="prediction2"] .king-expand-summary{
        gap:0!important;background:linear-gradient(135deg,rgba(255,255,255,.022),rgba(80,220,143,.012))!important;border:0!important;box-shadow:none!important;border-radius:0!important;
      }
      body[data-page="prediction2"] .king-expand-summary>div{background:transparent!important;border:0!important;border-right:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-expand-summary>div:last-child{border-right:0!important;}
      body[data-page="prediction2"] .king-expand-lower{
        gap:0!important;background:linear-gradient(135deg,rgba(255,255,255,.018),rgba(80,220,143,.01))!important;border-radius:0!important;overflow:hidden!important;
      }
      body[data-page="prediction2"] .king-expand-block{background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important;}
      body[data-page="prediction2"] .king-expand-block + .king-expand-block{border-left:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-expand-section,
      body[data-page="prediction2"] .king-expand-status{border-top:1px solid rgba(255,255,255,.055)!important;}
      body[data-page="prediction2"] .king-tabs{border-bottom:1px solid rgba(255,255,255,.055)!important;}

      body[data-page="prediction2"] .king-pager{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:9px 10px;border-top:1px solid rgba(255,255,255,.055);
        background:rgba(10,15,12,.22);min-height:39px;
      }
      body[data-page="prediction2"] .king-pager[hidden]{display:none!important;}
      body[data-page="prediction2"] .king-pager-info{color:#818b84;font-size:8px;font-weight:850;letter-spacing:.045em;white-space:nowrap;}
      body[data-page="prediction2"] .king-pager-nav{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap;}
      body[data-page="prediction2"] .king-pager button{
        min-width:28px;height:26px;padding:0 7px;border:1px solid rgba(255,255,255,.075);
        background:rgba(255,255,255,.025);color:#98a29b;font:850 9px Arial,Helvetica,sans-serif;cursor:pointer;
      }
      body[data-page="prediction2"] .king-pager button:hover{color:var(--green);border-color:rgba(80,220,143,.35);}
      body[data-page="prediction2"] .king-pager button.active{color:#0c160f;background:var(--green);border-color:var(--green);}
      body[data-page="prediction2"] .king-pager button:disabled{opacity:.35;cursor:default;color:#707872;border-color:rgba(255,255,255,.05);}
      body[data-page="prediction2"] .king-pager-gap{padding:0 2px;color:#68716b;font-size:9px;}
      body[data-page="prediction2"] .king-pager-mobile{display:none;color:#9ba49e;font-size:9px;font-weight:900;letter-spacing:.04em;}

      @media(max-width:699px){
        body[data-page="prediction2"] .king-scorebar .metric:nth-child(4n){border-right:0!important;}
        body[data-page="prediction2"] .king-scorebar .metric:nth-child(-n+4){border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div{border-right:1px solid rgba(255,255,255,.055)!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div:nth-child(3n){border-right:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-rules div:nth-child(even){border-right:0!important;}
        body[data-page="prediction2"] .king-rules div:nth-last-child(-n+2){border-bottom:0!important;}
        body[data-page="prediction2"] .king-analysis-block{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-analysis-block:last-child{border-bottom:0!important;}
        body[data-page="prediction2"] .king-expand-summary>div{border-right:1px solid rgba(255,255,255,.055)!important;border-bottom:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-expand-summary>div:nth-child(even){border-right:0!important;}
        body[data-page="prediction2"] .king-expand-summary>div:nth-last-child(-n+2){border-bottom:0!important;}
        body[data-page="prediction2"] .king-expand-block + .king-expand-block{border-left:0!important;border-top:1px solid rgba(255,255,255,.055)!important;}
        body[data-page="prediction2"] .king-pager{padding:8px;gap:7px;}
        body[data-page="prediction2"] .king-pager-info{font-size:7px;}
        body[data-page="prediction2"] .king-pager-nav button[data-kind="number"],
        body[data-page="prediction2"] .king-pager-gap{display:none;}
        body[data-page="prediction2"] .king-pager-mobile{display:inline;}
        body[data-page="prediction2"] .king-pager button{min-width:34px;height:28px;}
      }
    `;
    document.head.appendChild(style);
  }

  function resultOrder(a, b) {
    const aa = `${a.date || ''} ${a.kickoff || ''} ${a.settled_at || ''}`;
    const bb = `${b.date || ''} ${b.kickoff || ''} ${b.settled_at || ''}`;
    return bb.localeCompare(aa);
  }

  function pageCount(total) {
    return Math.max(1, Math.ceil(total / PAGE_SIZE));
  }

  function activeTab() {
    return $('.king-tabs button.active')?.dataset.tab || 'today';
  }

  function writeUrl(tab = activeTab()) {
    const url = new URL(location.href);
    url.searchParams.set('tab', tab);
    if (pageState[tab] !== undefined && pageState[tab] > 1) url.searchParams.set('page', String(pageState[tab]));
    else url.searchParams.delete('page');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function pageTokens(totalPages, current) {
    if (totalPages <= 7) return Array.from({length:totalPages}, (_,i) => i + 1);
    const keep = new Set([1, totalPages, current, current - 1, current + 1]);
    const values = [...keep].filter(n => n >= 1 && n <= totalPages).sort((a,b) => a - b);
    const out = [];
    values.forEach((n, i) => {
      if (i && n - values[i - 1] > 1) out.push('…');
      out.push(n);
    });
    return out;
  }

  function ensurePager(key) {
    const panel = document.querySelector(`.king-panel[data-panel="${key}"]`);
    const wrap = panel?.querySelector('.king-table-wrap');
    if (!panel || !wrap) return null;
    let pager = panel.querySelector(`.king-pager[data-pager="${key}"]`);
    if (!pager) {
      pager = document.createElement('div');
      pager.className = 'king-pager';
      pager.dataset.pager = key;
      wrap.insertAdjacentElement('afterend', pager);
      pager.addEventListener('click', event => {
        const button = event.target.closest('button[data-page]');
        if (!button || button.disabled) return;
        const total = Number(pager.dataset.total || 0);
        const pages = pageCount(total);
        const target = button.dataset.page === 'prev'
          ? pageState[key] - 1
          : button.dataset.page === 'next'
            ? pageState[key] + 1
            : Number(button.dataset.page);
        if (!Number.isFinite(target)) return;
        pageState[key] = Math.min(pages, Math.max(1, target));
        if (key === 'today') {
          closeTodayDetails();
          applyTodayPagination();
        } else if (lastData) {
          render(lastData);
        }
        if (activeTab() === key) writeUrl(key);
        panel.scrollIntoView({block:'start', behavior:'smooth'});
      });
    }
    return pager;
  }

  function renderPager(key, total) {
    const pager = ensurePager(key);
    if (!pager) return;
    const pages = pageCount(total);
    pageState[key] = Math.min(pages, Math.max(1, pageState[key] || 1));
    pager.dataset.total = String(total);
    pager.hidden = total <= PAGE_SIZE;
    if (pager.hidden) {
      pager.innerHTML = '';
      return;
    }

    const current = pageState[key];
    const start = (current - 1) * PAGE_SIZE + 1;
    const end = Math.min(total, current * PAGE_SIZE);
    const numbers = pageTokens(pages, current).map(token => token === '…'
      ? '<span class="king-pager-gap">…</span>'
      : `<button type="button" data-kind="number" data-page="${token}" class="${token === current ? 'active' : ''}" aria-label="Page ${token}">${token}</button>`
    ).join('');

    pager.innerHTML = `
      <span class="king-pager-info">${start}–${end} of ${total}</span>
      <span class="king-pager-mobile">${current} / ${pages}</span>
      <div class="king-pager-nav">
        <button type="button" data-page="prev" ${current <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
        ${numbers}
        <button type="button" data-page="next" ${current >= pages ? 'disabled' : ''} aria-label="Next page">›</button>
      </div>`;
  }

  function closeTodayDetails() {
    const tbody = $('#todayRows');
    if (!tbody) return;
    todayBusy = true;
    tbody.querySelectorAll('.king-expand-row').forEach(row => row.remove());
    tbody.querySelectorAll('.king-row-open').forEach(row => {
      row.classList.remove('king-row-open');
      row.setAttribute('aria-expanded', 'false');
    });
    todayBusy = false;
  }

  function applyTodayPagination() {
    const tbody = $('#todayRows');
    if (!tbody) return;
    const primaryRows = [...tbody.children].filter(row => !row.classList.contains('king-expand-row'));
    const total = primaryRows.length;
    const pages = pageCount(total);
    pageState.today = Math.min(pages, Math.max(1, pageState.today || 1));
    const start = (pageState.today - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    let primaryIndex = -1;
    let visible = true;
    todayBusy = true;
    [...tbody.children].forEach(row => {
      if (!row.classList.contains('king-expand-row')) {
        primaryIndex += 1;
        visible = primaryIndex >= start && primaryIndex < end;
      }
      row.hidden = !visible;
    });
    todayBusy = false;
    renderPager('today', total);
  }

  function queueTodayPagination() {
    if (todayBusy || todayQueued) return;
    todayQueued = true;
    requestAnimationFrame(() => {
      todayQueued = false;
      applyTodayPagination();
    });
  }

  function startTodayPagination() {
    const tbody = $('#todayRows');
    if (!tbody || todayObserver) return;
    todayObserver = new MutationObserver(mutations => {
      if (todayBusy) return;
      const primaryMutation = mutations.some(m =>
        [...m.addedNodes, ...m.removedNodes].some(node =>
          node.nodeType === 1 && !node.classList?.contains('king-expand-row')
        )
      );
      if (primaryMutation) queueTodayPagination();
    });
    todayObserver.observe(tbody, {childList:true});
    [0, 250, 800, 1800, 3200].forEach(delay => setTimeout(queueTodayPagination, delay));
  }

  function render(data) {
    if (!data || data.record_version !== 'KING_STATS_V3') return;
    lastData = data;
    const records = Array.isArray(data.records) ? data.records : [];
    const finalResults = ['WIN', 'HALF_WIN', 'LOSS', 'HALF_LOSS', 'PUSH'];
    const historyResults = [...finalResults, 'VOID'];
    const settled = records.filter(x => finalResults.includes(String(x.result || '').toUpperCase()));
    const history = records.filter(x => historyResults.includes(String(x.result || '').toUpperCase()));
    const voids = history.filter(x => String(x.result || '').toUpperCase() === 'VOID');
    const s = data.summary || {};

    const firstLabel = $('.king-scorebar .metric:first-child span');
    const pushLabel = $('.king-scorebar .metric.draw span');
    if (firstLabel) firstLabel.textContent = 'SETTLED';
    if (pushLabel) pushLabel.textContent = 'PUSH';

    if ($('#sumPicks')) $('#sumPicks').textContent = String(Number(s.settled || 0));
    if ($('#sumWin')) $('#sumWin').textContent = String(Number(s.wins || 0));
    if ($('#sumLoss')) $('#sumLoss').textContent = String(Number(s.losses || 0));
    if ($('#sumDraw')) $('#sumDraw').textContent = String(Number(s.pushes || 0));
    if ($('#sumRate')) $('#sumRate').textContent = s.win_rate == null ? '—' : pct(s.win_rate);
    if ($('#sumOdds')) $('#sumOdds').textContent = s.avg_odds == null ? '—' : odds(s.avg_odds);
    if ($('#sumNet')) $('#sumNet').textContent = money(s.net || 0);
    if ($('#sumRoi')) $('#sumRoi').textContent = s.roi == null ? '—' : pct(s.roi);

    const historyLabel = voids.length ? `${settled.length} settled · ${voids.length} void` : `${settled.length} settled`;
    const historyCount = $('#historyCount');
    if (historyCount) historyCount.textContent = historyLabel;
    const historyTab = $('.king-tabs button[data-tab="history"]');
    if (historyTab) historyTab.textContent = `HISTORY · ${history.length}`;

    const orderedHistory = history.slice().sort(resultOrder);
    const historyPages = pageCount(orderedHistory.length);
    pageState.history = Math.min(historyPages, Math.max(1, pageState.history || 1));
    const historyStart = (pageState.history - 1) * PAGE_SIZE;
    const historyPage = orderedHistory.slice(historyStart, historyStart + PAGE_SIZE);
    const historyRows = $('#historyRows');
    if (historyRows) {
      historyRows.innerHTML = historyPage.map(x => {
        const result = String(x.result || '').toUpperCase();
        const pl = Number(x.profit || 0);
        const title = result === 'VOID' ? ' title="Invalidated: AH sign was reversed by v1 engine"' : '';
        return `<tr${title}><td>${x.date || '—'}</td><td>${x.pick || '—'}</td><td>${odds(x.odds)}</td><td>${x.ft || '—'}</td><td><span class="king-result ${cls(result)}">${resultText(result)}</span></td><td class="king-pl ${pl >= 0 ? 'positive' : 'negative'}">${money(pl)}</td></tr>`;
      }).join('');
    }
    renderPager('history', orderedHistory.length);

    const byDay = new Map();
    settled.forEach(x => {
      const date = x.date || '—';
      const result = String(x.result || '').toUpperCase();
      const d = byDay.get(date) || {p:0, w:0, l:0, push:0, net:0};
      d.p += 1;
      d.w += ['WIN','HALF_WIN'].includes(result) ? 1 : 0;
      d.l += ['LOSS','HALF_LOSS'].includes(result) ? 1 : 0;
      d.push += result === 'PUSH' ? 1 : 0;
      d.net += Number(x.profit || 0);
      byDay.set(date, d);
    });
    const daily = [...byDay.entries()].sort((a,b) => b[0].localeCompare(a[0]));
    const dailyPages = pageCount(daily.length);
    pageState.daily = Math.min(dailyPages, Math.max(1, pageState.daily || 1));
    const dailyStart = (pageState.daily - 1) * PAGE_SIZE;
    const dailyPage = daily.slice(dailyStart, dailyStart + PAGE_SIZE);
    const dailyRows = $('#dailyRows');
    if (dailyRows) {
      dailyRows.innerHTML = dailyPage.map(([date, d]) => {
        const decided = d.w + d.l;
        const rate = decided ? d.w / decided * 100 : null;
        return `<tr><td>${date}</td><td>${d.p}</td><td class="king-result win">${d.w}</td><td class="king-result loss">${d.l}</td><td>${rate == null ? '—' : pct(rate)}</td><td class="king-pl ${d.net >= 0 ? 'positive' : 'negative'}">${money(d.net)}</td></tr>`;
      }).join('');
    }
    renderPager('daily', daily.length);

    const hero = $('.king-hero p');
    if (hero) hero.textContent = 'ADD K pre-match selection · combined verified statistics since 04/09/2026 · invalid AH v1 excluded as VOID';

    if (activeTab() === 'history' || activeTab() === 'daily') writeUrl(activeTab());
  }

  function bindTabUrlState() {
    document.querySelectorAll('.king-tabs button[data-tab]').forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.dataset.tab || 'today';
        setTimeout(() => writeUrl(tab), 0);
      });
    });
  }

  function restoreRequestedTab() {
    const button = document.querySelector(`.king-tabs button[data-tab="${queryTab}"]`);
    if (!button) return;
    button.click();
    if (queryTab === 'today') applyTodayPagination();
    else if (lastData && pageState[queryTab] !== undefined) render(lastData);
  }

  async function load() {
    try {
      const r = await fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      render(await r.json());
    } catch (e) {
      console.warn('KING Statistics V3 unavailable', e);
    }
  }

  function boot() {
    ensurePresentationStyle();
    bindTabUrlState();
    startTodayPagination();
    window.NOMAD_KING_STATS_V3_ACTIVE = true;
    load();
    setTimeout(load, 2500);
    setInterval(load, 60000);
    [80, 700, 2800].forEach(delay => setTimeout(restoreRequestedTab, delay));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();