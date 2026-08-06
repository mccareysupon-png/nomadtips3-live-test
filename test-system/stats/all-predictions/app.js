import { loadCumulativeRecords, recordTime } from '../cumulative.js?v=202608051149';

const $ = selector => document.querySelector(selector);
const EMPTY_PICKS = new Set(['', '—', '-', 'N/A', 'NA', 'NONE', 'NULL']);
const MARKET_ORDER = new Map([
  ['1X2', 0],
  ['BTTS', 1],
  ['Double Chance', 2],
  ['Asian Handicap', 3]
]);

const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);

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

function scoreText(record) {
  const hasHome = record.homeScore !== null && record.homeScore !== '' && Number.isFinite(Number(record.homeScore));
  const hasAway = record.awayScore !== null && record.awayScore !== '' && Number.isFinite(Number(record.awayScore));
  return hasHome && hasAway ? `${Number(record.homeScore)}–${Number(record.awayScore)}` : '—';
}

function resultText(outcome) {
  const key = String(outcome || 'pending').toLowerCase();
  return ({
    correct: 'Correct',
    incorrect: 'Incorrect',
    win: 'Correct',
    'half-win': 'Correct',
    push: 'Push',
    'half-loss': 'Incorrect',
    loss: 'Incorrect',
    void: 'Void',
    pending: 'Pending'
  })[key] || 'Pending';
}

