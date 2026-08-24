(() => {
  'use strict';

  const WINDOW_MINUTES = 10;
  const STORE_KEY = 'nomad341EventTimelineV1';
  const STORE_TTL_MS = 8 * 60 * 60 * 1000;
  const latestMatches = new Map();
  const nativeFetch = window.fetch.bind(window);

  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const number = value => finite(value) ? Number(value) : null;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[char]));
  const normalize = value => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const matchKey = match => String(match?.id ?? `${normalize(match?.home)}|${normalize(match?.away)}|${normalize(match?.league)}`);

  function safePair(pair) {
    const home = number(pair?.home);
    const away = number(pair?.away);
    return home != null && away != null ? {home, away} : null;
  }

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (_) {}
  }

  function rememberGoals(matches = []) {
    const store = loadStore();
    const now = Date.now();

    for (const [key, entry] of Object.entries(store)) {
      if (!entry?.updatedAt || now - Number(entry.updatedAt) > STORE_TTL_MS) delete store[key];
    }

    for (const match of matches) {
      const key = matchKey(match);
      const minute = number(match?.minute);
      const score = safePair(match?.score);
      if (!key || minute == null || !score) continue;

      const entry = store[key] && typeof store[key] === 'object' ? store[key] : {goals: []};
      const previous = safePair(entry.lastScore);
      const goals = Array.isArray(entry.goals) ? entry.goals : [];

      if (previous) {
        const homeDelta = score.home - previous.home;
        const awayDelta = score.away - previous.away;
        if (homeDelta > 0 && homeDelta <= 5) goals.push({side:'home', minute, count:homeDelta, observedAt:now});
        if (awayDelta > 0 && awayDelta <= 5) goals.push({side:'away', minute, count:awayDelta, observedAt:now});
      }

      entry.lastScore = score;
      entry.lastMinute = minute;
      entry.updatedAt = now;
      entry.goals = goals
        .filter(goal => goal && finite(goal.minute) && now - Number(goal.observedAt || now) <= STORE_TTL_MS)
        .slice(-24);
      store[key] = entry;
    }

    saveStore(store);
    return store;
  }

  function metricDelta(current, previous, metric, side) {
    const now = number(current?.stats?.[metric]?.[side]);
    const before = number(previous?.stats?.[metric]?.[side]);
    if (now == null || before == null) return 0;
    const delta = now - before;
    return delta > 0 ? Math.min(9, Math.round(delta)) : 0;
  }

  function snapshotEvents(match) {
    const currentMinute = number(match?.minute);
    if (currentMinute == null) return [];
    const snapshots = Array.isArray(match?.snapshots)
      ? match.snapshots.filter(item => finite(item?.minute)).slice().sort((a, b) => Number(a.minute) - Number(b.minute))
      : [];
    const events = [];

    for (let index = 1; index < snapshots.length; index++) {
      const previous = snapshots[index - 1];
      const current = snapshots[index];
      const minute = number(current?.minute);
      if (minute == null) continue;
      for (const side of ['home', 'away']) {
        const sot = metricDelta(current, previous, 'shotsOn', side);
        const corner = metricDelta(current, previous, 'corners', side);
        if (sot) events.push({type:'sot', side, minute, count:sot});
        if (corner) events.push({type:'corner', side, minute, count:corner});
      }
    }

    return events.filter(event => event.minute >= currentMinute - WINDOW_MINUTES && event.minute <= currentMinute);
  }

  function goalEvents(match, store) {
    const currentMinute = number(match?.minute);
    if (currentMinute == null) return [];
    const entry = store?.[matchKey(match)];
    const goals = Array.isArray(entry?.goals) ? entry.goals : [];
    return goals
      .filter(goal => finite(goal?.minute) && goal.minute >= currentMinute - WINDOW_MINUTES && goal.minute <= currentMinute)
      .map(goal => ({type:'goal', side:goal.side, minute:Number(goal.minute), count:Number(goal.count) || 1}));
  }

  function groupedEvents(match, store) {
    const groups = new Map();
    const events = [...snapshotEvents(match), ...goalEvents(match, store)];
    for (const event of events) {
      if (!['home', 'away'].includes(event.side)) continue;
      const key = `${event.side}|${event.minute}`;
      if (!groups.has(key)) groups.set(key, {side:event.side, minute:event.minute, goal:0, sot:0, corner:0});
      groups.get(key)[event.type] += Math.max(1, Number(event.count) || 1);
    }
    return [...groups.values()].sort((a, b) => a.minute - b.minute);
  }

  function goalIcon(count = 1) {
    const badge = count > 1 ? `<small>×${count}</small>` : '';
    return `<span class="event-icon event-goal" title="Goal">` +
      `<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 4.7 9.9 6 9.2 8.2H6.8L6.1 6 8 4.7ZM4.1 7.2 6.1 6M9.9 6l2 1.2M6.8 8.2 5.8 10.5M9.2 8.2l1 2.3"></path></svg>${badge}</span>`;
  }

  function sotIcon(count = 1) {
    const badge = count > 1 ? `<small>×${count}</small>` : '';
    return `<span class="event-icon event-sot" title="Shot on target"><span>◎</span>${badge}</span>`;
  }

  function cornerIcon(count = 1) {
    const badge = count > 1 ? `<small>×${count}</small>` : '';
    return `<span class="event-icon event-corner" title="Corner">` +
      `<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M3 13V3.2M3.2 3.5h6.3L8 6H3.2"></path></svg>${badge}</span>`;
  }

  function marker(group, startMinute, endMinute) {
    const span = Math.max(1, endMinute - startMinute);
    const position = clamp((group.minute - startMinute) / span * 100, 2.5, 97.5);
    const icons = `${group.goal ? goalIcon(group.goal) : ''}${group.sot ? sotIcon(group.sot) : ''}${group.corner ? cornerIcon(group.corner) : ''}`;
    return `<span class="event-point" style="--event-pos:${position.toFixed(1)}%" title="${esc(`${group.minute}′`)}">` +
      `<span class="event-icons">${icons}</span><span class="event-minute">${esc(`${group.minute}′`)}</span></span>`;
  }

  function timelineRow(side, groups, startMinute, endMinute) {
    const markers = groups.filter(group => group.side === side).map(group => marker(group, startMinute, endMinute)).join('');
    return `<div class="event-row ${side}"><span class="event-side">${side.toUpperCase()}</span><div class="event-track">${markers}</div></div>`;
  }

  function cardHtml(match, store) {
    const currentMinute = number(match?.minute);
    if (currentMinute == null) return '';
    const startMinute = Math.max(0, currentMinute - WINDOW_MINUTES);
    const groups = groupedEvents(match, store);
    const empty = groups.length ? '' : '<div class="event-empty">No key events in last 10 min</div>';
    return `<section class="detail-card event-timeline-card" data-event-timeline="1">` +
      `<h3>EVENTS · LAST ${WINDOW_MINUTES} MIN</h3>` +
      `<div class="event-legend"><span class="legend-goal">GOAL</span><span class="legend-sot">SOT</span><span class="legend-corner">CORNER</span></div>` +
      `<div class="event-rows">${timelineRow('home', groups, startMinute, currentMinute)}${timelineRow('away', groups, startMinute, currentMinute)}</div>` +
      `<div class="event-axis"><span>${startMinute}′</span><span>${currentMinute}′</span></div>${empty}</section>`;
  }

  function makeCard(match, store) {
    const holder = document.createElement('div');
    holder.innerHTML = cardHtml(match, store);
    return holder.firstElementChild;
  }

  function renderRow(row, store) {
    const id = row?.dataset?.matchId;
    if (!id) return;
    const match = latestMatches.get(id);
    const detail = row.querySelector('.match-detail');
    if (!match || !detail) return;

    const flow = detail.querySelector('.detail-flow-card, [data-match-flow="1"]');
    if (!flow) return;
    const next = makeCard(match, store);
    if (!next) return;
    const existing = detail.querySelector('[data-event-timeline="1"]');
    if (existing) existing.replaceWith(next);
    else flow.insertAdjacentElement('afterend', next);
  }

  function renderAll() {
    const store = loadStore();
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(row => renderRow(row, store));
  }

  function rememberFeed(data) {
    if (!data || !Array.isArray(data.matches)) return;
    const store = rememberGoals(data.matches);
    latestMatches.clear();
    data.matches.forEach(match => latestMatches.set(matchKey(match), match));
    requestAnimationFrame(() => {
      document.querySelectorAll('.match-wrap[data-match-id]').forEach(row => renderRow(row, store));
    });
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
