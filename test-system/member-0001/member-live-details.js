const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const $ = selector => document.querySelector(selector);
const LIVE_FRESH_MS = 3 * 60_000;
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

function fmtSigned(value) {
  const n = numeric(value);
  if (n === null) return 'N/A';
  if (Math.abs(n) < 0.0001) return '0';
  return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function fmtRange(min, max, suffix = '') {
  const low = numeric(min);
  const high = numeric(max);
  if (low === null && high === null) return 'ไม่จำกัด';
  if (low !== null && high === null) return `≥ ${low}${suffix}`;
  if (low === null) return `≤ ${high}${suffix}`;
  return `${low}${suffix} – ${high}${suffix}`;
}

function formatTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    timeZone: 'Asia/Bangkok'
  }).format(d);
}

function timeAge(value, now = Date.now()) {
  if (!value) return null;
  const n = typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(n)) return null;
  return Math.max(0, now - n);
}

function ageText(ms) {
  if (ms === null) return 'ไม่ทราบอายุข้อมูล';
  if (ms < 60_000) return `${Math.max(0, Math.round(ms / 1000))} วินาทีที่แล้ว`;
  return `${Math.max(1, Math.round(ms / 60_000))} นาทีที่แล้ว`;
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

function ensureFreshnessBanner() {
  const liveView = $('.view[data-view="live"]');
  if (!liveView || $('#memberLiveFreshness')) return;
  const engineGrid = liveView.querySelector('.metric-grid');
  if (!engineGrid) return;
  const banner = document.createElement('div');
  banner.id = 'memberLiveFreshness';
  banner.className = 'member-live-freshness waiting';
  banner.innerHTML = '<strong>กำลังตรวจสอบความสดของข้อมูล…</strong><span>ยังไม่ยืนยันว่าเป็นข้อมูลสดล่าสุด</span>';
  engineGrid.insertAdjacentElement('afterend', banner);
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

function overallFreshness(payload) {
  const status = String(payload?.engine?.status || '').toUpperCase();
  const lastScanAt = payload?.engine?.lastScanAt || null;
  const age = timeAge(lastScanAt);
  if (status === 'BACKGROUND_ERROR') {
    return { kind: 'error', label: 'BACKGROUND ERROR', live: false, age, lastScanAt, detail: payload?.engine?.error || 'รอบสแกนล่าสุดทำงานผิดพลาด' };
  }
  if (!lastScanAt || status === 'WAITING_FOR_BACKGROUND_SCAN') {
    return { kind: 'waiting', label: 'WAITING', live: false, age, lastScanAt, detail: 'ยังไม่มีรอบสแกนที่ยืนยันความสดของข้อมูล' };
  }
  if (status !== 'BACKGROUND_ACTIVE' || age === null || age > LIVE_FRESH_MS) {
    return { kind: 'stale', label: 'STALE DATA', live: false, age, lastScanAt, detail: 'ข้อมูลเกินช่วงความสด 3 นาที จึงไม่แสดงเป็น Live' };
  }
  return { kind: 'live', label: 'LIVE', live: true, age, lastScanAt, detail: 'Member Live Engine อัปเดตอยู่ในช่วงความสดที่กำหนด' };
}

function rowFreshness(row, overall) {
  const age = timeAge(numeric(row?.updated_at));
  if (!overall.live) return { ...overall, rowAge: age };
  if (age === null || age > LIVE_FRESH_MS) {
    return { kind: 'stale', label: 'STALE DATA', live: false, rowAge: age, detail: 'ข้อมูลของคู่นี้ไม่ได้รับการอัปเดตภายใน 3 นาที' };
  }
  return { kind: 'live', label: 'LIVE DATA', live: true, rowAge: age, detail: 'ข้อมูลคู่นี้อัปเดตล่าสุดภายใน 3 นาที' };
}

function updateFreshnessBanner(payload) {
  ensureFreshnessBanner();
  const state = overallFreshness(payload);
  const banner = $('#memberLiveFreshness');
  if (banner) {
    banner.className = `member-live-freshness ${state.kind}`;
    const scanText = state.lastScanAt ? `Last scan ${formatTime(state.lastScanAt)} · ${ageText(state.age)}` : 'ยังไม่มี Last scan';
    banner.innerHTML = `<strong>${escapeHtml(state.label)}</strong><span>${escapeHtml(scanText)} · ${escapeHtml(state.detail)}</span>`;
  }
  const online = $('#liveOnline');
  const generated = $('#liveGenerated');
  if (online) {
    online.textContent = state.label;
    online.className = state.live ? 'good-text' : state.kind === 'error' ? 'bad-text' : '';
  }
  if (generated) generated.textContent = state.lastScanAt ? `Last update ${formatTime(state.lastScanAt)} · ${ageText(state.age)}` : 'ยังไม่มีข้อมูลสแกนสด';
  return state;
}

function markLiveCardsFreshness(payload) {
  const rows = Array.isArray(payload?.active) ? payload.active : [];
  const overall = overallFreshness(payload);
  const cards = [...document.querySelectorAll('#liveGrid .live-card')];
  cards.forEach((card, index) => {
    const row = rows[index];
    if (!row) return;
    const state = rowFreshness(row, overall);
    card.classList.toggle('data-live', state.live);
    card.classList.toggle('data-stale', !state.live);
    card.classList.toggle('data-error', state.kind === 'error');
    let chip = card.querySelector('.member-live-fresh-chip');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'member-live-fresh-chip';
      card.querySelector('.live-meta')?.appendChild(chip);
    }
    if (chip) {
      chip.className = `member-live-fresh-chip ${state.kind}`;
      chip.textContent = `${state.label} · ${ageText(state.rowAge ?? overall.age)}`;
      chip.title = state.detail || '';
    }
    const primaryState = card.querySelector('.live-meta span:not(.member-live-fresh-chip):last-of-type');
    if (primaryState && Number(row.triggered) !== 1) {
      primaryState.textContent = state.live ? 'MONITORING' : state.kind === 'error' ? 'BACKGROUND ERROR' : 'STALE DATA';
      primaryState.classList.toggle('signal', state.live);
    }
  });
}

function setUnavailable(error) {
  ensureFreshnessBanner();
  const banner = $('#memberLiveFreshness');
  if (banner) {
    banner.className = 'member-live-freshness error';
    banner.innerHTML = `<strong>LIVE STATUS UNAVAILABLE</strong><span>${escapeHtml(error?.message || 'ไม่สามารถตรวจสอบสถานะสดได้')} · การ์ดเดิมจะถูกถือเป็นข้อมูลเก่า</span>`;
  }
  const online = $('#liveOnline');
  if (online) { online.textContent = 'ERROR'; online.className = 'bad-text'; }
  document.querySelectorAll('#liveGrid .live-card').forEach(card => {
    card.classList.remove('data-live');
    card.classList.add('data-stale', 'data-error');
  });
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

function conditionChip(label, current, requirement, state) {
  return `<div class="member-condition-chip ${state}"><small>${escapeHtml(label)}</small><b>${escapeHtml(current)}</b><span>${escapeHtml(requirement)}</span></div>`;
}

function decisionState(row, config, payload, summaryCounts) {
  if (Number(row?.triggered) === 1) {
    return { kind: 'triggered', label: 'SIGNAL TRIGGERED', text: 'ผ่านเงื่อนไขครบและออก Signal แล้ว' };
  }
  const dailySignals = Number(summaryCounts?.dailySignals || 0);
  const limit = Number(config?.maxSignalsPerDay || 0);
  if (config?.signalLimitEnabled && limit > 0 && dailySignals >= limit) {
    return { kind: 'limit', label: 'QUOTA REACHED', text: `ครบโควต้า Signal วันนี้ ${dailySignals}/${limit}` };
  }
  const momentum = numeric(row?.momentum);
  const momentumMin = numeric(config?.momentumMin);
  const evidence = numeric(payload?.evidence) || 0;
  if (momentum === null) {
    return { kind: 'waiting', label: 'WAIT MOMENTUM', text: 'กำลังรอข้อมูลรอบก่อนหน้าเพื่อคำนวณ Momentum' };
  }
  if (momentumMin !== null && momentum < momentumMin) {
    return { kind: 'waiting', label: 'WAIT MOMENTUM', text: `Momentum ${Math.round(momentum)}% ยังต่ำกว่า ${Math.round(momentumMin)}%` };
  }
  if (evidence < 1) {
    return { kind: 'waiting', label: 'WAIT ATTACK EVIDENCE', text: 'Momentum ผ่าน แต่ยังรอหลักฐานการบุกเพิ่มในรอบล่าสุด' };
  }
  const streak = Number(row?.streak || 0);
  const rounds = Math.max(1, Number(config?.confirmationRounds || 1));
  if (streak < rounds) {
    return { kind: 'confirming', label: `CONFIRMING ${streak}/${rounds}`, text: 'ผ่านรอบนี้แล้ว กำลังรอยืนยันต่อเนื่องตามจำนวนรอบที่ตั้งไว้' };
  }
  return { kind: 'ready', label: 'READY', text: 'เงื่อนไขพร้อมออก Signal ในรอบประมวลผล' };
}

function buildDecisionPanel(row, config, summaryCounts) {
  const payload = row?.payload || {};
  const markets = payload?.markets || {};
  const stats = payload?.stats || {};
  const selectedTeam = row?.selected_team || 'Selected team';
  const opponentTeam = row?.opponent || 'Opponent';
  const selectedSide = String(row?.selected_side || '—').toUpperCase();
  const actualHome = payload?.actualHome || (selectedSide === 'HOME' ? selectedTeam : opponentTeam);
  const actualAway = payload?.actualAway || (selectedSide === 'AWAY' ? selectedTeam : opponentTeam);
  const actualScore = payload?.actualScore || null;
  const market = String(payload?.selectedMarket || config?.market || 'LIVE').toUpperCase();
  const marketName = market === 'AH' ? 'Asian Handicap' : market === 'WIN' ? 'Match Winner' : market;
  const selectedOdds = numeric(markets?.selectedOdds);
  const ahLine = numeric(markets?.homeAh);
  const minute = numeric(row?.minute);
  const momentum = numeric(row?.momentum);
  const evidence = numeric(payload?.evidence) || 0;
  const selectedRed = readStat(stats, 'red_cards', 'home') || 0;
  const opponentRed = readStat(stats, 'red_cards', 'away') || 0;
  const scoreGap = Math.abs(Number(row?.selected_score || 0) - Number(row?.opponent_score || 0));
  const minutePass = minute !== null && minute >= Number(config?.minuteMin || 0) && minute <= Number(config?.minuteMax || 120);
  const oddsPass = selectedOdds !== null && selectedOdds >= Number(config?.oddsMin || 0) && (config?.oddsMax == null || selectedOdds <= Number(config.oddsMax));
  const ahPass = ahLine !== null && ahLine >= Number(config?.ahMin ?? -5) && (config?.ahMax == null || ahLine <= Number(config.ahMax));
  const gapPass = !config?.goalGapLimited || scoreGap <= Number(config?.maxGoalGap || 0);
  const redPass = selectedRed <= opponentRed;
  const momentumPass = momentum !== null && momentum >= Number(config?.momentumMin || 0) && evidence >= 1;
  const rounds = Math.max(1, Number(config?.confirmationRounds || 1));
  const streak = Number(row?.streak || 0);
  const streakPass = streak >= rounds;
  const state = decisionState(row, config || {}, payload, summaryCounts || {});
  const marketTicket = market === 'AH'
    ? `${marketName} ${fmtSigned(ahLine)} @ ${fmtOdds(selectedOdds)}`
    : `${marketName} @ ${fmtOdds(selectedOdds)}`;
  const actualScoreText = actualScore && numeric(actualScore.home) !== null && numeric(actualScore.away) !== null
    ? `${actualScore.home}–${actualScore.away}`
    : '—';

  return `<section class="member-signal-decision ${state.kind}">
    <div class="member-signal-title">
      <div><small>SIGNAL DECISION</small><strong>${escapeHtml(selectedTeam)}</strong><span class="member-side-badge">${escapeHtml(selectedSide)}</span></div>
      <div class="member-signal-status"><b>${escapeHtml(state.label)}</b><span>${escapeHtml(state.text)}</span></div>
    </div>
    <div class="member-ticket-grid">
      <div><small>ทีมที่ระบบเลือก</small><b>${escapeHtml(selectedTeam)}</b><span>${escapeHtml(selectedSide)} · คู่แข่ง ${escapeHtml(opponentTeam)}</span></div>
      <div><small>คู่แข่งขันจริง</small><b>${escapeHtml(actualHome)} vs ${escapeHtml(actualAway)}</b><span>สกอร์จริง ${escapeHtml(actualScoreText)}</span></div>
      <div class="price"><small>ตลาด / ราคา</small><b>${escapeHtml(marketTicket)}</b><span>ราคาสดที่ใช้ตรวจเงื่อนไข</span></div>
      <div><small>สกอร์มุมมองทีมที่เลือก</small><b>${escapeHtml(row?.selected_score)}–${escapeHtml(row?.opponent_score)}</b><span>ผลต่าง ${escapeHtml(scoreGap)} ประตู</span></div>
    </div>
    <div class="member-condition-grid">
      ${conditionChip('นาที', minute === null ? 'N/A' : `${Math.round(minute)}′`, `ต้อง ${config?.minuteMin ?? '—'}–${config?.minuteMax ?? '—'}′`, minutePass ? 'pass' : 'fail')}
      ${conditionChip('Odds', fmtOdds(selectedOdds), `ต้อง ${fmtRange(config?.oddsMin, config?.oddsMax)}`, oddsPass ? 'pass' : 'fail')}
      ${conditionChip('AH Line', fmtSigned(ahLine), `ต้อง ${fmtRange(config?.ahMin, config?.ahMax)}`, ahPass ? 'pass' : 'fail')}
      ${conditionChip('Momentum', momentum === null ? 'รอข้อมูล' : `${Math.round(momentum)}%`, `ต้อง ≥ ${config?.momentumMin ?? '—'}% · evidence ${evidence.toFixed(0)}`, momentumPass ? 'pass' : 'wait')}
      ${conditionChip('Score Gap', `${scoreGap} ลูก`, config?.goalGapLimited ? `ต้อง ≤ ${config?.maxGoalGap ?? '—'}` : 'ไม่จำกัด', gapPass ? 'pass' : 'fail')}
      ${conditionChip('Red Card', `${selectedRed} : ${opponentRed}`, 'ทีมที่เลือกต้องไม่มากกว่าคู่แข่ง', redPass ? 'pass' : 'fail')}
      ${conditionChip('Confirmation', `${streak}/${rounds}`, `ต้องครบ ${rounds} รอบ`, streakPass ? 'pass' : 'wait')}
      ${conditionChip('Base Candidate', 'ผ่าน', 'นาที + สถิติ + ตลาด + ราคา + เงื่อนไขพื้นฐาน', 'pass')}
    </div>
  </section>`;
}

function buildDetails(row, config, summaryCounts) {
  const payload = row?.payload || {};
  const stats = payload.stats || {};
  const selectedTeam = row.selected_team || 'Selected team';
  const opponentTeam = row.opponent || 'Opponent';
  const selectedOdds = payload?.markets?.selectedOdds;
  const attack = attackBalance(stats, row.momentum);
  const defense = defensiveBalance(stats);
  const statRows = STAT_ROWS.map(([key, label]) => statRowHtml(key, label, stats)).join('');
  const market = payload?.selectedMarket || payload?.market || config?.market || 'LIVE';
  return `${buildDecisionPanel(row, config || {}, summaryCounts || {})}<section class="member-live-details">
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
    <p class="member-live-source-note">Base Candidate = ผ่านเงื่อนไขขั้นต้นแล้ว · Signal จะออกเมื่อ Momentum / attack evidence / confirmation rounds และโควต้าผ่านครบ · ใช้ข้อมูลชุดเดียวกับ Member Live Engine</p>
  </section>`;
}

function enhanceLiveCards(payload, force = false) {
  latestLivePayload = payload;
  const rows = Array.isArray(payload?.active) ? payload.active : [];
  const config = payload?.config || {};
  const summaryCounts = payload?.counts || {};
  const cards = [...document.querySelectorAll('#liveGrid .live-card')];
  cards.forEach((card, index) => {
    const row = rows[index];
    if (!row) return;
    const existingDecision = card.querySelector('.member-signal-decision');
    const existingDetails = card.querySelector('.member-live-details');
    if ((existingDecision || existingDetails) && !force) return;
    existingDecision?.remove();
    existingDetails?.remove();
    card.insertAdjacentHTML('beforeend', buildDetails(row, config, summaryCounts));
  });
  updateFreshnessBanner(payload);
  markLiveCardsFreshness(payload);
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
  else setUnavailable(liveResult.reason);
  if (statsResult.status === 'fulfilled') updatePerformanceSummary(statsResult.value);
}

ensurePerformanceSummary();
ensureFreshnessBanner();
watchLiveGrid();
window.setTimeout(refreshMemberLiveDetails, 250);
window.setInterval(refreshMemberLiveDetails, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshMemberLiveDetails();
});
