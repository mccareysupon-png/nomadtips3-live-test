import { buildSummary, loadRecords, resultText, scoreText } from '../shared.js?v=202608040728';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);

function render() {
  const records = loadRecords();
  const summary = buildSummary(records);
  $('#total').textContent = summary.total;
  $('#settled').textContent = summary.settled;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#averageOdds').textContent = summary.averageOdds.toFixed(2);
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;

  const rows = [
    ['Correct', summary.correct, 'var(--green)'],
    ['Incorrect', summary.incorrect, 'var(--red)'],
    ['Void', summary.voids, 'var(--blue)'],
    ['Pending', summary.pending, 'var(--yellow)']
  ];
  $('#bars').innerHTML = rows.map(([label, value, color]) => {
    const width = summary.total ? Math.round((value / summary.total) * 100) : 0;
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${width}%;background:${color}"></i></div><b>${value}</b></div>`;
  }).join('');

  $('#historyRows').innerHTML = records.map((record, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(record.league)}</td>
      <td><b>${escapeHtml(record.home)}</b> vs ${escapeHtml(record.away)}</td>
      <td>${escapeHtml(record.pickLabel || record.pick)}</td>
      <td>${record.odds.toFixed(2)}</td>
      <td>${escapeHtml(scoreText(record))}</td>
      <td>${escapeHtml(resultText(record))}</td>
      <td>${escapeHtml(record.resultSource ?? record.source)}</td>
    </tr>`).join('');
}

render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
