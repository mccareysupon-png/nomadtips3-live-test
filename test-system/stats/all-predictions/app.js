import { loadCumulativeRecords, recordTime } from '../cumulative.js?v=202608051149';

const $ = selector => document.querySelector(selector);
const FLAT_STAKE = 100;
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

function scoreText(record) {
  const home = Number(record.homeScore);
  const away = Number(record.awayScore);
  return Number.isFinite(home) && Number.isFinite(away) ? `${home}–${away}` : '—';
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
        id: `${base.fixtureId}:1x2`,
        market: '1X2',
        pick: record.pickLabel || record.pick,
        odds: finiteOdds(record.odds),
        outcome: String(record.outcome || 'pending').toLowerCase()
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
        id: `${base.fixtureId}:${key}`,
        market,
        pick: value.pick,
        odds: finiteOdds(value.odds),
        outcome: String(value.outcome || value.settlement || 'pending').toLowerCase()
      });
    }
  }

  return rows.sort((a, b) => {
    const time = recordTime(a) - recordTime(b);
    if (time !== 0) return time;
    return (MARKET_ORDER.get(a.market) ?? 99) - (MARKET_ORDER.get(b.market) ?? 99);
  });
}

function flatStakeSettlement(prediction) {
  const outcome = String(prediction.outcome || 'pending').toLowerCase();
  const odds = finiteOdds(prediction.odds);
  if (outcome === 'pending') return { status: 'pending' };
  if (odds === null) return { status: 'missing-odds' };

  let returned = 0;
  if (outcome === 'correct' || outcome === 'win') {
    returned = FLAT_STAKE * odds;
  } else if (outcome === 'half-win') {
    returned = FLAT_STAKE + (FLAT_STAKE * (odds - 1) * 0.5);
  } else if (outcome === 'incorrect' || outcome === 'loss') {
    returned = 0;
  } else if (outcome === 'half-loss') {
    returned = FLAT_STAKE * 0.5;
  } else if (outcome === 'push' || outcome === 'void') {
    returned = FLAT_STAKE;
  } else {
    return { status: 'pending' };
  }

  return {
    status: 'calculated',
    stake: FLAT_STAKE,
    returned,
    profit: returned - FLAT_STAKE
  };
}

function calculateFlatStake(predictions) {
  let calculated = 0;
  let missingOdds = 0;
  let pending = 0;
  let totalStaked = 0;
  let totalReturn = 0;

  for (const prediction of predictions) {
    const settlement = flatStakeSettlement(prediction);
    if (settlement.status === 'calculated') {
      calculated += 1;
      totalStaked += settlement.stake;
      totalReturn += settlement.returned;
    } else if (settlement.status === 'missing-odds') {
      missingOdds += 1;
    } else {
      pending += 1;
    }
  }

  const profit = totalReturn - totalStaked;
  return {
    calculated,
    missingOdds,
    pending,
    totalStaked,
    totalReturn,
    profit,
    roi: totalStaked ? (profit / totalStaked) * 100 : 0
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
    } else if (outcome === 'incorrect' || outcome === 'loss') {
      incorrect += 1;
      decisions += 1;
    } else if (outcome === 'half-loss') {
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
    flatStake: calculateFlatStake(predictions)
  };
}

function marketSummary(predictions, market) {
  const filtered = predictions.filter(item => item.market === market);
  const summary = summarize(filtered);
  return {...summary, market};
}

function formatTHB(value, signed = false) {
  const number = Number(value) || 0;
  const sign = signed && number > 0 ? '+' : '';
  return `${sign}${number.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} THB`;
}

function predictionProfitText(prediction) {
  const settlement = flatStakeSettlement(prediction);
  if (settlement.status === 'pending') return 'Pending';
  if (settlement.status === 'missing-odds') return 'No Odds Data';
  return formatTHB(settlement.profit, true);
}

function render() {
  const predictions = collectPredictions(loadCumulativeRecords());
  const summary = summarize(predictions);
  const flat = summary.flatStake;

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
    ? `Average Odds is calculated from ${summary.recordedOdds} real recorded prices across all predictions. Missing and N/A prices are excluded.`
    : 'No real recorded Odds are available across all predictions yet.';

  $('#flatStake').textContent = `${FLAT_STAKE} THB`;
  $('#calculatedPredictions').textContent = flat.calculated;
  $('#totalStaked').textContent = formatTHB(flat.totalStaked);
  $('#totalReturn').textContent = formatTHB(flat.totalReturn);
  $('#profitLoss').textContent = formatTHB(flat.profit, true);
  $('#roi').textContent = `${flat.roi >= 0 ? '+' : ''}${flat.roi.toFixed(2)}%`;
  $('#profitCoverage').textContent = flat.missingOdds
    ? `Calculated across every settled prediction with real Odds: ${flat.calculated} calculated · ${flat.missingOdds} older settled predictions excluded because no real Odds were recorded · ${flat.pending} pending.`
    : `Calculated across all settled predictions with real Odds: ${flat.calculated} calculated · ${flat.pending} pending.`;

  const links = {
    '1X2': '../',
    'BTTS': '../btts/',
    'Double Chance': '../double-chance/',
    'Asian Handicap': '../asian-handicap/'
  };
  $('#marketBreakdown').innerHTML = [...MARKET_ORDER.keys()].map(market => {
    const item = marketSummary(predictions, market);
    const average = item.averageOdds === null ? 'No Data' : item.averageOdds.toFixed(2);
    const marketProfit = item.flatStake.calculated
      ? `${formatTHB(item.flatStake.profit, true)} · ROI ${item.flatStake.roi >= 0 ? '+' : ''}${item.flatStake.roi.toFixed(2)}%`
      : 'Profit/Loss No Odds Data';
    return `<a class="market-stat market-stat-link" href="${links[market]}">
      <small>${escapeHtml(market)}</small>
      <b>${item.total} Predictions · ${item.settled} Settled</b>
      <span>Correct ${item.correct} · Incorrect ${item.incorrect} · Pending ${item.pending}</span>
      <span class="market-odds-line">Average Odds ${escapeHtml(average)} · ${item.recordedOdds} recorded</span>
      <span class="market-odds-line">Flat 100 P/L ${escapeHtml(marketProfit)}</span>
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
      <td>${escapeHtml(predictionProfitText(item))}</td>
    </tr>`).join('');
}

render();
window.addEventListener('storage', render);
window.addEventListener('nomad-results-updated', render);
window.setInterval(render, 3000);
