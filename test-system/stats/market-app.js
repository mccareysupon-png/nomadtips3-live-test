import { marketResultText, scoreText } from '../shared.js?v=202608051120';
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
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : 'Unavailable';
const marketKey = document.body.dataset.market || 'btts';
const isAsian = marketKey === 'asianHandicap';
let chartRange = '20';
let lastChartSignature = '';

const config = {
  btts: { title:'BTTS', label:'BTTS', positive:'Correct', negative:'Incorrect' },
  doubleChance: { title:'Double Chance', label:'DC', positive:'Correct', negative:'Incorrect' },
  asianHandicap: { title:'Asian Handicap', label:'AH', positive:'Win Points', negative:'Loss Points' }
}[marketKey];

const positiveLegend = document.querySelector('.correct-line');
const negativeLegend = document.querySelector('.incorrect-line');
if (positiveLegend) positiveLegend.innerHTML = `<i></i>${escapeHtml(config.positive)}`;
if (negativeLegend) negativeLegend.innerHTML = `<i></i>${escapeHtml(config.negative)}`;

function marketFor(record) {
  return record.markets?.[marketKey] || null;
}

function settledMarketRecords(records) {
  return records.filter(record => {
    const outcome = String(marketFor(record)?.outcome || 'pending');
    return isAsian
      ? ['win','half-win','push','half-loss','loss','correct','incorrect','void'].includes(outcome)
      : ['correct','incorrect','void'].includes(outcome);
  }).sort((a, b) => recordTime(a) - recordTime(b));
}

function standardSummary(records) {
  const markets = records.map(marketFor).filter(Boolean);
  const correct = markets.filter(market => market.outcome === 'correct').length;
  const incorrect = markets.filter(market => market.outcome === 'incorrect').length;
  const voids = markets.filter(market => market.outcome === 'void').length;
  const pending = markets.length - correct - incorrect - voids;
  const settled = correct + incorrect;
  return {
    total: markets.length,
    settled: settled + voids,
    correct,
    incorrect,
    voids,
    pending,
    accuracy: settled ? (correct / settled) * 100 : 0
  };
}

function asianSummary(records) {
  const counts = { win:0, halfWin:0, push:0, halfLoss:0, loss:0, pending:0 };
  records.map(marketFor).filter(Boolean).forEach(market => {
    const outcome = String(market.outcome || 'pending');
    if (outcome === 'win' || outcome === 'correct') counts.win += 1;
    else if (outcome === 'half-win') counts.halfWin += 1;
    else if (outcome === 'push' || outcome === 'void') counts.push += 1;
    else if (outcome === 'half-loss') counts.halfLoss += 1;
    else if (outcome === 'loss' || outcome === 'incorrect') counts.loss += 1;
    else counts.pending += 1;
  });
  const decisions = counts.win + counts.halfWin + counts.halfLoss + counts.loss;
  const settled = decisions + counts.push;
  const weightedRate = decisions ? ((counts.win + counts.halfWin * 0.5) / decisions) * 100 : 0;
  return { total: records.length, settled, decisions, weightedRate, ...counts };
}

function setMetric(index, label, value, hidden = false) {
  const card = $(`#metric${index}Card`);
  if (!card) return;
  card.hidden = hidden;
  $(`#metric${index}Label`).textContent = label;
  $(`#metric${index}`).textContent = value;
}

function renderSummary(records) {
  if (!isAsian) {
    const summary = standardSummary(records);
    setMetric(1, 'Total', summary.total);
    setMetric(2, 'Settled', summary.settled);
    setMetric(3, 'Correct', summary.correct);
    setMetric(4, 'Incorrect', summary.incorrect);
    setMetric(5, 'Pending', summary.pending);
    setMetric(6, 'Accuracy', `${summary.accuracy.toFixed(2)}%`);
    setMetric(7, '', '', true);
    setMetric(8, '', '', true);
    return;
  }

  const summary = asianSummary(records);
  setMetric(1, 'Total', summary.total);
  setMetric(2, 'Settled', summary.settled);
  setMetric(3, 'Win', summary.win);
  setMetric(4, 'Half Win', summary.halfWin);
  setMetric(5, 'Push', summary.push);
  setMetric(6, 'Half Loss', summary.halfLoss);
  setMetric(7, 'Loss', summary.loss);
  setMetric(8, 'Weighted Rate', `${summary.weightedRate.toFixed(2)}%`);
}

function marketDelta(outcome) {
  if (!isAsian) {
    return {
      positive: outcome === 'correct' ? 1 : 0,
      negative: outcome === 'incorrect' ? 1 : 0
    };
  }
  return {
    positive: outcome === 'win' || outcome === 'correct' ? 1 : outcome === 'half-win' ? 0.5 : 0,
    negative: outcome === 'loss' || outcome === 'incorrect' ? 1 : outcome === 'half-loss' ? 0.5 : 0
  };
}

