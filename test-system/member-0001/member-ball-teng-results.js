const MEMBER_ID = '0001';
const WORKER = 'https://nomadtips3-test-api.mccarey-supon.workers.dev';
const GRID = document.getElementById('ballTengGrid');
const META = document.getElementById('ballTengMeta');
let latestPayload = null;
let loading = false;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fixtureId(match) {
  return String(match?.fixture_id || match?.fixtureId || '');
}

function statusClass(outcome) {
  const value = String(outcome || 'PENDING').toUpperCase();
  if (['CORRECT', 'WIN', 'HALF-WIN'].includes(value)) return 'correct';
  if (['INCORRECT', 'LOSS', 'HALF-LOSS'].includes(value)) return 'incorrect';
  if (['VOID', 'PUSH'].includes(value)) return 'void';
  return 'pending';
}

function scoreText(result) {
  const detail = result?.payload?.memberResult || {};
  const home = number(detail.homeScore);
  const away = number(detail.awayScore);
  return home !== null && away !== null ? `${home}–${away}` : null;
}

function outcomeText(result) {
  return String(result?.outcome || 'PENDING').toUpperCase();
}

function ensureStyles() {
  if (document.getElementById('memberBallTengResultStyles')) return;
  const style = document.createElement('style');
  style.id = 'memberBallTengResultStyles';
  style.textContent = `
    .member-ball-result-summary{margin:10px 0 14px;padding:10px 12px;border:1px solid #2c3230;border-radius:10px;background:#151918;color:#aeb8b3;font-size:12px;line-height:1.5}
    .member-ball-result-summary b{color:#eef7f2}
    .member-result-line{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:9px 10px;border:1px solid #303634;border-radius:8px;background:#111513}
    .member-result-line small{color:#89918c;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
    .member-result-line strong{font-size:12px;letter-spacing:.03em}
    .member-result-line.correct strong{color:#00df91}
    .member-result-line.incorrect strong{color:#ff6b6b}
    .member-result-line.void strong{color:#f0c75e}
    .member-result-line.pending strong{color:#aeb8b3}
  `;
  document.head.appendChild(style);
}

function ensureSummary() {
  if (!GRID) return null;
  let summary = document.getElementById('memberBallTengResultSummary');
  if (summary) return summary;
  summary = document.createElement('div');
  summary.id = 'memberBallTengResultSummary';
  summary.className = 'member-ball-result-summary';
  GRID.insertAdjacentElement('beforebegin', summary);
  return summary;
}

function summaryHtml(summary, label = 'ผลชุดบอลเต็งนี้') {
  const total = Number(summary?.total || 0);
  const settled = Number(summary?.settled || 0);
  const correct = Number(summary?.correct || 0);
  const incorrect = Number(summary?.incorrect || 0);
  const pending = Number(summary?.pending ?? Math.max(0, total - settled));
  const accuracy = number(summary?.accuracy);
  return total
    ? `<b>${label}</b> · ยืนยันแล้ว ${settled}/${total} · Correct ${correct} · Incorrect ${incorrect} · Waiting ${pending}${accuracy === null ? '' : ` · Accuracy ${accuracy.toFixed(2)}%`}`
    : `<b>${label}</b> · ยังไม่มีรายการให้ตรวจผล`;
}

function patch(payload) {
  if (!GRID || !payload) return;
  ensureStyles();

  const matches = Array.isArray(payload?.payload?.matches) ? payload.payload.matches : [];
  const results = Array.isArray(payload?.results) ? payload.results : [];
  const byFixture = new Map(results.map(row => [String(row.fixture_id || ''), row]));
  const cards = [...GRID.querySelectorAll('.pick-card')];

  cards.forEach((card, index) => {
    const match = matches[index];
    if (!match) return;
    const result = byFixture.get(fixtureId(match));
    const outcome = outcomeText(result);
    const score = scoreText(result);
    const cls = statusClass(outcome);
    let line = card.querySelector('.member-result-line');
    if (!line) {
      line = document.createElement('div');
      const pick = card.querySelector('.pick');
      if (pick) pick.insertAdjacentElement('afterend', line);
      else card.appendChild(line);
    }
    line.className = `member-result-line ${cls}`;
    const html = `<small>ผลการแข่งขัน</small><strong>${score ? `${score} · ` : ''}${outcome}</strong>`;
    if (line.innerHTML !== html) line.innerHTML = html;
  });

  const summary = payload.resultSummary || {};
  const node = ensureSummary();
  if (node) {
    const html = summaryHtml(summary);
    if (node.innerHTML !== html) node.innerHTML = html;
  }
  if (META && payload.setId) {
    const total = Number(summary.total || results.length || matches.length || 0);
    const settled = Number(summary.settled || 0);
    const suffix = total ? ` · Result ${settled}/${total}` : '';
    const text = `Member #${MEMBER_ID} · ${payload.setId} · config v${payload.config?.version || '—'}${suffix}`;
    if (META.textContent !== text) META.textContent = text;
  }
}

async function fallbackBallTengSummary() {
  const url = new URL(`${WORKER}/member-stats-summary`);
  url.searchParams.set('member', MEMBER_ID);
  url.searchParams.set('source', 'BALL_TENG');
  url.searchParams.set('_', String(Date.now()));
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
  return payload.summary || {};
}

async function refresh() {
  if (loading || document.hidden) return;
  loading = true;
  try {
    const url = `${WORKER}/member-ball-teng-results?member=${encodeURIComponent(MEMBER_ID)}&_=${Date.now()}`;
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error || `HTTP ${response.status}`);
    latestPayload = payload;
    patch(payload);
  } catch (error) {
    const node = ensureSummary();
    try {
      const summary = await fallbackBallTengSummary();
      if (node) node.innerHTML = summaryHtml(summary, 'สถิติบอลเต็งของสมาชิก');
      console.warn('Member Ball Teng result detail fallback:', error?.message || error);
    } catch (fallbackError) {
      if (node) node.innerHTML = '<b>สถิติบอลเต็งของสมาชิก</b> · ข้อมูลผลการแข่งขันกำลังปรับปรุง กรุณารีเฟรชอีกครั้ง';
      console.warn('Member Ball Teng statistics unavailable:', fallbackError?.message || fallbackError);
    }
  } finally {
    loading = false;
  }
}

if (GRID) {
  const observer = new MutationObserver(() => {
    if (latestPayload) queueMicrotask(() => patch(latestPayload));
  });
  observer.observe(GRID, { childList: true });
}

window.setTimeout(refresh, 800);
window.setInterval(refresh, 15000);
window.addEventListener('pageshow', refresh);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
