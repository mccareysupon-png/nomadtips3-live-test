(() => {
  'use strict';

  const latestMatches = new Map();
  const nativeFetch = window.fetch.bind(window);
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const matchKey = match => String(match?.id ?? `${match?.home ?? ''}|${match?.away ?? ''}|${match?.league ?? ''}`);
  const bookmakerKey = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const fmtLine = value => finite(value) ? `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(2)}` : '—';
  const fmtOdds = value => finite(value) ? Number(value).toFixed(2) : '—';
  const fmtAge = value => finite(value) ? `${Math.max(0, Math.round(Number(value)))}s` : '—';

  function sourceQuality(source) {
    const status = String(source?.status || '').toUpperCase();
    const hasPrice = finite(source?.line) && finite(source?.odds);
    const statusRank = status === 'PASS' ? 5 : hasPrice ? 4 : status === 'WAIT' ? 3 : status === 'STALE' ? 2 : status === 'FAIL' ? 1 : 0;
    const updatedAt = finite(source?.sourceUpdatedAt) ? Number(source.sourceUpdatedAt) : 0;
    const age = finite(source?.priceAgeSeconds) ? Number(source.priceAgeSeconds) : Number.POSITIVE_INFINITY;
    const position = finite(source?.position) ? Number(source.position) : Number.POSITIVE_INFINITY;
    return {statusRank, updatedAt, age, position};
  }

  function preferSource(current, candidate) {
    if (!current) return candidate;
    const left = sourceQuality(current);
    const right = sourceQuality(candidate);
    if (right.statusRank !== left.statusRank) return right.statusRank > left.statusRank ? candidate : current;
    if (right.updatedAt !== left.updatedAt) return right.updatedAt > left.updatedAt ? candidate : current;
    if (right.age !== left.age) return right.age < left.age ? candidate : current;
    return right.position < left.position ? candidate : current;
  }

  function bookmakerRows(sources = []) {
    const grouped = new Map();
    for (const source of sources) {
      const bookmaker = String(source?.bookmaker || '').trim();
      if (!bookmaker) continue;
      const key = bookmakerKey(bookmaker);
      if (!key) continue;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {bookmaker, source, position: finite(source?.position) ? Number(source.position) : Number.POSITIVE_INFINITY});
        continue;
      }
      existing.source = preferSource(existing.source, source);
      if (finite(source?.position)) existing.position = Math.min(existing.position, Number(source.position));
    }
    return [...grouped.values()].sort((a, b) => a.position - b.position || a.bookmaker.localeCompare(b.bookmaker));
  }

  function publicStatus(source) {
    const status = String(source?.status || '').trim().toUpperCase();
    if (!status || status === 'UNAVAILABLE') return 'NO ODDS';
    if (status === 'PASS' || status === 'WAIT' || status === 'STALE' || status === 'FAIL') return status;
    return finite(source?.line) && finite(source?.odds) ? status : 'NO ODDS';
  }

  function statusClass(status) {
    if (status === 'PASS' || status === 'BEST') return 'is-pass';
    if (status === 'WAIT') return 'is-wait';
    if (status === 'STALE' || status === 'FAIL') return 'is-fail';
    return 'is-no-odds';
  }

  function marketRow(bookmaker, source) {
    const status = publicStatus(source);
    return `<div class="price-board-grid price-board-row ${statusClass(status)}">
      <span class="price-board-book" title="${esc(bookmaker)}">${esc(bookmaker)}</span>
      <span>${fmtLine(source?.line)}</span>
      <span>${fmtOdds(source?.odds)}</span>
      <span>${fmtAge(source?.priceAgeSeconds)}</span>
      <strong>${esc(status)}</strong>
    </div>`;
  }

  function selectedBlock(match) {
    const selected = match?.selectedPrice || null;
    const team = String(match?.home || 'HOME').trim() || 'HOME';
    const bookmaker = selected?.bookmaker || '—';
    const status = selected ? 'BEST' : 'NO ODDS';
    return `<div class="price-board-selected">
      <div class="price-board-selected-title"><span>SELECTED</span><strong title="${esc(team)}">${esc(team)}</strong></div>
      <div class="price-board-grid price-board-row is-selected ${statusClass(status)}">
        <span class="price-board-book" title="${esc(bookmaker)}">${esc(bookmaker)}</span>
        <span>${fmtLine(selected?.line)}</span>
        <span>${fmtOdds(selected?.odds)}</span>
        <span>${fmtAge(selected?.priceAgeSeconds)}</span>
        <strong>${esc(status)}</strong>
      </div>
    </div>`;
  }

  function board(match) {
    const rows = bookmakerRows(Array.isArray(match?.priceSources) ? match.priceSources : []);
    const body = rows.length
      ? rows.map(item => marketRow(item.bookmaker, item.source)).join('')
      : `<div class="price-board-empty">NO BOOKMAKER ODDS</div>`;
    return `<div class="price-board" data-price-board="1">
      <div class="price-board-grid price-board-head">
        <span>BOOKMAKER</span><span>AH</span><span>ODDS</span><span>AGE</span><span>STATUS</span>
      </div>
      <div class="price-board-body">${body}</div>
      ${selectedBlock(match)}
    </div>`;
  }

  function priceCard(detail) {
    return [...detail.querySelectorAll('.detail-card')].find(card =>
      String(card.querySelector('h3')?.textContent || '').trim().toUpperCase() === 'PRICE CHECK'
    ) || null;
  }

  function renderRow(row) {
    const id = row?.dataset?.matchId;
    if (!id) return;
    const match = latestMatches.get(id);
    const detail = row.querySelector('.match-detail');
    if (!match || !detail) return;
    const card = priceCard(detail);
    if (!card || card.querySelector('[data-price-board="1"]')) return;
    const heading = card.querySelector('h3');
    if (!heading) return;
    [...card.children].forEach(child => { if (child !== heading) child.remove(); });
    heading.insertAdjacentHTML('afterend', board(match));
  }

  function renderAll() {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(renderRow);
  }

  function rememberFeed(data) {
    if (!data || !Array.isArray(data.matches)) return;
    latestMatches.clear();
    data.matches.forEach(match => latestMatches.set(matchKey(match), match));
    requestAnimationFrame(renderAll);
    setTimeout(renderAll, 0);
  }

  window.fetch = async function(...args) {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (/\/feed(?:\?|$)/.test(url)) response.clone().json().then(rememberFeed).catch(() => {});
    } catch (_) {}
    return response;
  };

  const observer = new MutationObserver(renderAll);
  const start = () => {
    const list = document.querySelector('.match-list');
    if (list) observer.observe(list, {childList:true, subtree:true});
    renderAll();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
