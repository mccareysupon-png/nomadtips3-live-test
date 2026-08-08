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

function applyLiveSummary(summary) {
  const wins = Number(summary.correct || 0);
  const losses = Number(summary.incorrect || 0);
  const accuracy = summary.accuracy == null ? null : Number(summary.accuracy);
  const avgOdds = summary.avgOdds == null ? null : Number(summary.avgOdds);
  if (node('#memberLiveWins')) node('#memberLiveWins').textContent = String(wins);
  if (node('#memberLiveLosses')) node('#memberLiveLosses').textContent = String(losses);
  if (node('#memberLiveAvgOdds')) node('#memberLiveAvgOdds').textContent = Number.isFinite(avgOdds) ? avgOdds.toFixed(2) : '—';
  if (node('#memberLiveWinRate')) node('#memberLiveWinRate').textContent = Number.isFinite(accuracy) ? `${accuracy.toFixed(2)}%` : '—';
}

async function refreshLiveOnlyPerformance() {
  try {
    applyLiveSummary(await requestSummary('LIVE_SIGNAL'));
  } catch (error) {
    console.warn('Member live-only statistics unavailable:', error?.message || error);
  }
}

window.setTimeout(refreshLiveOnlyPerformance, 800);
window.setInterval(refreshLiveOnlyPerformance, REFRESH_MS);
window.addEventListener('pageshow', refreshLiveOnlyPerformance);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshLiveOnlyPerformance();
});
