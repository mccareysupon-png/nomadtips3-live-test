(() => {
  'use strict';

  // DISPLAY ONLY: this adapter never writes the KING feed, settlement state, or result history.
  const KING_FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const PRIMARY = 'https://nomadtips3-live-score-feed-v3.mccarey-supon.workers.dev/feed';
  const FALLBACK = 'https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev/feed';
  const POLL_MS = 10000;
  const FEED_REFRESH_MS = 60000;
  const TIMEOUT_MS = 8000;

  const clean = value => String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(fc|afc|cf|sc|club)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokenSet = value => new Set(clean(value).split(' ').filter(Boolean));

  function sameTeam(a, b) {
    const aa = clean(a), bb = clean(b);
    if (!aa || !bb) return false;
    if (aa === bb) return true;
    if (aa.length >= 4 && bb.length >= 4 && (aa.includes(bb) || bb.includes(aa))) return true;
    const as = tokenSet(aa), bs = tokenSet(bb);
    if (!as.size || !bs.size) return false;
    let common = 0;
    for (const token of as) if (bs.has(token)) common++;
    return common / Math.min(as.size, bs.size) >= 0.75;
  }

  function pairMatches(pick, match) {
    return sameTeam(pick?.home, match?.home) && sameTeam(pick?.away, match?.away);
  }

  function scoreOf(match) {
    const score = Array.isArray(match?.score) ? match.score : null;
    const home = Number(score?.[0]);
    const away = Number(score?.[1]);
    return Number.isFinite(home) && Number.isFinite(away) ? [home, away] : null;
  }

  function statusText(match) {
    return String(match?.status ?? match?.phase ?? match?.state ?? '').trim().toUpperCase();
  }

  function isFinished(match) {
    const status = statusText(match);
    return match?.finished === true || match?.isFinished === true || Number(match?.state) === -1 ||
      /^(FT|FINISHED|FULL TIME|FULL_TIME|ENDED|CLOSED)$/.test(status);
  }

  function isLive(match) {
    const minute = Number(match?.minute);
    const status = statusText(match);
    return match?.live === true || match?.isLive === true || (Number.isFinite(minute) && minute > 0 && minute <= 130) ||
      /^(LIVE|1H|2H|HT|ET|PEN|PENALTIES)$/.test(status);
  }

  async function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const joiner = url.includes('?') ? '&' : '?';
      const response = await fetch(`${url}${joiner}kingLive=${Date.now()}`, {cache: 'no-store', signal: controller.signal});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadLiveFeed() {
    try {
      const data = await fetchJson(PRIMARY);
      if (!data || !Array.isArray(data.matches)) throw new Error('invalid primary feed');
      return data;
    } catch (_) {
      const data = await fetchJson(FALLBACK);
      if (!data || !Array.isArray(data.matches)) throw new Error('invalid fallback feed');
      return data;
    }
  }

  let kingData = null;
  let kingLoadedAt = 0;
  let liveData = null;
  const finalCache = new Map();

  async function loadKingFeed(force = false) {
    if (!force && kingData && Date.now() - kingLoadedAt < FEED_REFRESH_MS) return kingData;
    kingData = await fetchJson(KING_FEED);
    kingLoadedAt = Date.now();
    return kingData;
  }

  function ensureStyle() {
    if (document.getElementById('king-live-score-style')) return;
    const style = document.createElement('style');
    style.id = 'king-live-score-style';
    style.textContent = `
      .king-live-score-inline{display:inline-block;margin-left:8px;font-size:9px;font-weight:900;letter-spacing:.035em;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:baseline}
      .king-live-score-inline[data-mode="live"]{color:var(--green,#83df89)}
      .king-live-score-inline[data-mode="final"]{color:#aeb7b0}
      @media(max-width:699px){.king-live-score-inline{display:block;margin:3px 0 0;font-size:8px}}
    `;
    document.head.appendChild(style);
  }

  function baseRows() {
    const tbody = document.getElementById('todayRows');
    if (!tbody) return [];
    return [...tbody.children].filter(node => node.tagName === 'TR' && !node.classList.contains('king-expand-row'));
  }

  function setVisual(row, label, mode) {
    const cell = row?.cells?.[0];
    if (!cell) return;
    let node = cell.querySelector(':scope > .king-live-score-inline');
    if (!label) {
      node?.remove();
      return;
    }
    if (!node) {
      node = document.createElement('span');
      node.className = 'king-live-score-inline';
      node.setAttribute('aria-live', 'polite');
      cell.appendChild(node);
    }
    if (node.textContent !== label) node.textContent = label;
    node.dataset.mode = mode;
  }

  function visualFor(pick, match) {
    const settledFt = String(pick?.ft || '').trim();
    if (settledFt) return {label: `FT ${settledFt.replace('-', '–')}`, mode: 'final'};

    const score = scoreOf(match);
    if (!score) return finalCache.get(String(pick?.id || '')) || null;

    if (isFinished(match)) {
      const visual = {label: `FT ${score[0]}–${score[1]}`, mode: 'final'};
      if (pick?.id) finalCache.set(String(pick.id), visual);
      return visual;
    }

    if (!isLive(match)) return finalCache.get(String(pick?.id || '')) || null;
    const minute = Number(match?.minute);
    return {
      label: Number.isFinite(minute) ? `LIVE ${Math.round(minute)}′ · ${score[0]}–${score[1]}` : `LIVE · ${score[0]}–${score[1]}`,
      mode: 'live'
    };
  }

  function render() {
    const picks = Array.isArray(kingData?.today) ? kingData.today : [];
    const rows = baseRows();
    if (!picks.length || !rows.length) return;

    const matches = Array.isArray(liveData?.matches) ? liveData.matches : [];
    rows.forEach((row, index) => {
      const pick = picks[index];
      if (!pick) {
        setVisual(row, '', '');
        return;
      }
      const match = matches.find(item => pairMatches(pick, item));
      const visual = visualFor(pick, match);
      setVisual(row, visual?.label || '', visual?.mode || '');
    });
  }

  function clearStaleLive() {
    for (const row of baseRows()) {
      const node = row.cells?.[0]?.querySelector(':scope > .king-live-score-inline[data-mode="live"]');
      node?.remove();
    }
  }

  let busy = false;
  async function tick() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      const data = await loadKingFeed();
      const picks = Array.isArray(data?.today) ? data.today : [];
      render();
      if (!picks.some(pick => String(pick?.result || 'PENDING').toUpperCase() === 'PENDING')) {
        liveData = {matches: []};
        render();
        return;
      }
      liveData = await loadLiveFeed();
      render();
    } catch (_) {
      clearStaleLive();
      render();
    } finally {
      busy = false;
    }
  }

  function start() {
    ensureStyle();
    const tbody = document.getElementById('todayRows');
    if (!tbody) return;

    const observer = new MutationObserver(() => render());
    observer.observe(tbody, {childList: true});

    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('pagehide', () => {
      clearInterval(timer);
      observer.disconnect();
    }, {once: true});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
