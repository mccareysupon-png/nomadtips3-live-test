(() => {
  'use strict';

  const latestMatches = new Map();
  const nativeFetch = window.fetch.bind(window);
  const finite = value => Number.isFinite(Number(value));
  const number = value => finite(value) ? Number(value) : null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const matchKey = match => String(match?.id ?? `${match?.home ?? ''}|${match?.away ?? ''}|${match?.league ?? ''}`);

  function pairMetric(match, key) {
    const stats = match?.stats || {};
    const raw = stats[key];
    if (Array.isArray(raw)) return {home:number(raw[0]), away:number(raw[1])};
    if (raw && typeof raw === 'object') return {home:number(raw.home), away:number(raw.away)};
    return {home:null, away:null};
  }

  function pressureMetric(match) {
    const rolling = match?.rolling || {};
    const home = number(rolling?.recent?.homePressure ?? rolling?.homePressure ?? match?.homePressure);
    const away = number(rolling?.recent?.awayPressure ?? rolling?.awayPressure ?? match?.awayPressure);
    if (home != null || away != null) return {home, away};
    const share = number(match?.sidePressureShare ?? rolling?.homePressureShare);
    if (share != null) return {home:share, away:Math.max(0,100-share)};
    return {home:null, away:null};
  }

  function metricWidth(value, max) {
    const v = number(value);
    if (v == null || !finite(max) || max <= 0) return 0;
    return Math.max(0, Math.min(100, v / max * 100));
  }

  function metricRow(label, metric, percent=false) {
    const home = number(metric?.home), away = number(metric?.away);
    const max = percent ? 100 : Math.max(1, home || 0, away || 0);
    const hw = metricWidth(home,max), aw = metricWidth(away,max);
    const fmt = value => value == null ? '—' : `${value}${percent?'%':''}`;
    return `<div class="graph-first-stat-row">
      <div class="graph-first-side home"><strong class="graph-first-value">${esc(fmt(home))}</strong><span class="graph-first-track"><i style="width:${hw.toFixed(1)}%"></i></span></div>
      <span class="graph-first-label">${esc(label)}</span>
      <div class="graph-first-side away"><span class="graph-first-track"><i style="width:${aw.toFixed(1)}%"></i></span><strong class="graph-first-value">${esc(fmt(away))}</strong></div>
    </div>`;
  }

  function statsCard(match) {
    const pressure = pressureMetric(match);
    const sot = pairMetric(match,'shotsOn');
    const shots = pairMetric(match,'shots');
    const danger = pairMetric(match,'dangerousAttack');
    const corners = pairMetric(match,'corners');
    return `<section class="graph-first-stats" data-graph-first-stats="1">
      <header class="graph-first-stats-head"><b class="home">HOME</b><span>LIVE KEY STATS</span><b class="away">AWAY</b></header>
      ${metricRow('PRESSURE',pressure,true)}
      ${metricRow('SHOTS ON TARGET',sot)}
      ${metricRow('SHOTS',shots)}
      ${metricRow('DANGEROUS ATTACKS',danger)}
      ${metricRow('CORNERS',corners)}
    </section>`;
  }

  function title(card) {
    return (card?.querySelector('h3')?.textContent || '').trim().toUpperCase();
  }

  function findGraph(detail) {
    return detail.querySelector('.momentum-panel') ||
      detail.querySelector('[data-panel="momentum"]') ||
      detail.querySelector('.momentum-chart')?.closest('section,div.panel,div.detail-card');
  }

  function findEvents(detail) {
    return detail.querySelector('.signal-match-events,.event-timeline,[data-event-timeline]') || null;
  }

  function organize(detail, match) {
    if (!detail || !match || detail.dataset.graphFirst === '1') return;

    const cards = [...detail.querySelectorAll(':scope > .detail-card, :scope > .detail-left-stack > .detail-card, :scope > .detail-right-stack > .detail-card')];
    const rolling = cards.find(card => /ROLLING DELTA/.test(title(card)));
    const pressure = cards.find(card => title(card) === 'PRESSURE TREND');
    const detector = cards.find(card => title(card) === 'DETECTOR CHECK');
    const price = cards.find(card => title(card) === 'PRICE CHECK');
    if (rolling) rolling.classList.add('detail-rolling-card');
    if (pressure) pressure.classList.add('detail-pressure-card');
    if (detector) detector.classList.add('detail-detector-card');
    if (price) price.classList.add('detail-price-card');

    const stage = document.createElement('section');
    stage.className = 'graph-first-stage';
    stage.dataset.graphFirstStage = '1';
    const graph = findGraph(detail);
    if (graph && !stage.contains(graph)) stage.appendChild(graph);
    else stage.innerHTML = '<div class="note">Momentum graph is waiting for live data.</div>';

    const holder = document.createElement('div');
    holder.innerHTML = statsCard(match);
    const stats = holder.firstElementChild;

    const eventSource = findEvents(detail);
    let events = null;
    if (eventSource) {
      events = document.createElement('section');
      events.className = 'graph-first-events';
      events.appendChild(eventSource);
    }

    const footer = document.createElement('section');
    footer.className = 'graph-first-footer';
    if (price) footer.appendChild(price);

    detail.classList.add('graph-first-ready');
    detail.dataset.graphFirst = '1';
    detail.prepend(stage, stats);
    if (events) detail.appendChild(events);
    if (footer.childElementCount) detail.appendChild(footer);
  }

  function renderAll() {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(row => {
      const match = latestMatches.get(String(row.dataset.matchId));
      const detail = row.querySelector('.match-detail');
      if (match && detail) organize(detail, match);
    });
  }

  function rememberFeed(data) {
    if (!data || !Array.isArray(data.matches)) return;
    latestMatches.clear();
    data.matches.forEach(match => latestMatches.set(matchKey(match), match));
    requestAnimationFrame(renderAll);
    setTimeout(renderAll,0);
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

  const start = () => {
    const list = document.querySelector('.match-list');
    if (list) new MutationObserver(renderAll).observe(list,{childList:true,subtree:true});
    renderAll();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
