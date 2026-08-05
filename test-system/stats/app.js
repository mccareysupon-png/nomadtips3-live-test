import {
  buildMarketSummary,
  buildSummary,
  loadRecords,
  marketResultText,
  resultText,
  scoreText
} from '../shared.js?v=202608051120';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : 'Pending';
const settledOutcomes = new Set(['correct','incorrect']);
let lastChartSignature = '';

function recordTime(record) {
  const time = new Date(record.kickoffUtc ?? record.pickDate ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}
function dateLabel(record) {
  try {
    return new Intl.DateTimeFormat(undefined, {day:'2-digit',month:'short',year:'2-digit'}).format(new Date(record.kickoffUtc ?? record.pickDate));
  } catch {
    return record.pickDate ?? '—';
  }
}
function pathFor(points, key, xFor, yFor) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${xFor(index).toFixed(2)},${yFor(point[key]).toFixed(2)}`).join(' ');
}
function renderPerformanceChart(records) {
  const host = $('#performanceChart');
  if (!host) return;
  const settled = records.filter(record => settledOutcomes.has(record.outcome)).sort((a,b) => recordTime(a)-recordTime(b));
  const signature = settled.map(record => `${record.fixtureId}:${record.outcome}:${record.homeScore}:${record.awayScore}`).join('|');
  if (signature === lastChartSignature) return;
  lastChartSignature = signature;
  if (!settled.length) {
    host.style.width = '100%';
    host.innerHTML = '<div class="chart-empty">The cumulative 1X2 chart will begin when the first official result is confirmed.</div>';
    $('#chartMeta').textContent = '0 settled results';
    return;
  }
  let correct = 0;
  let incorrect = 0;
  const points = [{correct:0,incorrect:0,label:'Start'}];
  settled.forEach(record => {
    if (record.outcome === 'correct') correct += 1;
    if (record.outcome === 'incorrect') incorrect += 1;
    points.push({correct,incorrect,label:dateLabel(record),record});
  });
  const count = settled.length;
  const width = Math.max(900, 82 + count * 22);
  const height = 320;
  const margin = {top:20,right:24,bottom:48,left:44};
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxValue = Math.max(5,correct,incorrect);
  const xFor = index => margin.left + (index / Math.max(1, points.length - 1)) * plotWidth;
  const yFor = value => margin.top + plotHeight - (value / maxValue) * plotHeight;
  const horizontalGrid = Array.from({length:6}, (_, index) => {
    const value = Math.round((maxValue / 5) * index);
    const y = yFor(value);
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width-margin.right}" y2="${y}"></line><text class="chart-label" x="${margin.left-8}" y="${y+3}" text-anchor="end">${value}</text>`;
  }).join('');
  const correctPath = pathFor(points,'correct',xFor,yFor);
  const incorrectPath = pathFor(points,'incorrect',xFor,yFor);
  host.style.width = `${width}px`;
  host.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cumulative 1X2 results">
    ${horizontalGrid}
    <line class="chart-axis" x1="${margin.left}" y1="${height-margin.bottom}" x2="${width-margin.right}" y2="${height-margin.bottom}"></line>
    <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height-margin.bottom}"></line>
    <path class="chart-correct" d="${correctPath}"></path>
    <path class="chart-incorrect" d="${incorrectPath}"></path>
  </svg>`;
  $('#chartMeta').textContent = `${count} settled results · Correct ${correct} · Incorrect ${incorrect}`;
}
function marketCard(title, stats, detail) {
  return `<div class="market-stat"><small>${escapeHtml(title)}</small><b>${escapeHtml(detail)}</b><span>Pending ${stats.pending ?? 0} · Accuracy ${(stats.accuracy ?? stats.weightedRate ?? 0).toFixed(2)}%</span></div>`;
}
function marketCell(label, market) {
  return `<b>${escapeHtml(label)}: ${escapeHtml(market?.pick || '—')}</b><br><small>Odds ${escapeHtml(formatOdds(market?.odds))} · ${Number(market?.confidence || 0)}% · ${escapeHtml(marketResultText(market))}</small>`;
}
function render() {
  const records = loadRecords();
  const summary = buildSummary(records);
  const markets = buildMarketSummary(records);
  $('#total').textContent = summary.total;
  $('#settled').textContent = summary.settled;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#pending').textContent = summary.pending;
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;

  $('#marketStats').innerHTML = [
    marketCard('1X2 — Main Pick', markets.oneXTwo, `${markets.oneXTwo.correct} Correct · ${markets.oneXTwo.incorrect} Incorrect`),
    marketCard('BTTS', markets.btts, `${markets.btts.correct} Correct · ${markets.btts.incorrect} Incorrect`),
    marketCard('Double Chance', markets.doubleChance, `${markets.doubleChance.correct} Correct · ${markets.doubleChance.incorrect} Incorrect`),
    `<div class="market-stat"><small>Asian Handicap</small><b>W ${markets.asianHandicap.win} · HW ${markets.asianHandicap.halfWin} · P ${markets.asianHandicap.push} · HL ${markets.asianHandicap.halfLoss} · L ${markets.asianHandicap.loss}</b><span>Pending ${markets.asianHandicap.pending} · Weighted Rate ${markets.asianHandicap.weightedRate.toFixed(2)}%</span></div>`
  ].join('');

  renderPerformanceChart(records);
  $('#historyRows').innerHTML = records.map((record,index) => `
    <tr>
      <td>${index+1}</td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}<br><small>${escapeHtml(record.league)}</small></td>
      <td><b>${escapeHtml(record.pickLabel || record.pick)}</b><br><small>Odds ${formatOdds(record.odds)} · ${record.confidence}%</small></td>
      <td>${marketCell('BTTS', record.markets?.btts)}</td>
      <td>${marketCell('DC', record.markets?.doubleChance)}</td>
      <td>${marketCell('AH', record.markets?.asianHandicap)}</td>
      <td>${escapeHtml(scoreText(record))}</td>
      <td>${escapeHtml(resultText(record))}</td>
    </tr>`).join('');
}
render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.setInterval(render, 3000);
