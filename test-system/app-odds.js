import { buildSummary, formatKickoff, loadRecords, resultText, scoreText, STORAGE_KEY } from './shared.js?v=202608041840';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' })[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : '—';

function stateClass(record) {
  if (record.outcome === 'correct') return 'correct';
  if (record.outcome === 'incorrect') return 'incorrect';
  if (record.outcome === 'void') return 'void';
  if (record.status === 'MANUAL_RESULT_REQUIRED') return 'manual-required';
  return 'waiting';
}

function render() {
  const records = loadRecords();
  const summary = buildSummary(records);
  $('#total').textContent = summary.total;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#voids').textContent = summary.voids;
  $('#pending').textContent = summary.pending;
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;

  const stored = localStorage.getItem(STORAGE_KEY);
  $('#sourceNote').textContent = stored
    ? `Finalized Manual Set 2 · ${records.length} predictions`
    : 'Loading finalized Manual Set 2 analysis';

  $('#pickGrid').innerHTML = records.map((record, index) => `
    <article class="pick-card">
      <header>
        <div class="pick-heading">
          <span class="pick-rank">MATCH ${index + 1}</span>
          <span class="league">${escapeHtml(record.league)}</span>
        </div>
        <span class="state ${stateClass(record)}">${escapeHtml(resultText(record))}</span>
      </header>
      <div class="teams">
        <div class="team"><strong>${escapeHtml(record.home)}</strong><small>HOME</small></div>
        <div class="score"><b>${escapeHtml(scoreText(record))}</b><small>${escapeHtml(formatKickoff(record.kickoffUtc))}</small></div>
        <div class="team"><strong>${escapeHtml(record.away)}</strong><small>AWAY</small></div>
      </div>
      <div class="pick-data">
        <div class="prediction-primary"><small>Match Prediction</small><b>${escapeHtml(record.pickLabel || record.pick)}</b></div>
        <div><small>Odds</small><b style="color:var(--yellow);font-size:13px">${formatOdds(record.odds)}</b><small style="margin-top:3px;text-transform:none">Source: ${escapeHtml(record.bookmaker || '—')}</small></div>
        <div><small>Confidence</small><b>${record.confidence}%</b></div>
        <div><small>Predicted Score</small><b>${escapeHtml(record.predictedScore)}</b></div>
      </div>
      <div class="reason"><strong>Match Analysis</strong><br>${escapeHtml(record.reason)} · A–B–C comparison: ${escapeHtml(record.abcResult)}</div>
    </article>`).join('');
}

render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
