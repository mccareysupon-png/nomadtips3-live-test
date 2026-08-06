import {
  buildMarketSummary,
  buildSummary,
  marketResultText,
  resultText,
  scoreText
} from '../shared.js?v=202608051120';
import {
  adaptiveChartWidth,
  dateLabel,
  loadCumulativeRecords,
  recordTime,
  selectChartRange
} from './cumulative.js?v=202608051149';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : 'No Odds Data';
const settledOutcomes = new Set(['correct','incorrect']);
const standardMarketSettled = new Set(['correct','incorrect']);
const asianMarketSettled = new Set(['win','half-win','push','half-loss','loss','correct','incorrect']);
let chartRange = '20';
let lastChartSignature = '';

function averageOdds(records, oddsGetter, settledPredicate) {
  const settledRecords = records.filter(settledPredicate);
  const values = settledRecords
    .map(oddsGetter)
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0);
  const complete = settledRecords.length > 0 && values.length === settledRecords.length;
  return {
    count: values.length,
    settledCount: settledRecords.length,
    missing: Math.max(0, settledRecords.length - values.length),
    complete,
    value: complete ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    text: complete ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2) : '—'
  };
}

function marketAverage(records, key) {
  const settledSet = key === 'asianHandicap' ? asianMarketSettled : standardMarketSettled;
  return averageOdds(
    records,
    record => record.markets?.[key]?.odds,
    record => settledSet.has(String(record.markets?.[key]?.outcome || 'pending'))
  );
}

function renderAverageOddsStrip(average) {
  const summary = document.querySelector('.summary');
  if (!summary) return;
  let strip = $('#averageOddsStrip');
  if (!strip) {
    strip = document.createElement('div');
    strip.id = 'averageOddsStrip';
    strip.className = 'average-odds-strip';
    summary.insertAdjacentElement('afterend', strip);
  }
  strip.innerHTML = average.complete
    ? `<span>Average Odds (Settled)</span><strong>${escapeHtml(average.text)}</strong><small>Calculated from all ${average.settledCount} settled 1X2 predictions</small>`
    : '<span>Average Odds (Settled)</span><strong>—</strong><small>Complete recorded Odds are not available for all settled 1X2 predictions</small>';
}

function pathFor(points, key, xFor, yFor) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point[key]).toFixed(2)}`).join(' ');
}

function renderPerformanceChart(records) {
  const host = $('#performanceChart');
  if (!host) return;

  const allSettled = records
    .filter(record => settledOutcomes.has(record.outcome))
    .sort((a, b) => recordTime(a) - recordTime(b));
  const { before, visible } = selectChartRange(allSettled, chartRange);
  const signature = `${chartRange}|${allSettled.map(record => `${record.fixtureId}:${record.outcome}:${record.homeScore}:${record.awayScore}`).join('|')}`;
  if (signature === lastChartSignature) return;
  lastChartSignature = signature;

  document.querySelectorAll('[data-chart-range]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartRange === chartRange);
  });

  if (!allSettled.length) {
    host.style.width = '100%';
    host.innerHTML = '<div class="chart-empty">The cumulative 1X2 chart will begin when the first official result is confirmed.</div>';
    $('#chartMeta').textContent = '0 settled results';
    return;
  }

  let correct = before.filter(record => record.outcome === 'correct').length;
  let incorrect = before.filter(record => record.outcome === 'incorrect').length;
  const points = [{ correct, incorrect, label: 'Start' }];

  visible.forEach(record => {
    if (record.outcome === 'correct') correct += 1;
    if (record.outcome === 'incorrect') incorrect += 1;
    points.push({ correct, incorrect, label: dateLabel(record), record });
  });

  const count = visible.length;
  const width = adaptiveChartWidth(host, count, chartRange);
  const height = 320;
  const margin = { top:20, right:24, bottom:48, left:44 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(5, correct, incorrect);
  const xFor = index => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yFor = value => margin.top + plotHeight - (value / maxValue) * plotHeight;

  const horizontalGrid = Array.from({ length:6 }, (_, index) => {
    const value = Math.round((maxValue / 5) * index);
    const y = yFor(value);
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}"></line><text class="chart-label" x="${margin.left-8}" y="${y+3}" text-anchor="end">${value}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.ceil(visible.length / 6));
  const dateLabels = visible.map((record, index) => {
    const show = index === visible.length - 1 || index % labelStep === 0;
    return show ? `<text class="chart-date" x="${xFor(index + 1)}" y="${height - 22}" text-anchor="middle">${escapeHtml(dateLabel(record))}</text>` : '';
  }).join('');

  host.style.width = `${width}px`;
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cumulative 1X2 results">
    ${horizontalGrid}
    <line class="chart-axis" x1="${margin.left}" y1="${height-margin.bottom}" x2="${width-margin.right}" y2="${height-margin.bottom}"></line>
    <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height-margin.bottom}"></line>
    <path class="chart-correct" d="${pathFor(points, 'correct', xFor, yFor)}"></path>
    <path class="chart-incorrect" d="${pathFor(points, 'incorrect', xFor, yFor)}"></path>
    ${dateLabels}
  </svg>`;

  const rangeText = visible.length === allSettled.length
    ? `All ${allSettled.length}`
    : `Latest ${visible.length} of ${allSettled.length}`;
  $('#chartMeta').textContent = `${rangeText} settled · Correct ${correct} · Incorrect ${incorrect}`;

  requestAnimationFrame(() => {
    const viewport = host.closest('.chart-viewport');
    if (viewport) viewport.scrollLeft = viewport.scrollWidth;
  });
}