function cumulativeTotals(records) {
  return records.reduce((totals, record) => {
    const delta = marketDelta(String(marketFor(record)?.outcome || 'pending'));
    totals.positive += delta.positive;
    totals.negative += delta.negative;
    return totals;
  }, { positive:0, negative:0 });
}

function pathFor(points, key, xFor, yFor) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point[key]).toFixed(2)}`).join(' ');
}

function renderChart(records) {
  const host = $('#performanceChart');
  const allSettled = settledMarketRecords(records);
  const { before, visible } = selectChartRange(allSettled, chartRange);
  const signature = `${marketKey}|${chartRange}|${allSettled.map(record => `${record.fixtureId}:${marketFor(record)?.outcome}`).join('|')}`;
  if (signature === lastChartSignature) return;
  lastChartSignature = signature;

  document.querySelectorAll('[data-chart-range]').forEach(button => {
    button.classList.toggle('active', button.dataset.chartRange === chartRange);
  });

  if (!allSettled.length) {
    host.style.width = '100%';
    host.innerHTML = `<div class="chart-empty">The cumulative ${escapeHtml(config.title)} chart will begin when the first result is confirmed.</div>`;
    $('#chartMeta').textContent = '0 settled results';
    return;
  }

  const starting = cumulativeTotals(before);
  let positive = starting.positive;
  let negative = starting.negative;
  const points = [{ positive, negative }];
  visible.forEach(record => {
    const delta = marketDelta(String(marketFor(record)?.outcome || 'pending'));
    positive += delta.positive;
    negative += delta.negative;
    points.push({ positive, negative, record });
  });

  const width = adaptiveChartWidth(host, visible.length, chartRange);
  const height = 320;
  const margin = { top:20, right:24, bottom:48, left:44 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(5, positive, negative);
  const xFor = index => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yFor = value => margin.top + plotHeight - (value / maxValue) * plotHeight;

  const horizontalGrid = Array.from({ length:6 }, (_, index) => {
    const value = Number(((maxValue / 5) * index).toFixed(1));
    const y = yFor(value);
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}"></line><text class="chart-label" x="${margin.left-8}" y="${y+3}" text-anchor="end">${value}</text>`;
  }).join('');

  const labelStep = Math.max(1, Math.ceil(visible.length / 6));
  const dateLabels = visible.map((record, index) => {
    const show = index === visible.length - 1 || index % labelStep === 0;
    return show ? `<text class="chart-date" x="${xFor(index + 1)}" y="${height - 22}" text-anchor="middle">${escapeHtml(dateLabel(record))}</text>` : '';
  }).join('');

  host.style.width = `${width}px`;
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cumulative ${escapeHtml(config.title)} results">
    ${horizontalGrid}
    <line class="chart-axis" x1="${margin.left}" y1="${height-margin.bottom}" x2="${width-margin.right}" y2="${height-margin.bottom}"></line>
    <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height-margin.bottom}"></line>
    <path class="chart-correct" d="${pathFor(points, 'positive', xFor, yFor)}"></path>
    <path class="chart-incorrect" d="${pathFor(points, 'negative', xFor, yFor)}"></path>
    ${dateLabels}
  </svg>`;

  const rangeText = visible.length === allSettled.length ? `All ${allSettled.length}` : `Latest ${visible.length} of ${allSettled.length}`;
  $('#chartMeta').textContent = `${rangeText} settled · ${config.positive} ${positive} · ${config.negative} ${negative}`;

  requestAnimationFrame(() => {
    const viewport = host.closest('.chart-viewport');
    if (viewport) viewport.scrollLeft = viewport.scrollWidth;
  });
}

function renderHistory(records) {
  $('#historyRows').innerHTML = [...records].reverse().map((record, index) => {
    const market = marketFor(record);
    return `<tr>
      <td>${records.length-index}</td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}<br><small>${escapeHtml(record.league)}</small></td>
      <td><b>${escapeHtml(market?.pick || '—')}</b><br><small>Odds ${escapeHtml(formatOdds(market?.odds))} · ${Number(market?.confidence || 0)}%</small></td>
      <td>${escapeHtml(scoreText(record))}</td>
      <td>${escapeHtml(marketResultText(market))}</td>
    </tr>`;
  }).join('');
}

function render() {
  const records = loadCumulativeRecords();
  renderSummary(records);
  renderChart(records);
  renderHistory(records);
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
window.setInterval(render, 3000);
