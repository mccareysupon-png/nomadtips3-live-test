import {
  buildMarketSummary,
  buildSummary,
  marketResultText,
  resultText,
  scoreText
} from '../shared.js?v=202608071505';
import {
  adaptiveChartWidth,
  dateLabel,
  loadCumulativeRecords,
  recordTime,
  selectChartRange
} from './cumulative.js?v=202608061015';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const STANDARD_SETTLED = new Set(['correct', 'incorrect', 'void']);
const ASIAN_SETTLED = new Set(['win', 'half-win', 'push', 'half-loss', 'loss', 'correct', 'incorrect', 'void']);
const POSITIVE = new Set(['correct', 'win', 'half-win']);
const NEGATIVE = new Set(['incorrect', 'loss', 'half-loss']);
const NEUTRAL = new Set(['push', 'void']);
const MARKET_KEYS = ['oneXTwo', 'btts', 'overUnder', 'doubleChance', 'asianHandicap'];
const MARKET_LABELS = {
  overview: 'Overview',
  oneXTwo: '1X2',
  btts: 'BTTS',
  overUnder: 'O/U 2.5',
  doubleChance: 'Double Chance',
  asianHandicap: 'Asian Handicap'
};

let activeMarket = 'overview';
let chartRange = '20';
let lastSignature = '';

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>'\"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function finiteOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatOdds(value) {
  const number = finiteOdds(value);
  return number === null ? 'N/A' : number.toFixed(2);
}

function predictionFor(record, key) {
  if (key === 'oneXTwo') {
    return {
      pick: record.pickLabel || record.pick || '—',
      odds: finiteOdds(record.odds),
      confidence: Number(record.confidence || 0),
      outcome: String(record.outcome || 'pending').toLowerCase()
    };
  }
  const market = record.markets?.[key] || {};
  return {
    pick: market.pick || '—',
    odds: finiteOdds(market.odds),
    confidence: Number(market.confidence || 0),
    outcome: String(market.outcome || market.settlement || 'pending').toLowerCase()
  };
}

function predictionAvailable(prediction) {
  const pick = String(prediction?.pick || '').trim().toUpperCase();
  return Boolean(pick && !['—', 'N/A', 'NA', 'UNAVAILABLE'].includes(pick));
}

function isSettled(prediction, key) {
  return (key === 'asianHandicap' ? ASIAN_SETTLED : STANDARD_SETTLED).has(prediction.outcome);
}

function effectiveMarket() {
  return activeMarket === 'overview' ? 'oneXTwo' : activeMarket;
}

function marketStatistics(records, key) {
  const markets = buildMarketSummary(records);
  if (key === 'oneXTwo') {
    const summary = buildSummary(records);
    return {
      total: summary.total,
      settled: summary.settled + summary.voids,
      positive: summary.correct,
      negative: summary.incorrect,
      neutral: summary.voids,
      pending: summary.pending,
      accuracy: summary.accuracy,
      positiveLabel: 'Correct',
      negativeLabel: 'Incorrect'
    };
  }
  if (key === 'overUnder') {
    const values = records.map(record => predictionFor(record, key)).filter(predictionAvailable);
    const correct = values.filter(item => item.outcome === 'correct').length;
    const incorrect = values.filter(item => item.outcome === 'incorrect').length;
    const voids = values.filter(item => item.outcome === 'void').length;
    const settled = correct + incorrect + voids;
    return {
      total: values.length,
      settled,
      positive: correct,
      negative: incorrect,
      neutral: voids,
      pending: Math.max(0, values.length - settled),
      accuracy: correct + incorrect ? Number(((correct / (correct + incorrect)) * 100).toFixed(2)) : 0,
      positiveLabel: 'Correct',
      negativeLabel: 'Incorrect'
    };
  }
  if (key === 'asianHandicap') {
    const stats = markets.asianHandicap;
    return {
      total: stats.total,
      settled: stats.total - stats.pending,
      positive: stats.win + stats.halfWin,
      negative: stats.loss + stats.halfLoss,
      neutral: stats.push + (stats.void || 0),
      pending: stats.pending,
      accuracy: stats.weightedRate,
      positiveLabel: 'Win / Half Win',
      negativeLabel: 'Loss / Half Loss',
      detail: `W ${stats.win} · HW ${stats.halfWin} · P ${stats.push} · HL ${stats.halfLoss} · L ${stats.loss}`
    };
  }
  const stats = markets[key];
  return {
    total: stats.total,
    settled: stats.settled + (stats.voids || 0),
    positive: stats.correct,
    negative: stats.incorrect,
    neutral: stats.voids || 0,
    pending: stats.pending,
    accuracy: stats.accuracy,
    positiveLabel: 'Correct',
    negativeLabel: 'Incorrect'
  };
}

