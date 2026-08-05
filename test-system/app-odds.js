import {
  buildSummary,
  formatKickoff,
  INTEGRITY_NOTE,
  loadRecords,
  marketResultText,
  resultText,
  scoreText,
  STORAGE_KEY
} from './shared.js?v=202608051120';

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);
const formatOdds = value => Number(value) > 0 ? Number(value).toFixed(2) : 'Odds Pending';
const LIVE = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);

function loadDisplayRecords() {
  const records = loadRecords();
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const details = new Map((state.publishedPicks || []).map(record => [String(record.fixtureId), record]));
    return records.map(record => {
      const detail = details.get(String(record.fixtureId)) || {};
      return {
        ...record,
        matchStatus: detail.matchStatus || null,
        matchStatusLong: detail.matchStatusLong || null,
        elapsed: detail.elapsed ?? null,
        resultAutoVoid: Boolean(detail.resultAutoVoid)
      };
    });
  } catch {
    return records;
  }
}

function displayResult(record) {
  if (record.outcome === 'correct') return 'CORRECT';
  if (record.outcome === 'incorrect') return 'INCORRECT';
  if (record.outcome === 'void') return 'VOID';
  const status = String(record.matchStatus || '').toUpperCase();
  if (LIVE.has(status)) return record.elapsed ? `LIVE ${record.elapsed}′` : 'LIVE';
  if (status === 'NOT_CONFIRMED') return 'UNDER REVIEW';
  return resultText(record);
}

function stateClass(record) {
  if (record.outcome === 'correct') return 'correct';
  if (record.outcome === 'incorrect') return 'incorrect';
  if (record.outcome === 'void') return 'void';
  if (record.status === 'MANUAL_RESULT_REQUIRED') return 'manual-required';
  return 'waiting';
}

function teamNameWithOdds(record, side) {
  const teamName = side === 'HOME' ? record.home : record.away;
  const selectedSide = String(record.pick || '').toUpperCase();
  const odds = Number(record.odds);
  const oddsHtml = selectedSide === side && odds > 0
    ? ` <span style="display:inline-block;margin-left:6px;color:#f2c94c;font-size:11px;font-weight:900;white-space:nowrap">Odds ${escapeHtml(odds.toFixed(2))}</span>`
    : '';
  return `${escapeHtml(teamName)}${oddsHtml}`;
}

function renderMarket(label, market) {
  const pendingOdds = !Number(market?.odds);
  return `
    <div class="market-card">
      <small>${escapeHtml(label)}</small>
      <b>${escapeHtml(market?.pick || '—')}</b>
      <span class="market-meta">
        <em class="${pendingOdds ? 'odds-pending' : ''}">${escapeHtml(formatOdds(market?.odds))}</em>
        <em>Confidence ${Number(market?.confidence || 0)}%</em>
        <em>${escapeHtml(marketResultText(market))}</em>
      </span>
    </div>`;
}

function render() {
  const records = loadDisplayRecords();
  const summary = buildSummary(records);
  $('#total').textContent = summary.total;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#voids').textContent = summary.voids;
  $('#pending').textContent = summary.pending;
  $('#accuracy').textContent = `${summary.accuracy.toFixed(2)}%`;
  $('#integrityNote').textContent = INTEGRITY_NOTE;

  const stored = localStorage.getItem(STORAGE_KEY);
  $('#sourceNote').textContent = stored
    ? (summary.pending ? `Automatic result processing · ${summary.pending} waiting` : `Finalized NOMAD SYSTEM · ${records.length} predictions`)
    : 'Loading finalized NOMAD SYSTEM analysis';

  $('#pickGrid').innerHTML = records.map((record, index) => `
    <article class="pick-card">
      <header>
        <div class="pick-heading">
          <span class="pick-rank">MATCH ${index + 1}</span>
          <span class="league">${escapeHtml(record.league)}</span>
        </div>
        <span class="state ${stateClass(record)}">${escapeHtml(displayResult(record))}</span>
      </header>
      <div class="teams">
        <div class="team"><strong>${teamNameWithOdds(record, 'HOME')}</strong><small>HOME</small></div>
        <div class="score"><b>${escapeHtml(scoreText(record))}</b><small>${escapeHtml(formatKickoff(record.kickoffUtc))}</small></div>
        <div class="team"><strong>${teamNameWithOdds(record, 'AWAY')}</strong><small>AWAY</small></div>
      </div>
      <div class="pick-data">
        <div class="prediction-primary"><small>Main Pick · 1X2</small><b>${escapeHtml(record.pickLabel || record.pick)}</b></div>
        <div><small>Odds</small><b>${escapeHtml(formatOdds(record.odds))}</b><small>Source: ${escapeHtml(record.bookmaker || '—')}</small></div>
        <div><small>Confidence</small><b>${record.confidence}%</b></div>
        <div><small>Predicted Score</small><b>${escapeHtml(record.predictedScore)}</b></div>
      </div>
      <div class="market-grid" aria-label="Additional market analysis">
        ${renderMarket('BTTS', record.markets?.btts)}
        ${renderMarket('Double Chance', record.markets?.doubleChance)}
        ${renderMarket('Asian Handicap', record.markets?.asianHandicap)}
      </div>
      <div class="reason"><strong>Match Analysis</strong><br>${escapeHtml(record.reason)} · A–B–C comparison: ${escapeHtml(record.abcResult)}</div>
    </article>`).join('');
}

render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.setInterval(render, 3000);