function marketCard(title, stats, detail, href, average, active = false) {
  const oddsDetail = average.complete
    ? `Average Odds (Settled) ${average.text}`
    : 'Average Odds (Settled) —';
  return `<a class="market-stat market-stat-link ${active ? 'active' : ''}" href="${href}"><small>${escapeHtml(title)}</small><b>${escapeHtml(detail)}</b><span>Pending ${stats.pending ?? 0} · Accuracy ${(stats.accuracy ?? stats.weightedRate ?? 0).toFixed(2)}%</span><span class="market-odds-line">${escapeHtml(oddsDetail)}</span></a>`;
}

function marketCell(label, market) {
  return `<b>${escapeHtml(label)}: ${escapeHtml(market?.pick || '—')}</b><br><small>Odds ${escapeHtml(formatOdds(market?.odds))} · ${Number(market?.confidence || 0)}% · ${escapeHtml(marketResultText(market))}</small>`;
}

function render() {
  const records = loadCumulativeRecords();
  const summary = buildSummary(records);
  const markets = buildMarketSummary(records);
  const averages = {
    oneXTwo: averageOdds(records, record => record.odds, record => settledOutcomes.has(record.outcome)),
    btts: marketAverage(records, 'btts'),
    doubleChance: marketAverage(records, 'doubleChance'),
    asianHandicap: marketAverage(records, 'asianHandicap')
  };

  $('#total').textContent = summary.total;
  $('#settled').textContent = summary.settled;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#pending').textContent = summary.pending;
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;
  renderAverageOddsStrip(averages.oneXTwo);

  $('#marketStats').innerHTML = [
    marketCard('1X2 — Main Pick', markets.oneXTwo, `${markets.oneXTwo.correct} Correct · ${markets.oneXTwo.incorrect} Incorrect`, './', averages.oneXTwo, true),
    marketCard('BTTS', markets.btts, `${markets.btts.correct} Correct · ${markets.btts.incorrect} Incorrect`, './btts/', averages.btts),
    marketCard('Double Chance', markets.doubleChance, `${markets.doubleChance.correct} Correct · ${markets.doubleChance.incorrect} Incorrect`, './double-chance/', averages.doubleChance),
    marketCard('Asian Handicap', markets.asianHandicap, `W ${markets.asianHandicap.win} · HW ${markets.asianHandicap.halfWin} · P ${markets.asianHandicap.push} · HL ${markets.asianHandicap.halfLoss} · L ${markets.asianHandicap.loss}`, './asian-handicap/', averages.asianHandicap)
  ].join('');

  renderPerformanceChart(records);
  $('#historyRows').innerHTML = [...records].reverse().map((record, index) => `
    <tr>
      <td>${records.length-index}</td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}<br><small>${escapeHtml(record.league)}</small></td>
      <td><b>${escapeHtml(record.pickLabel || record.pick)}</b><br><small>Odds ${formatOdds(record.odds)} · ${record.confidence}%</small></td>
      <td>${marketCell('BTTS', record.markets?.btts)}</td>
      <td>${marketCell('DC', record.markets?.doubleChance)}</td>
      <td>${marketCell('AH', record.markets?.asianHandicap)}</td>
      <td>${escapeHtml(scoreText(record))}</td>
      <td>${escapeHtml(resultText(record))}</td>
    </tr>`).join('');
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-chart-range]');
  if (!button) return;
  chartRange = button.dataset.chartRange || '20';
  lastChartSignature = '';
  render();
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
