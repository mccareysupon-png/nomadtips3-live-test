import { buildSummary, loadRecords, resultText } from '../shared.js?v=202608071505';

const $ = selector => document.querySelector(selector);
const PAGE_SIZE = 4;
const DAY_LABEL = 'DAY 8';
let currentRecords = [];
let currentPage = 0;

const escapeHtml = value => String(value ?? '').replace(/[&<>'\"]/g, char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
})[char]);
const formatOdds = (value, status = '') => {
  if (Number(value) > 0) return Number(value).toFixed(2);
  return ['N/A','UNAVAILABLE'].includes(String(status).toUpperCase()) ? 'N/A' : 'Pending';
};

function formatPosterDate(records) {
  const pickDate = records[0]?.pickDate;
  if (!pickDate) return 'DATE PENDING';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(new Date(`${pickDate}T12:00:00.000Z`)).toUpperCase();
  } catch {
    return String(pickDate).toUpperCase();
  }
}

function formatLocalKickoff(iso) {
  try {
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(new Date(iso));
    return `${time} LOCAL`;
  } catch {
    return 'TIME PENDING';
  }
}

function marketText(label, market) {
  return `${label} ${market?.pick || '—'} · Odds ${formatOdds(market?.odds, market?.oddsStatus)} · Confidence ${Number(market?.confidence || 0)}%`;
}

function shareText(records) {
  const date = formatPosterDate(records);
  const lines = records.flatMap((record, index) => [
    '',
    `${String(index + 1).padStart(2, '0')}. ${record.home} vs ${record.away}`,
    `${record.league} · ${formatLocalKickoff(record.kickoffUtc)}`,
    `MAIN PICK: ${record.pickLabel || record.pick}`,
    `Odds ${formatOdds(record.odds, record.oddsStatus)} · Confidence ${record.confidence}%`,
    marketText('BTTS:', record.markets?.btts),
    marketText('O/U 2.5:', record.markets?.overUnder),
    marketText('Double Chance:', record.markets?.doubleChance),
    marketText('Asian Handicap:', record.markets?.asianHandicap)
  ]);
  return [
    'NOMADTIPS3 · TEST SYSTEM',
    `NOMAD SYSTEM · ${DAY_LABEL} · ${date}`,
    `${records.length} OFFICIAL MATCH ANALYSES`,
    ...lines,
    '',
    'Sports analysis only · nomadtips3.com'
  ].join('\n');
}

function resultLabel(record) {
  const label = resultText(record);
  return label === 'WAITING' ? 'AWAITING RESULTS' : label;
}

function resultClass(record) {
  if (record.outcome === 'correct') return 'correct';
  if (record.outcome === 'incorrect') return 'incorrect';
  if (record.outcome === 'void') return 'void';
  if (record.status === 'MANUAL_RESULT_REQUIRED') return 'manual-required';
  return 'waiting';
}

function summaryLabel(summary) {
  if (!summary.settled) return 'AWAITING RESULTS';
  const parts = [
    `${summary.correct} CORRECT`,
    `${summary.incorrect} INCORRECT`
  ];
  if (summary.voids) parts.push(`${summary.voids} VOID`);
  parts.push(`${summary.accuracy.toFixed(2)}% ACCURACY`);
  return parts.join(' · ');
}

function marketPill(label, market) {
  return `
    <div class="poster-market">
      <small>${escapeHtml(label)}</small>
      <b>${escapeHtml(market?.pick || '—')}</b>
    </div>`;
}

