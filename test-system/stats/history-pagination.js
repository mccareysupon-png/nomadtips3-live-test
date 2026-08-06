const DEFAULT_PAGE_SIZE = 50;
let currentPage = 1;
let lastOptions = null;
let listenerInstalled = false;
let stylesInstalled = false;

function installStyles() {
  if (stylesInstalled || document.querySelector('#nomad-history-pagination-styles')) return;
  stylesInstalled = true;
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
    @media(max-width:720px){.history-pagination{align-items:stretch;padding:9px 10px}.history-pagination__status{width:100%;text-align:center}.history-pagination__controls{width:100%;justify-content:center}.history-pagination button{flex:0 1 auto;min-width:30px}}
  `;
  document.head.appendChild(style);
}

function ensureControls(tbody, id) {
  let controls = document.getElementById(id);
  if (controls) return controls;
  controls = document.createElement('nav');
  controls.id = id;
  controls.className = 'history-pagination';
  controls.setAttribute('aria-label', 'History table pages');
  const anchor = tbody.closest('.table-wrap') || tbody.closest('table') || tbody;
  anchor.insertAdjacentElement('afterend', controls);
  return controls;
}

function pageItems(totalPages, page) {
  if (totalPages <= 7) return Array.from({length:totalPages}, (_, index) => index + 1);
  const items = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...items].filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const output = [];
  pages.forEach((value, index) => {
    if (index && value - pages[index - 1] > 1) output.push('ellipsis');
    output.push(value);
  });
  return output;
}

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-history-page]');
    if (!button || !lastOptions) return;
    const action = button.dataset.historyPage;
    const totalPages = Number(button.closest('.history-pagination')?.dataset.totalPages || 1);
    if (action === 'previous') currentPage -= 1;
    else if (action === 'next') currentPage += 1;
    else currentPage = Number(action) || 1;
    currentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
    renderHistoryPagination(lastOptions);
    const panel = lastOptions.tbody.closest('.panel');
    panel?.scrollIntoView({behavior:'smooth',block:'start'});
  });
}

export function renderHistoryPagination({
  rows,
  tbody,
  renderRow,
  pageSize = DEFAULT_PAGE_SIZE,
  reverse = true,
  controlsId = 'historyPagination'
}) {
  if (!tbody || typeof renderRow !== 'function') return;
  installStyles();
  installListener();
  lastOptions = {rows,tbody,renderRow,pageSize,reverse,controlsId};

  const ordered = reverse ? [...rows].reverse() : [...rows];
  const total = ordered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, total);
  const visible = ordered.slice(start, end);

  tbody.innerHTML = visible.map((row, pageIndex) => renderRow(row, start + pageIndex, total)).join('');

  const controls = ensureControls(tbody, controlsId);
  controls.dataset.totalPages = String(totalPages);
  controls.hidden = totalPages <= 1;
  if (totalPages <= 1) return;

  const pages = pageItems(totalPages, currentPage).map(item => item === 'ellipsis'
    ? '<span class="history-pagination__ellipsis" aria-hidden="true">…</span>'
    : `<button type="button" data-history-page="${item}" class="${item === currentPage ? 'active' : ''}" aria-label="Open history page ${item}" aria-current="${item === currentPage ? 'page' : 'false'}">${item}</button>`
  ).join('');

  controls.innerHTML = `
    <span class="history-pagination__status">Showing ${start + 1}–${end} of ${total} records · 50 per page</span>
    <span class="history-pagination__controls">
      <button type="button" data-history-page="previous" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous history page">← Previous</button>
      ${pages}
      <button type="button" data-history-page="next" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next history page">Next →</button>
    </span>`;
}
