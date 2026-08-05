import { buildSummary, loadRecords, resultText } from '../shared.js?v=202608051120';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : 'Pending';
let currentRecords = [];

function marketText(label, market) {
  return `${label} ${market?.pick || '—'} · Odds ${formatOdds(market?.odds)} · Confidence ${Number(market?.confidence || 0)}%`;
}
function shareText(records) {
  const lines = records.flatMap((record,index) => [
    `${index+1}. ${record.home} vs ${record.away}`,
    `1X2: ${record.pickLabel || record.pick} · Odds ${formatOdds(record.odds)} · Confidence ${record.confidence}% · Predicted ${record.predictedScore}`,
    marketText('BTTS:', record.markets?.btts),
    marketText('Double Chance:', record.markets?.doubleChance),
    marketText('Asian Handicap:', record.markets?.asianHandicap)
  ]);
  return [`NOMADTIPS3 Test System — Day 7 · ${records.length} Official Match Predictions`, ...lines, 'Sports analysis only. No gambling services, betting links, stakes or financial incentives.'].join('\n');
}
function render() {
  currentRecords = loadRecords();
  const summary = buildSummary(currentRecords);
  $('#posterCount').textContent = currentRecords.length;
  $('#posterAccuracy').textContent = `1X2 Accuracy ${summary.accuracy.toFixed(2)}%`;
  $('#posterDate').textContent = 'NOMAD SYSTEM · DAY 7 · 5 AUGUST 2026';
  $('#posterList').innerHTML = currentRecords.map((record,index) => `
    <article class="poster-pick">
      <strong>${index+1}</strong>
      <div>
        <b>${escapeHtml(record.home)} vs ${escapeHtml(record.away)}</b>
        <small>${escapeHtml(record.league)} · Predicted ${escapeHtml(record.predictedScore)}</small>
        <small>1X2 ${escapeHtml(record.pickLabel || record.pick)} · Odds ${formatOdds(record.odds)} · ${record.confidence}%</small>
        <small>BTTS ${escapeHtml(record.markets?.btts?.pick)} · Odds ${formatOdds(record.markets?.btts?.odds)} · ${record.markets?.btts?.confidence}%</small>
        <small>DC ${escapeHtml(record.markets?.doubleChance?.pick)} · Odds ${formatOdds(record.markets?.doubleChance?.odds)} · ${record.markets?.doubleChance?.confidence}%</small>
        <small>AH ${escapeHtml(record.markets?.asianHandicap?.pick)} · Odds ${formatOdds(record.markets?.asianHandicap?.odds)} · ${record.markets?.asianHandicap?.confidence}%</small>
      </div>
      <span>${escapeHtml(resultText(record))}</span>
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
    try { await navigator.share({title:'NOMADTIPS3 Match Predictions',text}); } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert('Analysis text copied.');
  }
});
$('#printButton').addEventListener('click', () => window.print());
render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