function renderPick(record, absoluteIndex) {
  return `
    <article class="poster-pick ${resultClass(record)}">
      <header class="poster-pick-head">
        <span class="poster-rank">${String(absoluteIndex + 1).padStart(2, '0')}</span>
        <div class="poster-match-meta">
          <b>${escapeHtml(record.league)}</b>
          <small>${escapeHtml(formatLocalKickoff(record.kickoffUtc))}</small>
        </div>
        <span class="poster-result">${escapeHtml(resultLabel(record))}</span>
      </header>

      <div class="poster-matchup">
        <strong>${escapeHtml(record.home)}</strong>
        <span>VS</span>
        <strong>${escapeHtml(record.away)}</strong>
      </div>

      <div class="poster-primary-row">
        <div class="poster-main-pick">
          <small>MAIN PICK</small>
          <b>${escapeHtml(record.pickLabel || record.pick)}</b>
        </div>
        <div class="poster-metrics">
          <div class="poster-metric odds">
            <small>ODDS</small>
            <b>${escapeHtml(formatOdds(record.odds, record.oddsStatus))}</b>
          </div>
          <div class="poster-metric confidence">
            <small>CONFIDENCE</small>
            <b>${Number(record.confidence || 0)}%</b>
          </div>
        </div>
      </div>

      <div class="poster-secondary">
        ${marketPill('BTTS', record.markets?.btts)}
        ${marketPill('O/U 2.5', record.markets?.overUnder)}
        ${marketPill('DOUBLE CHANCE', record.markets?.doubleChance)}
        ${marketPill('ASIAN HANDICAP', record.markets?.asianHandicap)}
      </div>
    </article>`;
}

function renderPoster(records, pageIndex, totalPages, summary) {
  const start = pageIndex * PAGE_SIZE;
  const pageRecords = records.slice(start, start + PAGE_SIZE);
  const date = formatPosterDate(records);
  const matchWord = records.length === 1 ? 'MATCH ANALYSIS' : 'MATCH ANALYSES';

  return `
    <section id="poster" class="poster" aria-label="NOMADTIPS3 analysis poster ${pageIndex + 1} of ${totalPages}">
      <div class="poster-brandbar">
        <span class="poster-logo">nomad<b>tips3</b></span>
        <span class="poster-system">TEST SYSTEM</span>
      </div>

      <div class="poster-head">
        <div class="poster-kicker-row">
          <span class="eyebrow">NOMAD SYSTEM · ${DAY_LABEL}</span>
          <span class="poster-page-label">POSTER ${pageIndex + 1}/${totalPages}</span>
        </div>
        <h1>TODAY’S ANALYSIS</h1>
        <div class="poster-date-row">
          <span>${escapeHtml(date)}</span>
          <b>${records.length} OFFICIAL ${matchWord}</b>
        </div>
      </div>

      <div class="poster-list">
        ${pageRecords.map((record, index) => renderPick(record, start + index)).join('') || '<div class="poster-empty">NO MATCH ANALYSIS AVAILABLE</div>'}
      </div>

      <div class="poster-foot">
        <span>Sports analysis only · nomadtips3.com</span>
        <strong>${escapeHtml(summaryLabel(summary))}</strong>
      </div>
    </section>`;
}

function render() {
  currentRecords = loadRecords();
  const summary = buildSummary(currentRecords);
  const totalPages = Math.max(1, Math.ceil(currentRecords.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages - 1);

  $('#posterStage').innerHTML = renderPoster(currentRecords, currentPage, totalPages, summary);

  const start = currentRecords.length ? currentPage * PAGE_SIZE + 1 : 0;
  const end = Math.min((currentPage + 1) * PAGE_SIZE, currentRecords.length);
  $('#posterPageStatus').textContent = currentRecords.length
    ? `Poster ${currentPage + 1} of ${totalPages} · Matches ${start}–${end}`
    : 'Poster 1 of 1';
  $('#previousPoster').disabled = currentPage === 0;
  $('#nextPoster').disabled = currentPage >= totalPages - 1;
  $('.poster-pagination').classList.toggle('single-page', totalPages === 1);
}

$('#previousPoster').addEventListener('click', () => {
  if (currentPage > 0) {
    currentPage -= 1;
    render();
    window.scrollTo({ top: $('#posterStage').offsetTop - 70, behavior: 'smooth' });
  }
});

$('#nextPoster').addEventListener('click', () => {
  const totalPages = Math.max(1, Math.ceil(currentRecords.length / PAGE_SIZE));
  if (currentPage < totalPages - 1) {
    currentPage += 1;
    render();
    window.scrollTo({ top: $('#posterStage').offsetTop - 70, behavior: 'smooth' });
  }
});

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
    try {
      await navigator.share({ title: 'NOMADTIPS3 Match Analysis', text });
    } catch {}
  } else {
    await navigator.clipboard.writeText(text);
    alert('Analysis text copied.');
  }
});

$('#printButton').addEventListener('click', () => window.print());
render();
window.addEventListener('storage', render);
window.setInterval(render, 3000);
