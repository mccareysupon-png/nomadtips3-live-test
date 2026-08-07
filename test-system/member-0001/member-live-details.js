const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const $ = selector => document.querySelector(selector);
let latestLivePayload = null;

const STAT_ROWS = [
  ['attacks', 'Attacks'],
  ['dangerous_attacks', 'Dangerous Attacks'],
  ['possession', 'Possession'],
  ['shots', 'Shots'],
  ['shots_on_target', 'Shots on Target'],
  ['corners', 'Corners'],
  ['red_cards', 'Red Cards']
];
const ATTACK_WEIGHTS = {
  attacks: 0.16,
  dangerous_attacks: 0.52,
  shots: 2,
  shots_on_target: 4,
  corners: 1.25,
  possession: 0.07
};

function escapeHtml(value) {
  return String(value ?? '—').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function numeric(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtStat(key, value) {
  const n = numeric(value);
  if (n === null) return 'N/A';
  if (key === 'possession') return `${Math.round(n)}%`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtOdds(value) {
  const n = numeric(value);
  return n !== null && n > 0 ? n.toFixed(2) : 'N/A';
}

async function requestJson(path) {
  const url = `${WORKER}${path}?member=${encodeURIComponent(MEMBER_ID)}&_=${Date.now()}`;
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload;
}

function ensurePerformanceSummary() {
  const liveView = $('.view[data-view="live"]');
  if (!liveView || $('#memberLiveWins')) return;
  const engineGrid = liveView.querySelector('.metric-grid');
  if (!engineGrid) return;
  const grid = document.createElement('div');
  grid.className = 'metric-grid member-live-performance';
  grid.setAttribute('aria-label', 'Member live performance summary');
  grid.innerHTML = `
    <div class="metric"><small>WIN</small><b id="memberLiveWins">—</b><span>ผลบวกที่ตัดสินแล้วของสมาชิก</span></div>
    <div class="metric"><small>LOSS</small><b id="memberLiveLosses">—</b><span>ผลลบที่ตัดสินแล้วของสมาชิก</span></div>
    <div class="metric"><small>AVG ODDS</small><b id="memberLiveAvgOdds">—</b><span>ราคาเฉลี่ยเฉพาะรายการที่มีผลตัดสิน</span></div>
    <div class="metric"><small>WIN RATE</small><b id="memberLiveWinRate">—</b><span>Win ÷ (Win + Loss) · ไม่รวม Pending/Push</span></div>`;
  engineGrid.insertAdjacentElement('afterend', grid);
}

function updatePerformanceSummary(payload) {
  ensurePerformanceSummary();
  const records = Array.isArray(payload?.records) ? payload.records : [];
  const winOutcomes = new Set(['CORRECT', 'WIN', 'HALF-WIN']);
  const lossOutcomes = new Set(['INCORRECT', 'LOSS', 'HALF-LOSS']);
  const wins = records.filter(row => winOutcomes.has(String(row.outcome || '').toUpperCase()));
  const losses = records.filter(row => lossOutcomes.has(String(row.outcome || '').toUpperCase()));
  const decisions = [...wins, ...losses];
  const priced = decisions.map(row => numeric(row.odds)).filter(value => value !== null && value > 0);
  const avgOdds = priced.length ? priced.reduce((sum, value) => sum + value, 0) / priced.length : null;
  const decisionCount = wins.length + losses.length;
  const winRate = decisionCount ? wins.length / decisionCount * 100 : null;
  $('#memberLiveWins').textContent = wins.length;
  $('#memberLiveLosses').textContent = losses.length;
  $('#memberLiveAvgOdds').textContent = avgOdds === null ? '—' : avgOdds.toFixed(2);
  $('#memberLiveWinRate').textContent = winRate === null ? '—' : `${winRate.toFixed(2)}%`;
}

function readStat(stats, key, side) {
  return numeric(stats?.[key]?.[side]);
}

function weightedAttack(stats, side) {
  let score = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(ATTACK_WEIGHTS)) {
    const value = readStat(stats, key, side);
    if (value === null) continue;
    score += Math.max(0, value) * weight;
    used += weight;
  }
  return used ? score : null;
}

function attackBalance(stats, fallbackMomentum) {
  const selected = weightedAttack(stats, 'home');
  const opponent = weightedAttack(stats, 'away');
  if (selected !== null || opponent !== null) {
    const total = Math.max(0, selected || 0) + Math.max(0, opponent || 0);
    if (total > 0) return clamp((Math.max(0, selected || 0) / total) * 100, 0, 100);
  }
  const fallback = numeric(fallbackMomentum);
  return fallback === null ? null : clamp(fallback, 0, 100);
}

function defensiveBalance(stats) {
  const dangerKeys = ['dangerous_attacks', 'shots', 'shots_on_target', 'corners'];
  const dangerWeights = { dangerous_attacks: 0.52, shots: 2, shots_on_target: 4, corners: 1.25 };
  const pressure = side => dangerKeys.reduce((sum, key) => {
    const value = readStat(stats, key, side);
    return sum + Math.max(0, value || 0) * dangerWeights[key];
  }, 0);
  const selectedPressureConceded = pressure('away');
  const opponentPressureConceded = pressure('home');
  if (selectedPressureConceded === 0 && opponentPressureConceded === 0) return null;
  const selectedResistance = 1 / (1 + selectedPressureConceded);
  const opponentResistance = 1 / (1 + opponentPressureConceded);
  return clamp(selectedResistance / (selectedResistance + opponentResistance) * 100, 0, 100);
}

function statRowHtml(key, label, stats) {
  const selected = readStat(stats, key, 'home');
  const opponent = readStat(stats, key, 'away');
  const total = Math.max(0, selected || 0) + Math.max(0, opponent || 0);
  const selectedShare = selected === null && opponent === null ? null : total > 0 ? clamp((Math.max(0, selected || 0) / total) * 100, 0, 100) : 50;
  return `<div class="member-live-stat-row">
    <div class="member-live-stat-label">${escapeHtml(label)}</div>
    <div class="member-live-stat-values"><b>${escapeHtml(fmtStat(key, selected))}</b><span>${escapeHtml(fmtStat(key, opponent))}</span></div>
    <div class="member-live-stat-track ${selectedShare === null ? 'no-data' : ''}"><i style="width:${selectedShare === null ? 0 : selectedShare.toFixed(1)}%"></i></div>
  </div>`;
}

function balanceHtml(label, value, selectedTeam, opponentTeam, note) {
  const display = value === null ? '—' : `${Math.round(value)}%`;
  const width = value === null ? 0 : value;
  return `<div class="member-balance-card">
    <div class="member-balance-head"><span>${escapeHtml(label)}</span><b>${escapeHtml(display)}</b></div>
    <div class="member-balance-track"><i style="width:${width.toFixed(1)}%"></i></div>
    <div class="member-balance-teams"><strong>${escapeHtml(selectedTeam)}</strong><span>${escapeHtml(opponentTeam)}</span></div>
    <small>${escapeHtml(note)}</small>
  </div>`;
}

function buildDetails(row) {
  const payload = row?.payload || {};
  const stats = payload.stats || {};
  const selectedTeam = row.selected_team || 'Selected team';
  const opponentTeam = row.opponent || 'Opponent';
  const selectedOdds = payload?.markets?.selectedOdds;
  const attack = attackBalance(stats, row.momentum);
  const defense = defensiveBalance(stats);
  const statRows = STAT_ROWS.map(([key, label]) => statRowHtml(key, label, stats)).join('');
  const market = payload?.selectedMarket || payload?.market || 'LIVE';
  return `<section class="member-live-details">
    <div class="member-live-detail-head">
      <div><small>SELECTED TEAM · LIVE DATA</small><strong>${escapeHtml(selectedTeam)}</strong></div>
      <div class="member-live-price"><small>${escapeHtml(market)} ODDS</small><b>${escapeHtml(fmtOdds(selectedOdds))}</b></div>
    </div>
    <div class="member-live-balance-grid">
      ${balanceHtml('การบุก · Attack Balance', attack, selectedTeam, opponentTeam, 'คำนวณจาก Attacks / Dangerous / Shots / SOT / Corners / Possession')}
      ${balanceHtml('การรับ · Defense Balance', defense, selectedTeam, opponentTeam, 'ประเมินจากแรงกดดันที่รับ: Dangerous / Shots / SOT / Corners')}
    </div>
    <div class="member-live-stat-table">
      <div class="member-live-stat-title"><span>LIVE STATISTICS</span><div><b>${escapeHtml(selectedTeam)}</b><i>vs</i><em>${escapeHtml(opponentTeam)}</em></div></div>
      ${statRows}
    </div>
    <p class="member-live-source-note">ใช้สถิติชุดเดียวกับ Member Live Engine · ไม่เรียก API-FOOTBALL เพิ่มเพื่อวาดส่วนนี้</p>
  </section>`;
}

function enhanceLiveCards(payload, force = false) {
  latestLivePayload = payload;
  const rows = Array.isArray(payload?.active) ? payload.active : [];
  const cards = [...document.querySelectorAll('#liveGrid .live-card')];
  cards.forEach((card, index) => {
    const row = rows[index];
    if (!row) return;
    const existing = card.querySelector('.member-live-details');
    if (existing && !force) return;
    if (existing) existing.remove();
    card.insertAdjacentHTML('beforeend', buildDetails(row));
  });
}

function watchLiveGrid() {
  const grid = $('#liveGrid');
  if (!grid) return;
  const observer = new MutationObserver(() => {
    if (latestLivePayload) enhanceLiveCards(latestLivePayload, false);
  });
  observer.observe(grid, { childList: true, subtree: false });
}

async function refreshMemberLiveDetails() {
  const [liveResult, statsResult] = await Promise.allSettled([
    requestJson('/member-live-status'),
    requestJson('/member-stats')
  ]);
  if (liveResult.status === 'fulfilled') enhanceLiveCards(liveResult.value, true);
  if (statsResult.status === 'fulfilled') updatePerformanceSummary(statsResult.value);
}

ensurePerformanceSummary();
watchLiveGrid();
window.setTimeout(refreshMemberLiveDetails, 250);
window.setInterval(refreshMemberLiveDetails, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshMemberLiveDetails();
});
