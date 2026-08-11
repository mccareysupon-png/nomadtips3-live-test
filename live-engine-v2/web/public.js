const apiBase = document.body.dataset.apiBase || '';
const stateUrl = `${apiBase}/v2/state`;

const $ = id => document.getElementById(id);

function text(id, value) {
  const node = $(id);
  if (node) node.textContent = value;
}

function timeAgo(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function row(item) {
  const home = item.home || 'Home';
  const away = item.away || 'Away';
  const minute = item.minute == null ? '—' : `${item.minute}'`;
  const score = `${item.home_score ?? '—'}–${item.away_score ?? '—'}`;
  const meta = [item.league, item.country].filter(Boolean).join(' · ') || 'Live Football';
  return `
    <div class="row">
      <div class="match">
        <div class="match-name">${escapeHtml(home)} <span class="status">vs</span> ${escapeHtml(away)}</div>
        <div class="match-meta">${escapeHtml(meta)}</div>
      </div>
      <div class="numeric">${escapeHtml(minute)}</div>
      <div class="score numeric">${escapeHtml(score)}</div>
      <div class="status good">${escapeHtml(item.status || 'LIVE')}</div>
    </div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderRows(id, items, emptyText) {
  const node = $(id);
  if (!node) return;
  node.innerHTML = items.length
    ? items.map(row).join('')
    : `<div class="empty">${escapeHtml(emptyText)}</div>`;
}

function render(state) {
  const payload = state?.payload || {};
  const fixtures = Array.isArray(payload.fixtures) ? payload.fixtures : [];
  const candidates = Array.isArray(payload.preliminary_candidates) ? payload.preliminary_candidates : [];
  const generatedAt = state?.generatedAt || payload.generated_at;
  const ageMs = Number.isFinite(Date.parse(generatedAt || '')) ? Date.now() - Date.parse(generatedAt) : Infinity;
  const online = ageMs < 120_000;

  text('liveCount', state?.liveCount ?? payload.live_count ?? 0);
  text('candidateCount', state?.candidateCount ?? payload.preliminary_candidate_count ?? 0);
  text('statsCount', state?.statisticsFixtureCount ?? payload.statistics_fixture_count ?? 0);
  text('lastUpdate', timeAgo(generatedAt));
  text('freshness', online ? 'Fresh shared state' : 'State is stale');
  text('fixtureNote', `${fixtures.length} fixtures`);
  text('onlineText', online ? 'Online' : 'Stale');
  $('onlineDot')?.classList.toggle('online', online);

  renderRows('candidateRows', candidates, 'No candidate currently matches the preliminary filter.');
  renderRows('fixtureRows', fixtures, 'No live fixtures currently available.');
}

async function refresh() {
  try {
    const response = await fetch(stateUrl, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);
    if (!data.state) {
      text('onlineText', 'Waiting');
      return;
    }
    render(data.state);
  } catch (error) {
    text('onlineText', 'Unavailable');
    text('freshness', error.message || 'State unavailable');
    $('onlineDot')?.classList.remove('online');
  }
}

refresh();
setInterval(refresh, 15_000);
