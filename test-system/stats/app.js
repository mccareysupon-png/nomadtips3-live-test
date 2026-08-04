import { buildSummary, loadRecords, resultText, scoreText } from '../shared.js?v=202608040728';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : '—';
const settledOutcomes = new Set(['correct','incorrect']);
let lastChartSignature = '';

function recordTime(record) {
  const time = new Date(record.kickoffUtc ?? record.pickDate ?? 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function dateLabel(record) {
  try {
    return new Intl.DateTimeFormat(undefined, { day:'2-digit', month:'short', year:'2-digit' }).format(new Date(record.kickoffUtc ?? record.pickDate));
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

  const settled = records
    .filter(record => settledOutcomes.has(record.outcome))
    .sort((a, b) => recordTime(a) - recordTime(b));

  const signature = settled.map(record => `${record.fixtureId}:${record.outcome}:${record.homeScore}:${record.awayScore}`).join('|');
  if (signature === lastChartSignature) return;

  const viewport = host.closest('.chart-viewport');
  const nearLatest = !viewport || viewport.scrollWidth - viewport.clientWidth - viewport.scrollLeft < 80;
  lastChartSignature = signature;

  if (!settled.length) {
    host.style.width = '100%';
    host.innerHTML = '<div class="chart-empty">The cumulative performance chart will begin when the first match result is confirmed.</div>';
    $('#chartMeta').textContent = '0 settled results';
    return;
  }

  let correct = 0;
  let incorrect = 0;
  const points = [{ correct:0, incorrect:0, label:'Start' }];
  settled.forEach(record => {
    if (record.outcome === 'correct') correct += 1;
    if (record.outcome === 'incorrect') incorrect += 1;
    points.push({ correct, incorrect, label:dateLabel(record), record });
  });

  const count = settled.length;
  const pointGap = count > 1500 ? 3 : count > 800 ? 5 : count > 400 ? 8 : count > 150 ? 12 : 22;
  const width = Math.max(900, Math.min(32000, 82 + count * pointGap));
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
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"></line><text class="chart-label" x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${value}</text>`;
  }).join('');

  const targetLabels = Math.min(10, count);
  const labelStep = Math.max(1, Math.ceil(count / targetLabels));
  const dateTicks = settled.map((record, index) => ({ record, pointIndex:index + 1 }))
    .filter((item, index) => index === 0 || index === count - 1 || index % labelStep === 0)
    .map(item => {
      const x = xFor(item.pointIndex);
      return `<line class="chart-grid" x1="${x}" y1="${margin.top}" x2="${x}" y2="${height - margin.bottom}"></line><text class="chart-date" x="${x}" y="${height - 18}" text-anchor="middle">${escapeHtml(dateLabel(item.record))}</text>`;
    }).join('');

  const correctPath = pathFor(points, 'correct', xFor, yFor);
  const incorrectPath = pathFor(points, 'incorrect', xFor, yFor);
  const lastX = xFor(points.length - 1);

  host.style.width = `${width}px`;
  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Cumulative correct and incorrect prediction results">
      ${horizontalGrid}
      ${dateTicks}
      <line class="chart-axis" x1="${margin.left}" y1="${height - margin.bottom}" x2="${width - margin.right}" y2="${height - margin.bottom}"></line>
      <line class="chart-axis" x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
      <path class="chart-correct" d="${correctPath}"></path>
      <path class="chart-incorrect" d="${incorrectPath}"></path>
      <circle class="chart-end-correct" cx="${lastX}" cy="${yFor(correct)}" r="2.5"><title>Correct: ${correct}</title></circle>
      <circle class="chart-end-incorrect" cx="${lastX}" cy="${yFor(incorrect)}" r="2.5"><title>Incorrect: ${incorrect}</title></circle>
    </svg>`;

  $('#chartMeta').textContent = `${count} settled results · Correct ${correct} · Incorrect ${incorrect}`;
  requestAnimationFrame(() => {
    if (viewport && nearLatest) viewport.scrollLeft = viewport.scrollWidth;
  });
}

function render() {
  const records = loadRecords();
  const summary = buildSummary(records);
  $('#total').textContent = summary.total;
  $('#settled').textContent = summary.settled;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#pending').textContent = summary.pending;
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;

  renderPerformanceChart(records);

  $('#historyRows').innerHTML = records.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.league)}</td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}</td>
      <td>${escapeHtml(record.pickLabel || record.pick)}</td>
      <td>${formatOdds(record.odds)}</td>
      <td>${record.confidence}%</td>
      <td>${escapeHtml(scoreText(record))}</td>
      <td>${escapeHtml(resultText(record))}</td>
    </tr>`).join('');
}

render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.setInterval(render, 3000);
