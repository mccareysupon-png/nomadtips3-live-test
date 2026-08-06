(() => {
  'use strict';

  const PAGE_SIZE = 50;
  let currentPage = 1;
  let tbody = null;
  let controls = null;

  function installStyles() {
    if (document.querySelector('#nomad-history-pagination-styles')) return;
    const style = document.createElement('style');
    style.id = 'nomad-history-pagination-styles';
    style.textContent = `
      .history-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:#202522}
      .history-pagination[hidden]{display:none!important}
      .history-pagination__status{color:var(--muted);font-size:8.5px;font-weight:800;line-height:1.4}
      .history-pagination__controls{display:flex;align-items:center;justify-content:flex-end;gap:5px;flex-wrap:wrap}
      .history-pagination button{min-width:31px;min-height:30px;padding:5px 8px;border:1px solid #494949;border-radius:5px;background:#1b1b1b;color:var(--muted);font-size:8px;font-weight:900;cursor:pointer}
      .history-pagination button:hover:not(:disabled),.history-pagination button.active{border-color:#2a8a67;background:#0c3c2d;color:#fff}
      .history-pagination button:disabled{cursor:not-allowed;opacity:.38}
      .history-pagination__ellipsis{display:inline-flex;align-items:center;justify-content:center;min-width:18px;color:#7d8782;font-size:9px}
      @media(max-width:720px){.history-pagination{align-items:stretch;padding:9px 10px}.history-pagination__status{width:100%;text-align:center}.history-pagination__controls{width:100%;justify-content:center}.history-pagination button{min-width:30px}}
    `;
    document.head.appendChild(style);
  }

  function ensureControls() {
    if (controls) return controls;
    controls = document.createElement('nav');
    controls.id = 'historyPagination';
    controls.className = 'history-pagination';
    controls.setAttribute('aria-label', 'History table pages');
    const anchor = tbody.closest('.table-wrap') || tbody.closest('table') || tbody;
    anchor.insertAdjacentElement('afterend', controls);
    return controls;
  }

  function pageItems(totalPages) {
    if (totalPages <= 7) return Array.from({length:totalPages}, (_, index) => index + 1);
    const selected = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
    const pages = [...selected].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
    const output = [];
    pages.forEach((value, index) => {
      if (index && value - pages[index - 1] > 1) output.push('ellipsis');
      output.push(value);
    });
    return output;
  }

  function applyPagination() {
    if (!tbody) return;
    const rows = [...tbody.querySelectorAll(':scope > tr')];
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);

    rows.forEach((row, index) => {
      row.hidden = index < start || index >= end;
    });

    const pager = ensureControls();
    pager.dataset.totalPages = String(totalPages);
    pager.hidden = totalPages <= 1;
    if (totalPages <= 1) return;

    const pages = pageItems(totalPages).map(item => item === 'ellipsis'
      ? '<span class="history-pagination__ellipsis" aria-hidden="true">…</span>'
      : `<button type="button" data-history-page="${item}" class="${item === currentPage ? 'active' : ''}" aria-label="Open history page ${item}" ${item === currentPage ? 'aria-current="page"' : ''}>${item}</button>`
    ).join('');

    pager.innerHTML = `
      <span class="history-pagination__status">Showing ${start + 1}–${end} of ${total} records · 50 per page</span>
      <span class="history-pagination__controls">
        <button type="button" data-history-page="previous" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous history page">← Previous</button>
        ${pages}
        <button type="button" data-history-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next history page">Next →</button>
      </span>`;
  }

  function handlePageClick(event) {
    const button = event.target.closest('[data-history-page]');
    if (!button || !controls?.contains(button)) return;
    const totalPages = Number(controls.dataset.totalPages || 1);
    const action = button.dataset.historyPage;
    if (action === 'previous') currentPage -= 1;
    else if (action === 'next') currentPage += 1;
    else currentPage = Number(action) || 1;
    currentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
    applyPagination();
    tbody.closest('.panel')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function init() {
    tbody = document.querySelector('#historyRows');
    if (!tbody) return;
    installStyles();
    ensureControls();
    applyPagination();
    new MutationObserver(applyPagination).observe(tbody, {childList:true});
    document.addEventListener('click', handlePageClick);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
