(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-stats-v3.json';
  const $ = s => document.querySelector(s);
  const pct = n => Number.isFinite(Number(n)) ? `${Number(n).toFixed(1)}%` : '—';
  const odds = n => Number.isFinite(Number(n)) ? Number(n).toFixed(2) : '—';
  const money = n => {
    const x = Number(n);
    if (!Number.isFinite(x)) return '—';
    return `${x > 0 ? '+' : ''}${Math.round(x)}`;
  };
  const cls = result => result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'pending';

  function resultOrder(a, b) {
    const aa = `${a.date || ''} ${a.kickoff || ''} ${a.settled_at || ''}`;
    const bb = `${b.date || ''} ${b.kickoff || ''} ${b.settled_at || ''}`;
    return bb.localeCompare(aa);
  }

  function render(data) {
    if (!data || data.record_version !== 'KING_STATS_V3') return;
    const records = Array.isArray(data.records) ? data.records : [];
    const settled = records.filter(x => ['WIN', 'LOSS', 'PUSH'].includes(String(x.result || '').toUpperCase()));
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

    const historyCount = $('#historyCount');
    if (historyCount) historyCount.textContent = `${settled.length} settled`;
    const historyTab = $('.king-tabs button[data-tab="history"]');
    if (historyTab) historyTab.textContent = `HISTORY · ${settled.length}`;

    const historyRows = $('#historyRows');
    if (historyRows) {
      historyRows.innerHTML = settled.slice().sort(resultOrder).map(x => {
        const result = String(x.result || '').toUpperCase();
        const pl = Number(x.profit || 0);
        return `<tr><td>${x.date || '—'}</td><td>${x.pick || '—'}</td><td>${odds(x.odds)}</td><td>${x.ft || '—'}</td><td><span class="king-result ${cls(result)}">${result}</span></td><td class="king-pl ${pl >= 0 ? 'positive' : 'negative'}">${money(pl)}</td></tr>`;
      }).join('');
    }

    const byDay = new Map();
    settled.forEach(x => {
      const date = x.date || '—';
      const d = byDay.get(date) || {p: 0, w: 0, l: 0, push: 0, net: 0};
      d.p += 1;
      d.w += x.result === 'WIN' ? 1 : 0;
      d.l += x.result === 'LOSS' ? 1 : 0;
      d.push += x.result === 'PUSH' ? 1 : 0;
      d.net += Number(x.profit || 0);
      byDay.set(date, d);
    });
    const dailyRows = $('#dailyRows');
    if (dailyRows) {
      dailyRows.innerHTML = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([date, d]) => {
        const decided = d.w + d.l;
        const rate = decided ? d.w / decided * 100 : null;
        return `<tr><td>${date}</td><td>${d.p}</td><td class="king-result win">${d.w}</td><td class="king-result loss">${d.l}</td><td>${rate == null ? '—' : pct(rate)}</td><td class="king-pl ${d.net >= 0 ? 'positive' : 'negative'}">${money(d.net)}</td></tr>`;
      }).join('');
    }

    const hero = $('.king-hero p');
    if (hero) hero.textContent = 'Pre-match selection · KING Statistics V3 since 04/09/2026';
  }

  async function load() {
    try {
      const r = await fetch(`${FEED}?t=${Date.now()}`, {cache: 'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      render(await r.json());
    } catch (e) {
      console.warn('KING Statistics V3 unavailable', e);
    }
  }

  window.NOMAD_KING_STATS_V3_ACTIVE = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, {once: true});
  else load();
  setTimeout(load, 2500);
  setInterval(load, 60000);
})();