function averageOdds(records, key) {
  const settled = records
    .map(record => predictionFor(record, key))
    .filter(prediction => predictionAvailable(prediction) && isSettled(prediction, key));
  const values = settled
    .map(prediction => prediction.odds)
    .filter(value => value !== null);
  return {
    available: values.length > 0,
    count: values.length,
    missing: settled.length - values.length,
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    text: values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2) : '—'
  };
}

function outcomeReturnFor(prediction, key) {
  if (!prediction || !predictionAvailable(prediction) || !isSettled(prediction, key) || prediction.odds === null) return null;
  const { outcome, odds } = prediction;
  if (outcome === 'correct' || outcome === 'win') return odds;
  if (outcome === 'half-win') return 1 + ((odds - 1) * 0.5);
  if (outcome === 'incorrect' || outcome === 'loss') return 0;
  if (outcome === 'half-loss') return 0.5;
  if (outcome === 'push' || outcome === 'void') return 1;
  return null;
}

function profitPercent(records, key) {
  let calculated = 0;
  let missing = 0;
  let returned = 0;
  records.forEach(record => {
    const prediction = predictionFor(record, key);
    if (!predictionAvailable(prediction) || !isSettled(prediction, key)) return;
    if (prediction.odds === null) {
      missing += 1;
      return;
    }
    const result = outcomeReturnFor(prediction, key);
    if (result === null) return;
    calculated += 1;
    returned += result;
  });
  return {
    available: calculated > 0,
    value: calculated ? ((returned - calculated) / calculated) * 100 : 0,
    calculated,
    missing,
    returned
  };
}

function overallFinancials(records) {
  let calculated = 0;
  let missing = 0;
  let returned = 0;
  let settled = 0;
  let pending = 0;
  const oddsValues = [];

  records.forEach(record => {
    MARKET_KEYS.forEach(key => {
      const prediction = predictionFor(record, key);
      if (!predictionAvailable(prediction)) return;
      if (!isSettled(prediction, key)) {
        pending += 1;
        return;
      }
      settled += 1;
      if (prediction.odds === null) {
        missing += 1;
        return;
      }
      const result = outcomeReturnFor(prediction, key);
      if (result === null) return;
      calculated += 1;
      returned += result;
      oddsValues.push(prediction.odds);
    });
  });

  const average = oddsValues.length
    ? oddsValues.reduce((sum, value) => sum + value, 0) / oddsValues.length
    : null;
  return {
    settled,
    pending,
    calculated,
    missing,
    returned,
    profit: calculated ? ((returned - calculated) / calculated) * 100 : 0,
    average,
    averageCount: oddsValues.length
  };
}

