import { loadCumulativeRecords } from './cumulative.js?v=202608051149';

const $ = selector => document.querySelector(selector);
const STANDARD_POSITIVE = new Set(['correct', 'win']);
const STANDARD_NEGATIVE = new Set(['incorrect', 'loss']);
const EMPTY_PICKS = new Set(['', '—', '-', 'N/A', 'NA', 'NONE', 'NULL']);

function hasPrediction(value) {
  return !EMPTY_PICKS.has(String(value ?? '').trim().toUpperCase());
}

function finiteOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function collectPredictions(records) {
  const predictions = [];

  for (const record of records) {
    if (hasPrediction(record.pickLabel || record.pick)) {
      predictions.push({
        market: '1X2',
        outcome: String(record.outcome || 'pending').toLowerCase(),
        odds: finiteOdds(record.odds)
      });
    }

    const markets = record.markets || {};
    for (const [market, key] of [
      ['BTTS', 'btts'],
      ['Double Chance', 'doubleChance'],
      ['Asian Handicap', 'asianHandicap']
    ]) {
      const value = markets[key];
      if (!value || !hasPrediction(value.pick)) continue;
      predictions.push({
        market,
        outcome: String(value.outcome || value.settlement || 'pending').toLowerCase(),
        odds: finiteOdds(value.odds)
      });
    }
  }

  return predictions;
}

function buildCombinedSummary(records) {
  const predictions = collectPredictions(records);
  let positive = 0;
  let negative = 0;
  let push = 0;
  let voids = 0;
  let pending = 0;
  let weightedPoints = 0;
  let decisions = 0;

  for (const prediction of predictions) {
    const outcome = prediction.outcome;
    if (STANDARD_POSITIVE.has(outcome)) {
      positive += 1;
      weightedPoints += 1;
      decisions += 1;
    } else if (outcome === 'half-win') {
      positive += 1;
      weightedPoints += 0.5;
      decisions += 1;
    } else if (STANDARD_NEGATIVE.has(outcome) || outcome === 'half-loss') {
      negative += 1;
      decisions += 1;
    } else if (outcome === 'push') {
      push += 1;
    } else if (outcome === 'void') {
      voids += 1;
    } else {
      pending += 1;
    }
  }

  const recordedOdds = predictions.map(item => item.odds).filter(value => value !== null);
  const averageOdds = recordedOdds.length
    ? recordedOdds.reduce((sum, value) => sum + value, 0) / recordedOdds.length
    : null;

  return {
    total: predictions.length,
    settled: predictions.length - pending,
    positive,
    negative,
    push,
    voids,
    pending,
    rate: decisions ? (weightedPoints / decisions) * 100 : 0,
    averageOdds,
    recordedOdds: recordedOdds.length
  };
}

function ensurePanel() {
  let panel = $('#combinedPredictionsPanel');
  if (panel) return panel;

  const oneXTwoSummary = document.querySelector('.summary');
  if (!oneXTwoSummary) return null;

  panel = document.createElement('section');
  panel.id = 'combinedPredictionsPanel';
  panel.className = 'panel';
  panel.style.marginBottom = '14px';
  panel.innerHTML = `
    <div class="panel-head">
      <div>
        <h2>All Predictions — Combined Summary</h2>
        <small>Combined results from 1X2, BTTS, Double Chance and Asian Handicap</small>
      </div>
    </div>
    <section class="summary combined-summary" style="margin:0">
      <div class="metric"><small>All Predictions</small><b id="combinedTotal">0</b></div>
      <div class="metric"><small>Settled</small><b id="combinedSettled">0</b></div>
      <div class="metric"><small>Positive</small><b id="combinedPositive">0</b></div>
      <div class="metric"><small>Negative</small><b id="combinedNegative">0</b></div>
      <div class="metric"><small>Push</small><b id="combinedPush">0</b></div>
      <div class="metric"><small>Void</small><b id="combinedVoid">0</b></div>
      <div class="metric"><small>Pending</small><b id="combinedPending">0</b></div>
      <div class="metric"><small>Overall Rate</small><b id="combinedRate">0.00%</b></div>
      <div class="metric"><small>Average Odds</small><b id="combinedAverageOdds">No Data</b></div>
    </section>
    <div id="combinedOddsNote" class="chart-footnote" style="margin-top:10px"></div>`;

  oneXTwoSummary.insertAdjacentElement('beforebegin', panel);
  return panel;
}

function renderCombinedSummary() {
  if (!ensurePanel()) return;
  const summary = buildCombinedSummary(loadCumulativeRecords());

  $('#combinedTotal').textContent = summary.total;
  $('#combinedSettled').textContent = summary.settled;
  $('#combinedPositive').textContent = summary.positive;
  $('#combinedNegative').textContent = summary.negative;
  $('#combinedPush').textContent = summary.push;
  $('#combinedVoid').textContent = summary.voids;
  $('#combinedPending').textContent = summary.pending;
  $('#combinedRate').textContent = `${summary.rate.toFixed(2)}%`;
  $('#combinedAverageOdds').textContent = summary.averageOdds === null
    ? 'No Data'
    : summary.averageOdds.toFixed(2);
  $('#combinedOddsNote').textContent = summary.recordedOdds
    ? `Average Odds uses ${summary.recordedOdds} real recorded prices across all markets. Missing or N/A prices are excluded.`
    : 'No real recorded Odds are available across the combined markets yet.';
}

renderCombinedSummary();
window.addEventListener('storage', renderCombinedSummary);
window.addEventListener('nomad-results-updated', renderCombinedSummary);
window.setInterval(renderCombinedSummary, 3000);
