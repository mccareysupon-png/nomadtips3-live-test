import { loadCumulativeRecords } from './cumulative.js?v=202608061015';

const EMPTY_PICKS = new Set(['', '—', '-', 'N/A', 'NA', 'NONE', 'NULL']);
const PROFIT_START_DATE = '2026-08-06';
const marketKey = document.body.dataset.market || 'oneXTwo';

function hasPrediction(value) {
  return !EMPTY_PICKS.has(String(value ?? '').trim().toUpperCase());
}

function finiteOdds(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function resolvedOutcome(value) {
  const outcome = String(value?.outcome ?? '').trim().toLowerCase();
  const settlement = String(value?.settlement ?? '').trim().toLowerCase();
  if (outcome && outcome !== 'pending') return outcome;
  if (settlement && settlement !== 'pending') return settlement;
  return outcome || settlement || 'pending';
}

function recordDate(record) {
  const explicit = String(record?.pickDate ?? record?.date ?? '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const timestamp = Date.parse(record?.kickoffUtc ?? record?.kickoff_utc ?? '');
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : '';
}

function isProfitEra(record) {
  const date = recordDate(record);
  return Boolean(date && date >= PROFIT_START_DATE);
}

function predictionFor(record) {
  if (marketKey === 'oneXTwo') {
    if (!hasPrediction(record.pickLabel || record.pick)) return null;
    return {
      odds: finiteOdds(record.odds),
      outcome: resolvedOutcome(record)
    };
  }

  const market = record.markets?.[marketKey];
  if (!market || !hasPrediction(market.pick)) return null;
  return {
    odds: finiteOdds(market.odds),
    outcome: resolvedOutcome(market)
  };
}

function outcomeReturn(prediction) {
  if (!prediction || prediction.outcome === 'pending') return { status: 'pending' };
  if (prediction.odds === null) return { status: 'missing-odds' };

  const { outcome, odds } = prediction;
  if (outcome === 'correct' || outcome === 'win') return { status: 'calculated', value: odds };
  if (outcome === 'half-win') return { status: 'calculated', value: 1 + ((odds - 1) * 0.5) };
  if (outcome === 'incorrect' || outcome === 'loss') return { status: 'calculated', value: 0 };
  if (outcome === 'half-loss') return { status: 'calculated', value: 0.5 };
  if (outcome === 'push' || outcome === 'void') return { status: 'calculated', value: 1 };
  return { status: 'pending' };
}

function calculatePercentage(records) {
  let calculated = 0;
  let missingOdds = 0;
  let pending = 0;
  let returned = 0;

  records.filter(isProfitEra).forEach(record => {
    const prediction = predictionFor(record);
    if (!prediction) return;
    const result = outcomeReturn(prediction);
    if (result.status === 'calculated') {
      calculated += 1;
      returned += result.value;
    } else if (result.status === 'missing-odds') {
      missingOdds += 1;
    } else {
      pending += 1;
    }
  });

  return {
    calculated,
    missingOdds,
    pending,
    complete: missingOdds === 0 && calculated > 0,
    value: calculated ? ((returned - calculated) / calculated) * 100 : 0
  };
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function ensureTarget() {
  let target = document.querySelector('#performancePercent');
  if (target) {
    const card = target.closest('.metric');
    const label = card?.querySelector('small');
    if (label) {
      label.removeAttribute('aria-hidden');
      label.textContent = 'Profit %';
    }
    card?.setAttribute('aria-label', 'Profit percentage from 6 August 2026');
    return target;
  }

  const summary = document.querySelector('.summary');
  if (!summary) return null;

  const card = document.createElement('div');
  card.className = 'metric';
  card.setAttribute('aria-label', 'Profit percentage from 6 August 2026');
  card.innerHTML = '<small>Profit %</small><b id="performancePercent">PENDING</b>';
  summary.appendChild(card);
  return card.querySelector('#performancePercent');
}

function renderPercentage() {
  const target = ensureTarget();
  if (!target) return;

  const result = calculatePercentage(loadCumulativeRecords());
  target.textContent = result.complete ? formatPercent(result.value) : result.pending > 0 ? 'PENDING' : '—';
  target.dataset.calculated = String(result.calculated);
  target.dataset.missingOdds = String(result.missingOdds);
  target.dataset.pending = String(result.pending);
  target.dataset.complete = String(result.complete);
  target.dataset.startDate = PROFIT_START_DATE;
  target.title = 'Flat 1-unit calculation starting with predictions dated 6 August 2026.';
  target.style.removeProperty('color');
  if (result.complete && result.value > 0) target.style.color = 'var(--green)';
  if (result.complete && result.value < 0) target.style.color = 'var(--red)';
}

renderPercentage();
window.addEventListener('storage', renderPercentage);
window.addEventListener('nomad-results-updated', renderPercentage);
window.addEventListener('nomad-official-finals-updated', renderPercentage);
window.addEventListener('pageshow', renderPercentage);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) renderPercentage();
});
window.setInterval(renderPercentage, 3000);
