// Keep this as browser source text so the Worker bundler cannot rewrite it.
export const clientCode = String.raw`
(() => {
  'use strict';
  const ID = 'ball46-daily-performance';
  const CACHE_KEY = 'b46:performance-summary:v1';
  const UPDATE = '/__performance_test/summary';
  const FRESH_MS = 90000;
  const DAY_MS = 86400000;
  const visibleOnDevice = matchMedia('(min-width: 761px)');
  const root = document.getElementById(ID);
  if (!root) return;
  const shell = root.cloneNode(true);
  const defaultFields = ['label', 'rate', 'stat', 'avg-odds', 'total'];
  const fields = [...root.querySelectorAll('[data-b46-label],[data-b46-rate],[data-b46-stat],[data-b46-avg-odds],[data-b46-total]')]
    .map(node => defaultFields.map(kind => [kind, node.getAttribute('data-b46-' + kind)]).find(([, key]) => key !== null));
  let view;
  let freshness;
  let refreshTimer;
  let stateTimer;
  let pending = false;

  function useable(candidate, now = Date.now()) {
    return (candidate?.state === 'current' || candidate?.state === 'saved') &&
      Number.isFinite(candidate.expiresAt) && candidate.expiresAt > now &&
      Number.isFinite(candidate.verifiedAt) && candidate.verifiedAt > 0 &&
      candidate.verifiedAt <= now + 60000 && now - candidate.verifiedAt < DAY_MS &&
      fields.every(([kind, key]) => typeof candidate.fields?.[kind + ':' + key] === 'string') &&
      ['today', 'yesterday'].every(key => ['positive','neutral','negative'].includes(candidate.tones?.[key]));
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
  }

  function writeCache(candidate) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(candidate)); } catch {}
  }

  function paint() {
    const card = document.getElementById(ID);
    if (!card) return;
    const now = Date.now();
    const usable = useable(view, now);
    const current = usable && freshness === 'current' && now - view.verifiedAt <= FRESH_MS;
    const state = current ? 'current' : usable ? 'saved' : 'waiting';
    if (card.dataset.b46PerformanceState !== state) card.dataset.b46PerformanceState = state;

    for (const [kind, key] of fields) {
      const node = card.querySelector('[data-b46-' + kind + '="' + key + '"]');
      if (!node) continue;
      const source = view?.fields?.[kind + ':' + key];
      let text = source;
      if (kind === 'label') {
        if (!usable && view?.state !== 'waiting') text = 'Awaiting update';
        if (usable && !current) text = source.replace(/^(?:Live|Final) Summary/, 'Saved Summary');
      } else if (!usable) {
        text = '—';
      }
      if (text && node.textContent !== text) node.textContent = text;
      if (kind === 'rate') {
        const tone = usable ? view.tones[key] : 'neutral';
        if (node.dataset.b46RateTone !== tone) node.dataset.b46RateTone = tone;
      }
    }

    if (usable) {
      card.dataset.b46PerformanceUpdatedAt = String(view.verifiedAt);
      card.title = 'Last validated Statistics snapshot: ' + new Date(view.verifiedAt).toISOString();
    } else {
      delete card.dataset.b46PerformanceUpdatedAt;
      card.title = 'Waiting for a verified Performance summary';
    }

    clearTimeout(stateTimer);
    if (usable) {
      const next = current ? Math.min(view.expiresAt, view.verifiedAt + FRESH_MS + 1) : view.expiresAt;
      stateTimer = setTimeout(() => {
        paint();
        if (!useable(view)) schedule(0);
      }, Math.max(0, next - now));
    }
  }

  function accept(candidate, source) {
    if (!useable(candidate) || (useable(view) && candidate.verifiedAt < view.verifiedAt)) return;
    if (source === 'cache' && freshness === 'current' && candidate.verifiedAt === view.verifiedAt) return;
    view = candidate;
    freshness = source === 'cache' ? 'saved' : candidate.state;
    if (source !== 'cache') writeCache(candidate);
    paint();
  }

  function schedule(delay) {
    clearTimeout(refreshTimer);
    if (!document.hidden && visibleOnDevice.matches) refreshTimer = setTimeout(update, delay);
  }

  async function update() {
    if (document.hidden || pending) return;
    pending = true;
    try {
      const response = await fetch(UPDATE, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Summary unavailable');
      const candidate = await response.json();
      if (useable(candidate)) accept(candidate, 'server');
      else if (!useable(view) && candidate?.state === 'waiting') {
        view = candidate;
        paint();
      }
    } catch {
      freshness = 'saved';
      paint();
    } finally {
      pending = false;
      schedule(nextRefresh());
    }
  }

  function mountIfNeeded() {
    if (document.getElementById(ID)) return;
    const board = document.querySelector('.main-board');
    if (!board) return;
    const toolbar = board.querySelector(':scope > .board-toolbar');
    if (toolbar) toolbar.after(shell.cloneNode(true));
    else board.prepend(shell.cloneNode(true));
    paint();
  }

  try { view = JSON.parse(document.getElementById('b46-performance-summary-data').textContent); } catch {}
  if (useable(view)) accept(view, 'server');
  else { accept(readCache(), 'cache'); paint(); }
  const board = root.closest('.main-board');
  if (board) new MutationObserver(mountIfNeeded).observe(board, { childList: true });
  document.addEventListener('ball46:workspace-view', mountIfNeeded);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(refreshTimer);
    else { mountIfNeeded(); paint(); schedule(0); }
  });
  window.addEventListener('storage', event => {
    if (event.key === CACHE_KEY) accept(readCache(), 'cache');
  });
  function nextRefresh() {
    return useable(view) ? Math.max(15000, view.verifiedAt + 45000 - Date.now()) : 8000;
  }
  visibleOnDevice.addEventListener('change', () => schedule(0));
  schedule(useable(view) ? nextRefresh() : 2000);
})();
`;
