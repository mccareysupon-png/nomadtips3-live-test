const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const REFRESH_MS = 30_000;

function node(selector) {
  return document.querySelector(selector);
}

async function requestSummary(source) {
  const url = new URL(`${WORKER}/member-stats-summary`);
  url.searchParams.set('member', MEMBER_ID);
  url.searchParams.set('source', source);
  url.searchParams.set('_', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload.summary || {};
}

function summaryValues(summary) {
  const accuracy = summary?.accuracy == null ? null : Number(summary.accuracy);
  const avgOdds = summary?.avgOdds == null ? null : Number(summary.avgOdds);
  return {
    wins: Number(summary?.correct || 0),
    losses: Number(summary?.incorrect || 0),
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
    avgOdds: Number.isFinite(avgOdds) ? avgOdds : null
  };
}

function ensureBallTengPerformance() {
  const view = node('.view[data-view="ball-teng"]');
  if (!view || node('#memberBallStatsWins')) return;
  const anchor = view.querySelector('.isolation-banner');
  const grid = document.createElement('div');
  grid.className = 'metric-grid member-ball-teng-performance';
  grid.setAttribute('aria-label', 'Member Ball Teng performance summary');
  grid.innerHTML = `
    <div class="metric"><small>WIN · บอลเต็ง</small><b id="memberBallStatsWins">—</b><span>เฉพาะ BALL_TENG ของสมาชิก</span></div>
    <div class="metric"><small>LOSS · บอลเต็ง</small><b id="memberBallStatsLosses">—</b><span>เฉพาะ BALL_TENG ของสมาชิก</span></div>
    <div class="metric"><small>AVG ODDS · บอลเต็ง</small><b id="memberBallStatsAvgOdds">—</b><span>ราคาเฉลี่ยเฉพาะบอลเต็งที่ตัดสินแล้ว</span></div>
    <div class="metric"><small>WIN RATE · บอลเต็ง</small><b id="memberBallStatsWinRate">—</b><span>ไม่รวมบอลสด / Pending / Push</span></div>`;
  if (anchor) anchor.insertAdjacentElement('afterend', grid);
  else view.prepend(grid);
}

function applyBallTengSummary(summary) {
  ensureBallTengPerformance();
  const values = summaryValues(summary);
  if (node('#memberBallStatsWins')) node('#memberBallStatsWins').textContent = String(values.wins);
  if (node('#memberBallStatsLosses')) node('#memberBallStatsLosses').textContent = String(values.losses);
  if (node('#memberBallStatsAvgOdds')) node('#memberBallStatsAvgOdds').textContent = values.avgOdds === null ? '—' : values.avgOdds.toFixed(2);
  if (node('#memberBallStatsWinRate')) node('#memberBallStatsWinRate').textContent = values.accuracy === null ? '—' : `${values.accuracy.toFixed(2)}%`;
}

function applyLiveSummary(summary) {
  const values = summaryValues(summary);
  if (node('#memberLiveWins')) node('#memberLiveWins').textContent = String(values.wins);
  if (node('#memberLiveLosses')) node('#memberLiveLosses').textContent = String(values.losses);
  if (node('#memberLiveAvgOdds')) node('#memberLiveAvgOdds').textContent = values.avgOdds === null ? '—' : values.avgOdds.toFixed(2);
  if (node('#memberLiveWinRate')) node('#memberLiveWinRate').textContent = values.accuracy === null ? '—' : `${values.accuracy.toFixed(2)}%`;
}

async function refreshScopedPerformance() {
  const [ball, live] = await Promise.allSettled([
    requestSummary('BALL_TENG'),
    requestSummary('LIVE_SIGNAL')
  ]);
  if (ball.status === 'fulfilled') applyBallTengSummary(ball.value);
  else console.warn('Member Ball Teng statistics unavailable:', ball.reason?.message || ball.reason);
  if (live.status === 'fulfilled') applyLiveSummary(live.value);
  else console.warn('Member live-only statistics unavailable:', live.reason?.message || live.reason);
}

ensureBallTengPerformance();
window.setTimeout(refreshScopedPerformance, 800);
window.setInterval(refreshScopedPerformance, REFRESH_MS);
window.addEventListener('pageshow', refreshScopedPerformance);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshScopedPerformance();
});