function collectPredictions(records) {
  const rows = [];

  for (const record of records) {
    const base = {
      fixtureId: String(record.fixtureId || ''),
      home: record.home || 'Home',
      away: record.away || 'Away',
      league: record.league || '',
      kickoffUtc: record.kickoffUtc || record.pickDate || null,
      homeScore: record.homeScore,
      awayScore: record.awayScore
    };

    if (hasPrediction(record.pickLabel || record.pick)) {
      rows.push({
        ...base,
        market: '1X2',
        pick: record.pickLabel || record.pick,
        odds: finiteOdds(record.odds),
        outcome: resolvedOutcome(record)
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
      rows.push({
        ...base,
        market,
        pick: value.pick,
        odds: finiteOdds(value.odds),
        outcome: resolvedOutcome(value)
      });
    }
  }

  return rows.sort((a, b) => {
    const time = recordTime(a) - recordTime(b);
    if (time !== 0) return time;
    return (MARKET_ORDER.get(a.market) ?? 99) - (MARKET_ORDER.get(b.market) ?? 99);
  });
}

function outcomeReturn(prediction) {
  const outcome = String(prediction.outcome || 'pending').toLowerCase();
  const odds = finiteOdds(prediction.odds);
  if (outcome === 'pending') return { status: 'pending' };
  if (odds === null) return { status: 'missing-odds' };

  if (outcome === 'correct' || outcome === 'win') return { status: 'calculated', value: odds };
  if (outcome === 'half-win') return { status: 'calculated', value: 1 + ((odds - 1) * 0.5) };
  if (outcome === 'incorrect' || outcome === 'loss') return { status: 'calculated', value: 0 };
  if (outcome === 'half-loss') return { status: 'calculated', value: 0.5 };
  if (outcome === 'push' || outcome === 'void') return { status: 'calculated', value: 1 };
  return { status: 'pending' };
}

function calculatePercentage(predictions) {
  let calculated = 0;
  let missingOdds = 0;
  let pending = 0;
  let returned = 0;

  for (const prediction of predictions) {
    const result = outcomeReturn(prediction);
    if (result.status === 'calculated') {
      calculated += 1;
      returned += result.value;
    } else if (result.status === 'missing-odds') {
      missingOdds += 1;
    } else {
      pending += 1;
    }
  }

  return {
    calculated,
    missingOdds,
    pending,
    value: calculated ? ((returned - calculated) / calculated) * 100 : 0
  };
}

function summarize(predictions) {
  let correct = 0;
  let incorrect = 0;
  let push = 0;
  let voids = 0;
  let pending = 0;
  let weightedPoints = 0;
  let decisions = 0;

  for (const prediction of predictions) {
    const outcome = prediction.outcome;
    if (outcome === 'correct' || outcome === 'win') {
      correct += 1;
      weightedPoints += 1;
      decisions += 1;
    } else if (outcome === 'half-win') {
      correct += 1;
      weightedPoints += 0.5;
      decisions += 1;
    } else if (outcome === 'incorrect' || outcome === 'loss' || outcome === 'half-loss') {
      incorrect += 1;
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
    correct,
    incorrect,
    push,
    voids,
    pending,
    rate: decisions ? (weightedPoints / decisions) * 100 : 0,
    averageOdds,
    recordedOdds: recordedOdds.length,
    percentage: calculatePercentage(predictions)
  };
}

function marketSummary(predictions, market) {
  const filtered = predictions.filter(item => item.market === market);
  return { ...summarize(filtered), market };
}

function formatPercent(value) {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function signedStyle(value) {
  const number = Number(value) || 0;
  if (number > 0) return 'color:var(--green)';
  if (number < 0) return 'color:var(--red)';
  return '';
}

function render() {
  const predictions = collectPredictions(loadCumulativeRecords());
  const summary = summarize(predictions);

  $('#total').textContent = summary.total;
  $('#settled').textContent = summary.settled;
  $('#correct').textContent = summary.correct;
  $('#incorrect').textContent = summary.incorrect;
  $('#push').textContent = summary.push;
  $('#void').textContent = summary.voids;
  $('#pending').textContent = summary.pending;
  $('#rate').textContent = `${summary.rate.toFixed(2)}%`;
  $('#averageOdds').textContent = summary.averageOdds === null ? 'No Data' : summary.averageOdds.toFixed(2);
  $('#oddsNote').textContent = summary.recordedOdds
    ? `${summary.recordedOdds} recorded Odds · ${summary.percentage.missingOdds} missing Odds · ${summary.percentage.pending} pending`
    : 'No recorded Odds data';

  const performancePercent = $('#performancePercent');
  performancePercent.textContent = formatPercent(summary.percentage.value);
  performancePercent.dataset.calculated = String(summary.percentage.calculated);
  performancePercent.dataset.missingOdds = String(summary.percentage.missingOdds);
  performancePercent.dataset.pending = String(summary.percentage.pending);
  performancePercent.style.cssText = signedStyle(summary.percentage.value);

  const links = {
    '1X2': '../',
    'BTTS': '../btts/',
    'Double Chance': '../double-chance/',
    'Asian Handicap': '../asian-handicap/'
  };

  $('#marketBreakdown').innerHTML = [...MARKET_ORDER.keys()].map(market => {
    const item = marketSummary(predictions, market);
    const average = item.averageOdds === null ? 'No Data' : item.averageOdds.toFixed(2);
    return `<a class="market-stat market-stat-link" href="${links[market]}">
      <small>${escapeHtml(market)}</small>
      <b>${item.total} Predictions · ${item.settled} Settled</b>
      <span>Correct ${item.correct} · Incorrect ${item.incorrect} · Pending ${item.pending}</span>
      <span class="market-odds-line">Average Odds ${escapeHtml(average)} · ${item.recordedOdds} recorded</span>
      <strong class="market-odds-line" style="${signedStyle(item.percentage.value)}">${escapeHtml(formatPercent(item.percentage.value))}</strong>
    </a>`;
  }).join('');

  $('#historyRows').innerHTML = [...predictions].reverse().map((item, index) => `
    <tr>
      <td>${predictions.length - index}</td>
      <td><b>${escapeHtml(item.home)}</b> vs ${escapeHtml(item.away)}<br><small>${escapeHtml(item.league)}</small></td>
      <td>${escapeHtml(item.market)}</td>
      <td><b>${escapeHtml(item.pick)}</b></td>
      <td>${item.odds === null ? 'No Odds Data' : item.odds.toFixed(2)}</td>
      <td>${escapeHtml(scoreText(item))}</td>
      <td>${escapeHtml(resultText(item.outcome))}</td>
    </tr>`).join('');
}

render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.addEventListener('nomad-official-finals-updated', render);
window.addEventListener('pageshow', render);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) render();
});
window.setInterval(render, 3000);
