import { loadCumulativeRecords } from './cumulative.js?v=202608051149';

const EMPTY_PICKS = new Set(['', '—', '-', 'N/A', 'NA', 'NONE', 'NULL']);
const marketKey = document.body.dataset.market || 'oneXTwo';

function hasPrediction(value) {
  return !EMPTY_PICKS.has(String(value ?? '').trim().toUpperCase());
}

function finiteOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function predictionFor(record) {
  if (marketKey === 'oneXTwo') {
    if (!hasPrediction(record.pickLabel || record.pick)) return null;
    return {
      odds: finiteOdds(record.odds),
      outcome: String(record.outcome || 'pending').toLowerCase()
    };
  }

  const market = record.markets?.[marketKey];
  if (!market || !hasPrediction(market.pick)) return null;
  return {
    odds: finiteOdds(market.odds),
    outcome: String(market.outcome || market.settlement || 'pending').toLowerCase()
  };
}

function outcomeReturn(prediction) {
  if (!prediction || prediction.outcome === 'pending') return null;
  if (prediction.odds === null) return null;

  const { outcome, odds } = prediction;
  if (outcome === 'correct' || outcome === 'win') return odds;
  if (outcome === 'half-win') return 1 + ((odds - 1) * 0.5);
  if (outcome === 'incorrect' || outcome === 'loss') return 0;
  if (outcome === 'half-loss') return 0.5;
  if (outcome === 'push' || outcome === 'void') return 1;
  return null;
}

function calculatePercentage(records) {
  let calculated = 0;
  let returned = 0;

  records.forEach(record => {
    const value = outcomeReturn(predictionFor(record));
    if (value === null) return;
    calculated += 1;
    returned += value;
  });

  return calculated ? ((returned - calculated) / calculated) * 100 : 0;
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function ensureTarget() {
  let target = document.querySelector('#performancePercent');
  if (target) return target;

  const summary = document.querySelector('.summary');
  if (!summary) return null;

  const card = document.createElement('div');
  card.className = 'metric';
  card.setAttribute('aria-label', 'Percentage');
  card.innerHTML = '<small aria-hidden="true">&nbsp;</small><b id="performancePercent">0.00%</b>';
  summary.appendChild(card);
  return card.querySelector('#performancePercent');
}

function renderPercentage() {
  const target = ensureTarget();
  if (!target) return;

  const value = calculatePercentage(loadCumulativeRecords());
  target.textContent = formatPercent(value);
  target.style.removeProperty('color');
  if (value > 0) target.style.color = 'var(--green)';
  if (value < 0) target.style.color = 'var(--red)';
}

renderPercentage();
window.addEventListener('storage', renderPercentage);
window.addEventListener('nomad-results-updated', renderPercentage);
window.setInterval(renderPercentage, 3000);
