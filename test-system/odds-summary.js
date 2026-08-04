(() => {
  'use strict';

  const STORAGE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const LOCKED_ODDS = Object.freeze({
    '1551656': { odds: 1.95, bookmaker: 'Bet365' },
    '1610530': { odds: 2.15, bookmaker: 'Bet365' },
    '1610531': { odds: 2.25, bookmaker: 'Bet365' },
    '1563636': { odds: 2.08, bookmaker: 'Pinnacle' },
    '1557945': { odds: 1.95, bookmaker: 'Bet365' },
    '1607166': { odds: 1.75, bookmaker: 'Bet365' },
    '1576856': { odds: 2.30, bookmaker: 'Bet365' },
    '1576857': { odds: 1.91, bookmaker: 'Bet365' },
    '1549709': { odds: 2.10, bookmaker: 'Bet365' },
    '1545399': { odds: 2.45, bookmaker: 'Bet365' },
    '1530109': { odds: 2.05, bookmaker: 'Bet365' }
  });

  function currentOdds(record) {
    return Number(record?.odds ?? record?.lockedOdds ?? record?.locked_odds ?? 0);
  }

  function enrichStoredPicks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const state = JSON.parse(raw);
      if (!Array.isArray(state?.publishedPicks)) return null;

      let changed = false;
      state.publishedPicks = state.publishedPicks.map(record => {
        const fallback = LOCKED_ODDS[String(record.fixtureId ?? record.id ?? '')];
        if (!fallback) return record;

        const oddsMissing = !(currentOdds(record) > 0);
        const bookmakerMissing = !String(record.bookmaker ?? '').trim();
        if (!oddsMissing && !bookmakerMissing) return record;

        changed = true;
        return {
          ...record,
          odds: oddsMissing ? fallback.odds : currentOdds(record),
          bookmaker: bookmakerMissing ? fallback.bookmaker : record.bookmaker
        };
      });

      if (changed) {
        state.updatedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }

      return state.publishedPicks;
    } catch {
      return null;
    }
  }

  function oddsValues() {
    const records = enrichStoredPicks();
    const storedValues = Array.isArray(records)
      ? records.map(currentOdds).filter(value => Number.isFinite(value) && value > 0)
      : [];

    return storedValues.length
      ? storedValues
      : Object.values(LOCKED_ODDS).map(item => item.odds);
  }

  function renderAverageOdds() {
    const values = oddsValues();
    const average = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;

    document.querySelectorAll('.summary').forEach(summary => {
      summary.classList.add('summary-with-average-odds');

      let metric = summary.querySelector('[data-average-odds]');
      if (!metric) {
        metric = document.createElement('div');
        metric.className = 'metric average-odds-metric';
        metric.setAttribute('data-average-odds', '');
        metric.innerHTML = '<small>Average Odds</small><b>—</b>';
        summary.appendChild(metric);
      }

      metric.querySelector('b').textContent = average > 0 ? average.toFixed(2) : '—';
    });
  }

  function installStyles() {
    if (document.getElementById('nomad-odds-summary-style')) return;

    const style = document.createElement('style');
    style.id = 'nomad-odds-summary-style';
    style.textContent = `
      .summary.summary-with-average-odds{grid-template-columns:repeat(7,minmax(0,1fr))}
      .average-odds-metric{border-color:rgba(242,201,76,.55);background:linear-gradient(180deg,rgba(242,201,76,.12),#222)}
      .average-odds-metric b{color:var(--yellow)}
      .pick-data>div:nth-child(2){background:linear-gradient(180deg,rgba(242,201,76,.14),#252525);box-shadow:inset 0 2px 0 rgba(242,201,76,.34)}
      .pick-data>div:nth-child(2)>small:first-child{color:#fff4bd!important;font-weight:900;letter-spacing:.09em}
      .pick-data>div:nth-child(2)>b{color:var(--yellow)!important;font-size:15px!important;line-height:1!important}
      .pick-data>div:nth-child(2)>small:last-child{color:#d8d1ab!important}
      @media(max-width:720px){.summary.summary-with-average-odds{grid-template-columns:repeat(4,minmax(0,1fr))}}
      @media(max-width:430px){.summary.summary-with-average-odds{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  installStyles();
  renderAverageOdds();
  window.addEventListener('storage', renderAverageOdds);
  window.addEventListener('nomad-results-updated', renderAverageOdds);
  window.setInterval(renderAverageOdds, 3000);
})();
