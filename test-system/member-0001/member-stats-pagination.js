const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const PAGE_SIZE = 50;
const $ = selector => document.querySelector(selector);

let activeSource = readSourceFromUrl();
let currentPage = readPageFromUrl();
let lastPagePayload = null;
let renderingTable = false;

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fmtOdds(value) {
  const n = numeric(value);
  return n !== null && n > 0 ? n.toFixed(2) : 'N/A';
}

function dateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(d);
}

function sourceParam() {
  return activeSource === 'live' ? 'LIVE_SIGNAL' : 'BALL_TENG';
}

function sourceLabel(source = activeSource) {
  return source === 'live' ? 'บอลสด' : 'บอลเต็ง';
}

function readSourceFromUrl() {
  const value = String(new URL(location.href).searchParams.get('statsType') || '').toLowerCase();
  return value === 'live' ? 'live' : 'ball-teng';
}

function readPageFromUrl() {
  const url = new URL(location.href);
  const parsed = Math.floor(Number(url.searchParams.get('statsPage') || 1));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function pageHref(page) {
  const url = new URL(location.href);
  url.searchParams.set('statsType', activeSource);
  url.searchParams.set('statsPage', String(page));
  url.hash = 'stats';
  return `${url.pathname}${url.search}${url.hash}`;
}

async function request(path, source = sourceParam()) {
  const url = new URL(`${WORKER}${path}`);
  url.searchParams.set('member', MEMBER_ID);
  if (source) url.searchParams.set('source', source);
  url.searchParams.set('_', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function ensureStyles() {
  if ($('#memberStatsPaginationStyles')) return;
  const style = document.createElement('style');
  style.id = 'memberStatsPaginationStyles';
  style.textContent = `
    .member-stats-source-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0 14px;padding:5px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025)}
    .member-stats-source-tabs button{border:1px solid transparent;border-radius:8px;background:transparent;color:#8f9893;padding:9px 10px;font-size:10px;font-weight:900;cursor:pointer}
    .member-stats-source-tabs button.active{border-color:rgba(37,213,138,.35);background:rgba(37,213,138,.09);color:#25d58a}
    .member-stats-source-note{margin:-4px 0 10px;color:#727b76;font-size:8px;text-align:center}
    .member-stats-pager{display:flex;align-items:center;justify-content:center;gap:4px;flex-wrap:wrap;margin:12px 0 2px}
    .member-stats-pager a,.member-stats-pager span{display:inline-flex;align-items:center;justify-content:center;min-width:27px;height:27px;padding:0 7px;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:rgba(255,255,255,.025);color:#9da6a1;text-decoration:none;font-size:8px;font-weight:850}
    .member-stats-pager a:hover{border-color:rgba(37,213,138,.35);color:#25d58a}.member-stats-pager a.active{border-color:rgba(37,213,138,.45);background:rgba(37,213,138,.09);color:#25d58a;pointer-events:none}
    .member-stats-pager span.ellipsis{min-width:18px;border:0;background:transparent;color:#68716c;padding:0}
    .member-stats-page-note{text-align:center;margin-top:6px;color:#727b76;font-size:7px}
    @media(max-width:520px){.member-stats-pager{gap:3px}.member-stats-pager a,.member-stats-pager span{min-width:25px;height:25px;padding:0 6px}}
  `;
  document.head.appendChild(style);
}

function ensureSourceTabs() {
  const view = $('.view[data-view="stats"]');
  const grid = view?.querySelector('.stats-grid');
  if (!view || !grid) return;
  let tabs = $('#memberStatsSourceTabs');
  if (!tabs) {
    tabs = document.createElement('div');
    tabs.id = 'memberStatsSourceTabs';
    tabs.className = 'member-stats-source-tabs';
    tabs.innerHTML = '<button type="button" data-member-stats-source="ball-teng">สถิติบอลเต็ง</button><button type="button" data-member-stats-source="live">สถิติบอลสด</button>';
    grid.insertAdjacentElement('beforebegin', tabs);
    const note = document.createElement('div');
    note.id = 'memberStatsSourceNote';
    note.className = 'member-stats-source-note';
    tabs.insertAdjacentElement('afterend', note);
    tabs.querySelectorAll('[data-member-stats-source]').forEach(button => {
      button.addEventListener('click', () => switchSource(button.dataset.memberStatsSource));
    });
  }
  tabs.querySelectorAll('[data-member-stats-source]').forEach(button => {
    button.classList.toggle('active', button.dataset.memberStatsSource === activeSource);
  });
  const note = $('#memberStatsSourceNote');
  if (note) note.textContent = `${sourceLabel()} · แยกสถิติออกจากอีกระบบอย่างอิสระ`;
  const heading = view.querySelector('.section-head h2');
  if (heading) heading.textContent = `สถิติ${sourceLabel()} · Member #${MEMBER_ID}`;
}

function ensureAvgOddsBox() {
  const grid = $('.view[data-view="stats"] .stats-grid');
  if (!grid || $('#statAvgOdds')) return;
  const box = document.createElement('div');
  box.className = 'stat-box';
  box.innerHTML = '<small>AVG ODDS</small><b id="statAvgOdds">—</b><p>ราคาเฉลี่ยเฉพาะ Win/Loss decisions</p>';
  grid.appendChild(box);
}

function renameSummaryLabels() {
  const mapping = [
    ['#statTotal', 'TOTAL'],
    ['#statSettled', 'SETTLED'],
    ['#statCorrect', 'WIN'],
    ['#statIncorrect', 'LOSS'],
    ['#statAccuracy', 'WIN RATE']
  ];
  for (const [selector, label] of mapping) {
    const node = $(selector);
    const small = node?.closest('.stat-box')?.querySelector('small');
    if (small) small.textContent = label;
  }
}

function updateSummary(payload) {
  const summary = payload?.summary || {};
  ensureAvgOddsBox();
  renameSummaryLabels();
  ensureSourceTabs();
  if ($('#statTotal')) $('#statTotal').textContent = summary.total ?? 0;
  if ($('#statSettled')) $('#statSettled').textContent = summary.settled ?? 0;
  if ($('#statCorrect')) $('#statCorrect').textContent = summary.correct ?? 0;
  if ($('#statIncorrect')) $('#statIncorrect').textContent = summary.incorrect ?? 0;
  if ($('#statAccuracy')) $('#statAccuracy').textContent = summary.accuracy == null ? '—' : `${Number(summary.accuracy).toFixed(2)}%`;
  if ($('#statAvgOdds')) $('#statAvgOdds').textContent = summary.avgOdds == null ? '—' : Number(summary.avgOdds).toFixed(2);
}

async function loadOverviewSplitSummary() {
  try {
    const [ball, live] = await Promise.all([
      request('/member-stats-summary', 'BALL_TENG'),
      request('/member-stats-summary', 'LIVE_SIGNAL')
    ]);
    const b = ball?.summary || {};
    const l = live?.summary || {};
    const ballText = b.accuracy == null ? `บอลเต็ง ${b.total || 0} รายการ` : `บอลเต็ง ${Number(b.accuracy).toFixed(1)}%`;
    const liveText = l.accuracy == null ? `บอลสด ${l.total || 0} รายการ` : `บอลสด ${Number(l.accuracy).toFixed(1)}%`;
    if ($('#overviewStatsState')) $('#overviewStatsState').textContent = `${ballText} · ${liveText}`;
  } catch {}
}

function outcomeClass(value) {
  const result = String(value || 'PENDING').toLowerCase();
  if (['correct', 'win', 'half-win'].includes(result)) return 'correct';
  if (['incorrect', 'loss', 'half-loss'].includes(result)) return 'incorrect';
  return 'pending';
}

function pageTokens(totalPages, page) {
  if (totalPages <= 9) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages]);
  if (page <= 5) {
    for (let n = 1; n <= 6; n += 1) pages.add(n);
  } else if (page >= totalPages - 4) {
    for (let n = totalPages - 5; n <= totalPages; n += 1) pages.add(n);
  } else {
    for (let n = page - 2; n <= page + 2; n += 1) pages.add(n);
  }
  const ordered = [...pages].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const tokens = [];
  ordered.forEach((n, index) => {
    if (index && n - ordered[index - 1] > 1) tokens.push('…');
    tokens.push(n);
  });
  return tokens;
}

function pagerHtml(pagination) {
  const totalPages = Number(pagination?.totalPages || 0);
  const page = Number(pagination?.page || 1);
  if (totalPages <= 1) return '';
  const tokens = pageTokens(totalPages, page);
  return `<nav class="member-stats-pager" aria-label="หน้าสถิติ">
    ${page > 1 ? `<a href="${escapeHtml(pageHref(page - 1))}" data-stats-page="${page - 1}" aria-label="หน้าก่อนหน้า">‹</a>` : ''}
    ${tokens.map(token => token === '…'
      ? '<span class="ellipsis">…</span>'
      : `<a href="${escapeHtml(pageHref(token))}" data-stats-page="${token}" class="${token === page ? 'active' : ''}">${token}</a>`).join('')}
    ${page < totalPages ? `<a href="${escapeHtml(pageHref(page + 1))}" data-stats-page="${page + 1}" aria-label="หน้าถัดไป">›</a>` : ''}
  </nav>`;
}

function bindPager() {
  document.querySelectorAll('[data-stats-page]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const page = Math.max(1, Number(link.dataset.statsPage || 1));
      const url = new URL(location.href);
      url.searchParams.set('statsType', activeSource);
      url.searchParams.set('statsPage', String(page));
      url.hash = 'stats';
      history.pushState({ statsPage: page, statsType: activeSource }, '', url);
      currentPage = page;
      loadPage(page, true);
    });
  });
}

