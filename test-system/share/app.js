import { buildSummary, loadRecords, resultText } from '../shared.js?v=202608040728';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : '—';
let currentRecords = [];

function shareText(records) {
  const lines = records.map((record, index) => `${index + 1}. ${record.home} vs ${record.away} — ${record.pickLabel || record.pick} · Confidence ${record.confidence}% · Predicted ${record.predictedScore}`);
  return [`NOMADTIPS3 Test System — Today’s ${records.length} Match Predictions`, ...lines, 'Sports analysis only. No gambling services, betting links, stakes or financial incentives.'].join('\n');
}

function render() {
  currentRecords = loadRecords();
  const summary = buildSummary(currentRecords);
  $('#posterCount').textContent = currentRecords.length;
  $('#posterAccuracy').textContent = `Accuracy ${summary.accuracy.toFixed(2)}%`;
  $('#posterDate').textContent = 'FINALIZED MANUAL SET 2 · 4 AUGUST 2026';
  $('#posterList').innerHTML = currentRecords.map((record, index) => `
    <article class="poster-pick">
      <strong>${index + 1}</strong>
      <div><b>${escapeHtml(record.home)} vs ${escapeHtml(record.away)}</b><small>${escapeHtml(record.league)} · Odds ${formatOdds(record.odds)} · Confidence ${record.confidence}% · Predicted ${escapeHtml(record.predictedScore)}</small></div>
      <span>${escapeHtml(record.pickLabel || record.pick)}<small>${escapeHtml(resultText(record))}</small></span>
    </article>`).join('');
}

$('#copyButton').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(shareText(currentRecords));
    $('#copyButton').textContent = 'Copied';
    setTimeout(() => { $('#copyButton').textContent = 'Copy Analysis Text'; }, 1500);
  } catch {
    alert(shareText(currentRecords));
  }
});
$('#shareButton').addEventListener('click', async () => {
  const text = shareText(currentRecords);
  if (navigator.share) {
    try { await navigator.share({ title:'NOMADTIPS3 Match Predictions', text }); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert('Analysis text copied.');
  }
});
$('#printButton').addEventListener('click', () => window.print());
render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