function formatPercent(value) {
  const number = Number(value || 0);
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function renderSync(records) {
  const summary = buildSummary(records);
  $('#syncTitle').textContent = `${records.length} connected match records`;
  $('#syncDetail').textContent = `${summary.settled} settled and ${summary.pending} pending 1X2 records. Final results refresh automatically when confirmed.`;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  $('#syncTime').textContent = `Updated ${formatter.format(new Date()).replace(',', '')}`;
}

function renderSummary(records) {
  if (activeMarket === 'overview') {
    const overall = overallFinancials(records);
    const cards = [
      { label: 'Overall Profit', value: overall.calculated ? formatPercent(overall.profit) : 'PENDING', note: `${overall.calculated} settled predictions with real odds`, className: overall.calculated ? (overall.profit >= 0 ? 'positive' : 'negative') : '' },
      { label: 'Overall Average Odds', value: overall.average === null ? '—' : overall.average.toFixed(2), note: `${overall.averageCount} settled predictions included` },
      { label: 'Settled Predictions', value: overall.settled, note: 'Across 1X2, BTTS, O/U 2.5, Double Chance and Asian Handicap' },
      { label: 'Odds Included', value: overall.calculated, note: 'Only predictions with a real locked odds value' },
      { label: 'Missing Odds Skipped', value: overall.missing, note: 'Excluded from profit and average-odds calculations' },
      { label: 'Pending Predictions', value: overall.pending, note: 'Not included until the outcome is confirmed' }
    ];
    $('#statsSummary').innerHTML = cards.map(card => `
      <div class="metric ${card.className || ''}">
        <small>${escapeHtml(card.label)}</small>
        <b>${escapeHtml(card.value)}</b>
        <span>${escapeHtml(card.note)}</span>
      </div>`).join('');
    return;
  }

  const stats = marketStatistics(records, activeMarket);
  const average = averageOdds(records, activeMarket);
  const profit = profitPercent(records, activeMarket);
  const label = MARKET_LABELS[activeMarket];
  const cards = [
    { label: `${label} Accuracy`, value: `${stats.accuracy.toFixed(2)}%`, note: activeMarket === 'asianHandicap' ? 'Weighted decision rate' : `Based on confirmed decisions`, className: 'positive' },
    { label: 'Total Records', value: stats.total, note: `Connected ${label} predictions` },
    { label: 'Settled', value: stats.settled, note: 'Officially resolved outcomes' },
    { label: 'Profit', value: profit.available ? formatPercent(profit.value) : 'PENDING', note: profit.available ? `${profit.calculated} settled predictions with odds${profit.missing ? ` · ${profit.missing} missing skipped` : ''}` : 'Waiting for a settled prediction with real odds', className: profit.available ? (profit.value >= 0 ? 'positive' : 'negative') : '' },
    { label: 'Average Odds', value: average.text, note: average.available ? `${average.count} settled predictions included${average.missing ? ` · ${average.missing} missing skipped` : ''}` : 'No settled prediction with real odds yet' },
    { label: stats.positiveLabel, value: stats.positive, note: `${stats.negative} ${stats.negativeLabel}${stats.neutral ? ` · ${stats.neutral} neutral` : ''}`, className: 'positive' }
  ];
  $('#statsSummary').innerHTML = cards.map(card => `
    <div class="metric ${card.className || ''}">
      <small>${escapeHtml(card.label)}</small>
      <b>${escapeHtml(card.value)}</b>
      <span>${escapeHtml(card.note)}</span>
    </div>`).join('');
}

function renderMarketCards(records) {
  $('#marketGrid').innerHTML = MARKET_KEYS.map(key => {
    const stats = marketStatistics(records, key);
    const average = averageOdds(records, key);
    const profit = profitPercent(records, key);
    const details = stats.detail || `${stats.positive} ${stats.positiveLabel} · ${stats.negative} ${stats.negativeLabel}`;
    const financial = profit.available
      ? `${formatPercent(profit.value)} · Avg odds ${average.text}${profit.missing ? ` · ${profit.missing} odds missing skipped` : ''}`
      : average.available
        ? `Average odds ${average.text}`
        : 'No settled prediction with real odds';
    return `
      <article class="market-performance-card ${key === activeMarket ? 'active' : ''}" data-market-card="${key}" tabindex="0" role="button" aria-label="Open ${escapeHtml(MARKET_LABELS[key])} statistics">
        <small>${escapeHtml(MARKET_LABELS[key])}</small>
        <b>${stats.accuracy.toFixed(2)}%</b>
        <div class="market-card-row"><span>${escapeHtml(details)}</span><span>Pending ${stats.pending}</span></div>
        <div class="market-rate-bar"><i style="width:${Math.max(2, Math.min(100, stats.accuracy))}%"></i></div>
        <span class="market-card-note">${escapeHtml(financial)}</span>
      </article>`;
  }).join('');
  $('#marketPanelMeta').textContent = `${records.length} matches · five independent markets`;
}

function chartOutcome(prediction, key) {
  if (!isSettled(prediction, key)) return null;
  if (POSITIVE.has(prediction.outcome)) return 'positive';
  if (NEGATIVE.has(prediction.outcome)) return 'negative';
  if (NEUTRAL.has(prediction.outcome)) return 'neutral';
  return null;
}

function renderChart(records) {
  const key = effectiveMarket();
  const host = $('#performanceChart');
  const settledRecords = records
    .map(record => ({ record, prediction: predictionFor(record, key) }))
    .filter(item => predictionAvailable(item.prediction) && isSettled(item.prediction, key))
    .sort((a, b) => recordTime(a.record) - recordTime(b.record));
  const signature = `${key}|${chartRange}|${settledRecords.map(item => `${item.record.fixtureId}:${item.prediction.outcome}:${item.record.homeScore}:${item.record.awayScore}`).join('|')}`;
  if (signature === lastSignature) return;
  lastSignature = signature;

  const { before, visible } = selectChartRange(settledRecords, chartRange);
  let positive = before.filter(item => chartOutcome(item.prediction, key) === 'positive').length;
  let negative = before.filter(item => chartOutcome(item.prediction, key) === 'negative').length;
  const points = [{ positive, negative }];
  visible.forEach(item => {
    const outcome = chartOutcome(item.prediction, key);
    if (outcome === 'positive') positive += 1;
    if (outcome === 'negative') negative += 1;
    points.push({ positive, negative, item });
  });

  $('#chartTitle').textContent = `${MARKET_LABELS[key]} Result Performance`;
  $('#chartSubtitle').textContent = activeMarket === 'overview'
    ? 'Overview uses the 1X2 cumulative result chart; financial cards above combine all five markets'
    : key === 'asianHandicap'
      ? 'Cumulative positive and negative decisions; pushes remain neutral'
      : 'Cumulative confirmed outcomes in chronological order';
  $('#positiveLegend').textContent = key === 'asianHandicap' ? 'Win / Half Win' : 'Correct';
  $('#negativeLegend').textContent = key === 'asianHandicap' ? 'Loss / Half Loss' : 'Incorrect';

  if (!settledRecords.length) {
    host.style.width = '100%';
    host.innerHTML = `<div class="chart-empty">The ${escapeHtml(MARKET_LABELS[key])} chart will begin after the first confirmed result.</div>`;
    $('#chartMeta').textContent = '0 settled results';
    return;
  }

  const width = adaptiveChartWidth(host, visible.length, chartRange);
  const height = 310;
  const margin = { top: 18, right: 24, bottom: 42, left: 40 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(5, positive, negative);
  const xFor = index => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yFor = value => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const pathFor = series => points.map((point, index) => `${index ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point[series]).toFixed(2)}`).join(' ');
  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = Math.round((maxValue / 5) * index);
    const y = yFor(value);
    return `<line class="chart-grid-line" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="chart-label" x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${value}</text>`;
  }).join('');
  const labelStep = Math.max(1, Math.ceil(visible.length / 6));
  const labels = visible.map((item, index) => {
    if (index !== visible.length - 1 && index % labelStep !== 0) return '';
    return `<text class="chart-date" x="${xFor(index + 1)}" y="${height - 17}" text-anchor="middle">${escapeHtml(dateLabel(item.record))}</text>`;
  }).join('');
  const dots = points.slice(1).map((point, index) => {
    const outcome = chartOutcome(visible[index].prediction, key);
    if (outcome === 'neutral') return '';
    const series = outcome === 'positive' ? 'positive' : 'negative';
    return `<circle class="chart-${series}-point" cx="${xFor(index + 1)}" cy="${yFor(point[series])}" r="3"></circle>`;
  }).join('');

  host.style.width = `${width}px`;
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cumulative ${escapeHtml(MARKET_LABELS[key])} result chart">
    ${grid}
    <line class="chart-axis-line" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
    <path class="chart-positive" d="${pathFor('positive')}"></path>
    <path class="chart-negative" d="${pathFor('negative')}"></path>
    ${dots}${labels}
  </svg>`;
  const rangeText = visible.length === settledRecords.length ? `All ${settledRecords.length}` : `Latest ${visible.length} of ${settledRecords.length}`;
  $('#chartMeta').textContent = `${rangeText} settled · Positive ${positive} · Negative ${negative}`;
  requestAnimationFrame(() => {
    const viewport = host.closest('.chart-viewport');
    if (viewport) viewport.scrollLeft = viewport.scrollWidth;
  });
}

function badgeFor(outcome) {
  if (outcome === 'correct' || outcome === 'win') return { text: 'W', className: 'positive' };
  if (outcome === 'half-win') return { text: 'HW', className: 'positive' };
  if (outcome === 'push' || outcome === 'void') return { text: 'P', className: 'neutral' };
  if (outcome === 'half-loss') return { text: 'HL', className: 'negative' };
  return { text: 'L', className: 'negative' };
}

function renderRecent(records) {
  const key = effectiveMarket();
  const settled = records
    .map(record => ({ record, prediction: predictionFor(record, key) }))
    .filter(item => predictionAvailable(item.prediction) && isSettled(item.prediction, key))
    .sort((a, b) => recordTime(b.record) - recordTime(a.record));
  const recent = settled.slice(0, 5);
  $('#recentTitle').textContent = `Recent ${MARKET_LABELS[key]} Form`;
  if (!recent.length) {
    $('#recentForm').innerHTML = '<div class="recent-empty">No confirmed results for this market yet.</div>';
    $('#streakText').textContent = 'The streak will begin after the first confirmed outcome.';
    return;
  }
  $('#recentForm').innerHTML = recent.map(({ record, prediction }) => {
    const badge = badgeFor(prediction.outcome);
    return `<div class="recent-item">
      <span class="recent-badge ${badge.className}">${badge.text}</span>
      <div><b>${escapeHtml(record.home)} vs ${escapeHtml(record.away)}</b><small>${escapeHtml(prediction.pick)} · Odds ${formatOdds(prediction.odds)}</small></div>
      <strong>${escapeHtml(scoreText(record))}</strong>
    </div>`;
  }).join('');

  const firstClass = chartOutcome(settled[0].prediction, key);
  let streak = 0;
  for (const item of settled) {
    if (chartOutcome(item.prediction, key) !== firstClass) break;
    streak += 1;
  }
  const streakLabel = firstClass === 'positive' ? 'positive' : firstClass === 'negative' ? 'negative' : 'neutral';
  $('#streakText').innerHTML = `Current ${escapeHtml(MARKET_LABELS[key])} streak: <b>${streak} ${streakLabel} result${streak === 1 ? '' : 's'}</b>. Recent form follows the newest official confirmations.`;
}

function resultClass(outcome) {
  if (POSITIVE.has(outcome)) return 'positive';
  if (NEGATIVE.has(outcome)) return 'negative';
  return 'neutral';
}

function marketCell(record, key) {
  const market = predictionFor(record, key);
  if (!predictionAvailable(market)) return '<b>N/A</b><small>No historical prediction</small>';
  return `<b>${escapeHtml(market.pick)}</b><small>Odds ${formatOdds(market.odds)} · ${market.confidence}%</small><span class="market-result ${resultClass(market.outcome)}">${escapeHtml(key === 'oneXTwo' ? resultText(record) : marketResultText(record.markets?.[key]))}</span>`;
}

function renderHistory(records) {
  const ordered = [...records].sort((a, b) => recordTime(b) - recordTime(a));
  $('#historyRows').innerHTML = ordered.map(record => `
    <tr>
      <td><b>${escapeHtml(dateLabel(record))}</b><small>${escapeHtml(record.league)}</small></td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}</td>
      <td data-market-cell="oneXTwo">${marketCell(record, 'oneXTwo')}</td>
      <td data-market-cell="btts">${marketCell(record, 'btts')}</td>
      <td data-market-cell="overUnder">${marketCell(record, 'overUnder')}</td>
      <td data-market-cell="doubleChance">${marketCell(record, 'doubleChance')}</td>
      <td data-market-cell="asianHandicap">${marketCell(record, 'asianHandicap')}</td>
      <td><b>${escapeHtml(scoreText(record))}</b></td>
      <td><span class="main-result ${escapeHtml(String(record.outcome || 'pending'))}">${escapeHtml(resultText(record))}</span></td>
    </tr>`).join('');
  $('#historyMeta').textContent = `${ordered.length} connected records · newest first`;
  updateFocusedColumns();
}

function updateFocusedColumns() {
  $$('[data-market-column],[data-market-cell]').forEach(element => {
    const focused = activeMarket !== 'overview' && (element.dataset.marketColumn === activeMarket || element.dataset.marketCell === activeMarket);
    element.dataset.focused = String(focused);
  });
}

function render() {
  const records = loadCumulativeRecords();
  renderSync(records);
  renderSummary(records);
  renderMarketCards(records);
  renderChart(records);
  renderRecent(records);
  renderHistory(records);
  document.body.dataset.market = activeMarket;
}

function selectMarket(key, clickedTab = null) {
  if (!MARKET_LABELS[key]) return;
  activeMarket = key;
  lastSignature = '';
  $$('.stats-tabs button').forEach(button => button.classList.toggle('active', button === clickedTab || (!clickedTab && button.dataset.marketFocus === key)));
  render();
}

document.addEventListener('click', event => {
  const tab = event.target.closest('[data-market-focus]');
  if (tab) {
    selectMarket(tab.dataset.marketFocus, tab);
    return;
  }
  const card = event.target.closest('[data-market-card]');
  if (card) {
    selectMarket(card.dataset.marketCard);
    return;
  }
  const rangeButton = event.target.closest('[data-chart-range]');
  if (rangeButton) {
    chartRange = rangeButton.dataset.chartRange || '20';
    lastSignature = '';
    $$('[data-chart-range]').forEach(button => button.classList.toggle('active', button === rangeButton));
    renderChart(loadCumulativeRecords());
  }
});

document.addEventListener('keydown', event => {
  const card = event.target.closest('[data-market-card]');
  if (card && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    selectMarket(card.dataset.marketCard);
  }
});

render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.addEventListener('nomad-official-finals-updated', render);
window.addEventListener('pageshow', render);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});
window.setInterval(render, 3000);