function renderPage(payload) {
  const table = $('#historyTable');
  if (!table) return;
  lastPagePayload = payload;
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const pagination = payload?.pagination || { page: 1, pageSize: PAGE_SIZE, total: records.length, totalPages: records.length ? 1 : 0 };
  currentPage = Number(pagination.page || 1);
  renderingTable = true;

  if (!records.length) {
    table.innerHTML = `<div class="empty">ยังไม่มีสถิติ${escapeHtml(sourceLabel())}ของสมาชิก</div>`;
  } else {
    table.innerHTML = `<div class="history-row head"><span>Date</span><span>Market / Fixture</span><span>Pick</span><span>Odds</span><span>Result</span></div>${records.map(row => {
      const cls = outcomeClass(row.outcome);
      return `<div class="history-row"><span>${escapeHtml(dateTime(row.created_at))}</span><b>${escapeHtml(row.market || '—')} · ${escapeHtml(row.fixture_id || '—')}</b><span>${escapeHtml(row.pick || '—')}</span><span>${escapeHtml(fmtOdds(row.odds))}</span><span class="outcome ${cls}">${escapeHtml(String(row.outcome || 'PENDING').toUpperCase())}</span></div>`;
    }).join('')}${pagerHtml(pagination)}<div class="member-stats-page-note">${escapeHtml(sourceLabel())} · 50 รายการต่อหน้า · ทั้งหมด ${Number(pagination.total || 0)} รายการ</div>`;
  }

  const meta = $('#statsMeta');
  if (meta) {
    const pageText = Number(pagination.totalPages || 0) ? `หน้า ${pagination.page}/${pagination.totalPages}` : 'ยังไม่มีรายการ';
    meta.textContent = `${sourceLabel()} · ${pageText} · ${Number(pagination.total || 0)} record(s)`;
  }
  bindPager();
  queueMicrotask(() => { renderingTable = false; });
}

