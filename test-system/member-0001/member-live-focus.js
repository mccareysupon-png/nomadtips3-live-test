const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const $ = selector => document.querySelector(selector);

function esc(value) {
  return String(value ?? '—').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

function num(value) {
  const parsed = Number(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function odds(value) {
  const n = num(value);
  return n !== null && n > 0 ? n.toFixed(2) : 'N/A';
}

function signed(value) {
  const n = num(value);
  if (n === null) return 'N/A';
  if (Math.abs(n) < 0.0001) return '0';
  return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n : n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`;
}

function marketTicket(row, config) {
  const payload = row?.payload || {};
  const markets = payload?.markets || {};
  const market = String(payload?.selectedMarket || config?.market || 'LIVE').toUpperCase();
  const price = odds(markets.selectedOdds);
  if (market === 'AH') return `AH ${signed(markets.homeAh)} @ ${price}`;
  if (market === 'WIN') return `WIN @ ${price}`;
  return `${market} @ ${price}`;
}

function actualMatch(row) {
  const payload = row?.payload || {};
  const side = String(row?.selected_side || '').toUpperCase();
  const selected = row?.selected_team || 'Selected';
  const opponent = row?.opponent || 'Opponent';
  const home = payload.actualHome || (side === 'HOME' ? selected : opponent);
  const away = payload.actualAway || (side === 'AWAY' ? selected : opponent);
  const actual = payload.actualScore || {};
  let homeScore = num(actual.home);
  let awayScore = num(actual.away);
  if (homeScore === null || awayScore === null) {
    if (side === 'AWAY') {
      homeScore = num(row?.opponent_score);
      awayScore = num(row?.selected_score);
    } else {
      homeScore = num(row?.selected_score);
      awayScore = num(row?.opponent_score);
    }
  }
  return { home, away, homeScore, awayScore };
}

function ensureStyles() {
  if ($('#memberLiveFocusStyles')) return;
  const style = document.createElement('style');
  style.id = 'memberLiveFocusStyles';
  style.textContent = `
    .member-qualified-strip{display:flex;align-items:center;gap:8px;min-height:34px;margin:8px 0 10px;padding:6px 9px;border:1px solid rgba(37,213,138,.24);border-radius:9px;background:rgba(37,213,138,.045);overflow-x:auto;white-space:nowrap}
    .member-qualified-strip>strong{flex:0 0 auto;color:#25d58a;font-size:8px;letter-spacing:.06em;text-transform:uppercase}
    .member-qualified-empty{color:#89918c;font-size:7px}
    .member-qualified-item{display:inline-flex;align-items:center;gap:6px;flex:0 0 auto;padding:4px 7px;border-radius:7px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.06);font-size:7px;color:#aeb6b1}
    .member-qualified-item b{color:#fff;font-size:8px}.member-qualified-item .score{color:#25d58a;font-weight:950}.member-qualified-item .price{color:#f1c928;font-weight:900}.member-qualified-item .minute{color:#d9dedb}
    .member-live-scoreline{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin:8px 0 4px;padding:7px 9px;border-radius:9px;background:#181b1c;border:1px solid rgba(255,255,255,.07)}
    .member-live-scoreline .clock{font-size:8px;font-weight:950;color:#25d58a;white-space:nowrap}.member-live-scoreline .teams{min-width:0;text-align:center;font-size:8px;color:#dce1de;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.member-live-scoreline .teams b{font-size:13px;color:#fff;margin:0 6px}.member-live-scoreline .selection{text-align:right;white-space:nowrap;font-size:7px;color:#8f9893}.member-live-scoreline .selection b{display:block;color:#25d58a;font-size:8px}.member-live-scoreline .selection em{font-style:normal;color:#f1c928;font-size:7px}
    @media(max-width:700px){.member-live-scoreline{grid-template-columns:auto 1fr}.member-live-scoreline .selection{grid-column:1/-1;text-align:left;display:flex;gap:7px;align-items:center}.member-live-scoreline .selection b{display:inline}.member-qualified-strip{margin-top:7px}}
  `;
  document.head.appendChild(style);
}

function ensureQualifiedStrip() {
  const liveView = $('.view[data-view="live"]');
  if (!liveView) return null;
  let strip = $('#memberQualifiedStrip');
  if (strip) return strip;
  strip = document.createElement('div');
  strip.id = 'memberQualifiedStrip';
  strip.className = 'member-qualified-strip';
  const sectionHead = liveView.querySelector('.section-head');
  if (sectionHead) sectionHead.insertAdjacentElement('beforebegin', strip);
  return strip;
}

function renderQualified(payload) {
  const strip = ensureQualifiedStrip();
  if (!strip) return;
  const config = payload?.config || {};
  const rows = (Array.isArray(payload?.active) ? payload.active : []).filter(row => Number(row?.triggered) === 1);
  if (!rows.length) {
    strip.innerHTML = '<strong>QUALIFIED</strong><span class="member-qualified-empty">ยังไม่มีทีมผ่านครบทุกเงื่อนไข</span>';
    return;
  }
  strip.innerHTML = `<strong>QUALIFIED ${rows.length}</strong>${rows.map(row => {
    const match = actualMatch(row);
    const score = match.homeScore === null || match.awayScore === null ? '—' : `${match.homeScore}-${match.awayScore}`;
    return `<span class="member-qualified-item"><b>${esc(row.selected_team)}</b><span class="score">${esc(score)}</span><span class="minute">${esc(row.minute)}′</span><span class="price">${esc(marketTicket(row, config))}</span></span>`;
  }).join('')}`;
}

function renderScorelines(payload) {
  const rows = Array.isArray(payload?.active) ? payload.active : [];
  const config = payload?.config || {};
  const cards = [...document.querySelectorAll('#liveGrid .live-card')];
  cards.forEach((card, index) => {
    const row = rows[index];
    if (!row) return;
    card.querySelector('.member-live-scoreline')?.remove();
    const match = actualMatch(row);
    const score = match.homeScore === null || match.awayScore === null ? '—' : `${match.homeScore} - ${match.awayScore}`;
    const line = document.createElement('div');
    line.className = 'member-live-scoreline';
    line.innerHTML = `
      <span class="clock">LIVE ${esc(row.minute)}′</span>
      <span class="teams">${esc(match.home)} <b>${esc(score)}</b> ${esc(match.away)}</span>
      <span class="selection"><b>เลือก: ${esc(row.selected_team)}</b><em>${esc(marketTicket(row, config))}</em></span>`;
    const decision = card.querySelector('.member-signal-decision');
    if (decision) decision.insertAdjacentElement('beforebegin', line);
    else card.appendChild(line);
  });
}

async function load() {
  try {
    const response = await fetch(`${WORKER}/member-live-status?member=${encodeURIComponent(MEMBER_ID)}&_=${Date.now()}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) return;
    renderQualified(payload);
    window.setTimeout(() => renderScorelines(payload), 80);
  } catch {}
}

ensureStyles();
ensureQualifiedStrip();
window.setTimeout(load, 400);
window.setInterval(load, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
