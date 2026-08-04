import { buildSummary, formatKickoff, loadRecords, resultText, scoreText, STORAGE_KEY } from './shared.js?v=202608040728';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' })[char]);

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
    ? `Locked Manual Set 2 · ${records.length} picks`
    : 'Loading locked Manual Set 2 set';

  $('#pickGrid').innerHTML = records.map((record, index) => `
    <article class="pick-card">
      <header>
        <span class="league">${escapeHtml(record.league)} · PICK ${index + 1}</span>
        <span class="state ${stateClass(record)}">${escapeHtml(resultText(record))}</span>
      </header>
      <div class="teams">
        <div class="team"><strong>${escapeHtml(record.home)}</strong><small>HOME</small></div>
        <div class="score"><b>${escapeHtml(scoreText(record))}</b><small>${escapeHtml(formatKickoff(record.kickoffUtc))}</small></div>
        <div class="team"><strong>${escapeHtml(record.away)}</strong><small>AWAY</small></div>
      </div>
      <div class="pick-data">
        <div><small>1X2 Pick</small><b>${escapeHtml(record.pickLabel || record.pick)}</b></div>
        <div><small>Locked Odds</small><b>${Number(record.odds).toFixed(2)}</b></div>
        <div><small>Confidence</small><b>${record.confidence}%</b></div>
        <div><small>Predicted</small><b>${escapeHtml(record.predictedScore)}</b></div>
      </div>
      <div class="reason">BTTS ${escapeHtml(record.btts)} · Double Chance ${escapeHtml(record.doubleChance)} · AH ${escapeHtml(record.asianHandicap)}<br>${escapeHtml(record.reason)} · A–B–C: ${escapeHtml(record.abcResult)}</div>
    </article>`).join('');
}

render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