async function loadSummary() {
  try {
    updateSummary(await request('/member-stats-summary'));
  } catch {}
}

async function loadPage(page = currentPage, scroll = false) {
  try {
    const payload = await request(`/member-stats-page?page=${encodeURIComponent(page)}`);
    renderPage(payload);
    if (scroll) $('.view[data-view="stats"] .section-head:nth-of-type(2)')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {}
}

function switchSource(source) {
  const next = source === 'live' ? 'live' : 'ball-teng';
  if (next === activeSource) return;
  activeSource = next;
  currentPage = 1;
  lastPagePayload = null;
  const url = new URL(location.href);
  url.searchParams.set('statsType', activeSource);
  url.searchParams.set('statsPage', '1');
  url.hash = 'stats';
  history.replaceState({ statsPage: 1, statsType: activeSource }, '', url);
  ensureSourceTabs();
  loadSummary();
  loadPage(1);
}

function protectPaginatedTable() {
  const table = $('#historyTable');
  if (!table) return;
  const observer = new MutationObserver(() => {
    if (renderingTable || !lastPagePayload) return;
    window.setTimeout(() => {
      if (!renderingTable && lastPagePayload) renderPage(lastPagePayload);
    }, 0);
  });
  observer.observe(table, { childList: true });
}

ensureStyles();
ensureSourceTabs();
ensureAvgOddsBox();
renameSummaryLabels();
protectPaginatedTable();
window.setTimeout(() => {
  loadSummary();
  loadOverviewSplitSummary();
  loadPage(currentPage);
}, 900);
window.setInterval(() => {
  loadSummary();
  loadOverviewSplitSummary();
  loadPage(currentPage);
}, 30000);
window.addEventListener('popstate', () => {
  activeSource = readSourceFromUrl();
  currentPage = readPageFromUrl();
  ensureSourceTabs();
  loadSummary();
  loadOverviewSplitSummary();
  loadPage(currentPage);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    loadSummary();
    loadOverviewSplitSummary();
    loadPage(currentPage);
  }
});
