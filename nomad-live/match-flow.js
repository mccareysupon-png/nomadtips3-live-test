(() => {
  'use strict';

  const latestMatches = new Map();
  const nativeFetch = window.fetch.bind(window);
  const finite = value => Number.isFinite(Number(value));
  const number = value => finite(value) ? Number(value) : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  const matchKey = match => String(match?.id ?? `${match?.home ?? ''}|${match?.away ?? ''}|${match?.league ?? ''}`);

  function metricRow(label, metric) {
    const home = number(metric?.home);
    const away = number(metric?.away);
    const total = home != null && away != null ? Math.max(0, home) + Math.max(0, away) : 0;
    const homeWidth = total > 0 && home != null ? Math.max(0, home) / total * 100 : 0;
    const awayWidth = total > 0 && away != null ? Math.max(0, away) / total * 100 : 0;
    return `<div class="flow-row">
      <span class="flow-label">${esc(label)}</span>
      <strong class="flow-value">${home ?? '—'}</strong>
      <span class="flow-track flow-home-track"><i style="width:${homeWidth.toFixed(1)}%"></i></span>
      <span class="flow-mid" aria-hidden="true"></span>
      <span class="flow-track flow-away-track"><i style="width:${awayWidth.toFixed(1)}%"></i></span>
      <strong class="flow-value">${away ?? '—'}</strong>
    </div>`;
  }

  function flowCard(match) {
    const rolling = match?.rolling || {};
    const delta = rolling?.recent?.delta || {};
    const windowMinutes = number(rolling?.windowMinutes);
    const titleWindow = windowMinutes != null ? windowMinutes : '—';
    return `<section class="detail-card match-flow-card detail-flow-card" data-match-flow="1">
      <h3>MATCH FLOW · LAST ${esc(titleWindow)} MIN</h3>
      <div class="flow-legend"><span></span><b class="flow-home-label">HOME</b><b class="flow-away-label">AWAY</b></div>
      <div class="flow-table">
        ${metricRow('ATTACKS', delta.attacks)}
        ${metricRow('DANGER', delta.dangerousAttack)}
        ${metricRow('SHOT ON', delta.shotsOn)}
        ${metricRow('SHOT OFF', delta.shotsOff)}
        ${metricRow('CORNERS', delta.corners)}
      </div>
    </section>`;
  }

  function cardTitle(card) {
    return (card?.querySelector('h3')?.textContent || '').trim().toUpperCase();
  }

  function organizeDetail(detail, match) {
    if (!detail || detail.dataset.flowLayout === '1') return;
    const cards = [...detail.querySelectorAll(':scope > .detail-card')];
    const rolling = cards.find(card => cardTitle(card).startsWith('HOME ROLLING DELTA'));
    const pressure = cards.find(card => cardTitle(card) === 'PRESSURE TREND');
    const detector = cards.find(card => cardTitle(card) === 'DETECTOR CHECK');
    const price = cards.find(card => cardTitle(card) === 'PRICE CHECK');
    if (!rolling || !pressure || !detector || !price) return;

    rolling.classList.add('detail-rolling-card');
    pressure.classList.add('detail-pressure-card');
    detector.classList.add('detail-detector-card');
    price.classList.add('detail-price-card');

    const left = document.createElement('div');
    left.className = 'detail-left-stack';
    const right = document.createElement('div');
    right.className = 'detail-right-stack';
    const flowHolder = document.createElement('div');
    flowHolder.innerHTML = flowCard(match);
    const flow = flowHolder.firstElementChild;

    detail.classList.add('is-flow-columns');
    detail.dataset.flowLayout = '1';
    detail.append(left, right);
    left.append(rolling, detector, flow);
    right.append(pressure, price);
  }

  function renderRow(row) {
    const id = row?.dataset?.matchId;
    if (!id) return;
    const match = latestMatches.get(id);
    const detail = row.querySelector('.match-detail');
    if (!match || !detail) return;
    organizeDetail(detail, match);
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
      if (/\/feed(?:\?|$)/.test(url)) {
        response.clone().json().then(rememberFeed).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  const observer = new MutationObserver(() => renderAll());
  const start = () => {
    const list = document.querySelector('.match-list');
    if (list) observer.observe(list, {childList:true, subtree:true});
    renderAll();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
