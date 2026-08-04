import { buildSummary, loadRecords, resultText } from '../shared.js?v=202608040728';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
let currentRecords = [];

function shareText(records) {
  const lines = records.map((record, index) => `${index + 1}. ${record.home} vs ${record.away} — ${record.pickLabel || record.pick} @ ${record.odds.toFixed(2)} (${record.confidence}%)`);
  return [`NOMADTIPS3 Test System — Today's ${records.length} Picks`, ...lines, 'Test data only. No stake or profit information.'].join('\n');
}

function render() {
  currentRecords = loadRecords();
  const summary = buildSummary(currentRecords);
  $('#posterCount').textContent = currentRecords.length;
  $('#posterAccuracy').textContent = `Accuracy ${summary.accuracy.toFixed(2)}%`;
  $('#posterDate').textContent = 'LOCKED MANUAL SET 2 · 4 AUGUST 2026';
  $('#posterList').innerHTML = currentRecords.map((record, index) => `
    <article class="poster-pick">
      <strong>${index + 1}</strong>
      <div><b>${escapeHtml(record.home)} vs ${escapeHtml(record.away)}</b><small>${escapeHtml(record.league)} · Odds ${record.odds.toFixed(2)} · Confidence ${record.confidence}% · Predicted ${escapeHtml(record.predictedScore)}</small></div>
      <span>${escapeHtml(record.pickLabel || record.pick)}<small>${escapeHtml(resultText(record))}</small></span>
    </article>`).join('');
}

$('#copyButton').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareText(currentRecords));
    $('#copyButton').textContent = 'Copied';
    setTimeout(() => { $('#copyButton').textContent = 'Copy Share Text'; }, 1500);
  } catch {
    alert(shareText(currentRecords));
  }
});
$('#shareButton').addEventListener('click', async () => {
  const text = shareText(currentRecords);
  if (navigator.share) {
    try { await navigator.share({ title:'NOMADTIPS3 Test Picks', text }); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert('Share text copied.');
  }
});
$('#printButton').addEventListener('click', () => window.print());
render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
