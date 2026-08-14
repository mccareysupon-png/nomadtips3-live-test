const JENG_HOST = 'bot-owner.nomadtips3.com';
const THAI_OFFSET_MS = 7 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const START_MINUTE = 19 * 60;
const END_MINUTE = 22 * 60;
const DAILY_LIMIT = 5;
const HISTORY_DAYS = 30;

const DELIVERIES_SQL = `
CREATE TABLE IF NOT EXISTS line_deliveries (
  delivery_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  fixture_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
)`;

let schemaReady = false;

function shiftedDate(ms) {
  return new Date(Number(ms) + THAI_OFFSET_MS);
}

function bangkokDateKey(ms) {
  return shiftedDate(ms).toISOString().slice(0, 10);
}

function bangkokMinuteOfDay(ms) {
  const date = shiftedDate(ms);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function windowForDateKey(dateKey) {
  const midnightUtcLike = Date.parse(`${dateKey}T00:00:00.000Z`) - THAI_OFFSET_MS;
  return {
    start: midnightUtcLike + START_MINUTE * 60_000,
    end: midnightUtcLike + END_MINUTE * 60_000
  };
}

function currentWindow(now = Date.now()) {
  const dateKey = bangkokDateKey(now);
  return { dateKey, ...windowForDateKey(dateKey) };
}

function inJengWindow(ms) {
  const minute = bangkokMinuteOfDay(ms);
  return minute >= START_MINUTE && minute < END_MINUTE;
}

function modeForNow(now = Date.now()) {
  const minute = bangkokMinuteOfDay(now);
  if (minute < START_MINUTE) return 'WAITING';
  if (minute >= END_MINUTE) return 'CLOSED';
  return 'ACTIVE';
}

function num(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedSide(row) {
  return String(row?.selected_side || 'HOME').toUpperCase() === 'AWAY' ? 'AWAY' : 'HOME';
}

function normalizedTrade(row = {}) {
  const side = selectedSide(row);
  const selectedTeam = String(row.selected_team || 'Selected');
  const opponent = String(row.opponent || 'Opponent');
  const actualHome = String(row.actual_home || (side === 'AWAY' ? opponent : selectedTeam));
  const actualAway = String(row.actual_away || (side === 'AWAY' ? selectedTeam : opponent));
  const selectedScore = num(row.entry_selected_score, 0);
  const opponentScore = num(row.entry_opponent_score, 0);
  const actualHomeScore = row.entry_actual_home_score ?? (side === 'AWAY' ? opponentScore : selectedScore);
  const actualAwayScore = row.entry_actual_away_score ?? (side === 'AWAY' ? selectedScore : opponentScore);
  const status = String(row.status || 'PENDING').toUpperCase();
  const result = String(row.result || '').toUpperCase();
  let outcome = 'PENDING';
  if (result === 'CORRECT') outcome = 'WIN';
  else if (result === 'INCORRECT') outcome = 'LOSS';
  else if (status === 'VOID' || String(row.settlement || '').toUpperCase() === 'VOID') outcome = 'VOID';
  else if (status === 'SETTLED') outcome = 'PUSH';

  return {
    tradeKey: String(row.trade_key || `${row.fixture_id || 'trade'}:${row.created_at || ''}`),
    fixtureId: num(row.fixture_id, 0),
    date: bangkokDateKey(num(row.created_at, Date.now())),
    createdAt: num(row.created_at, 0),
    settledAt: num(row.settled_at, 0) || null,
    selectedTeam,
    opponent,
    selectedSide: side,
    home: actualHome,
    away: actualAway,
    minute: num(row.entry_minute, null),
    score: `${actualHomeScore ?? '—'}-${actualAwayScore ?? '—'}`,
    momentum: num(row.momentum, null),
    ahLine: num(row.ah_line, 0),
    odds: num(row.ah_odds ?? row.selected_win_odds ?? row.home_win_odds, null),
    status,
    result,
    settlement: String(row.settlement || ''),
    outcome,
    profitUnits: num(row.profit_units, 0),
    stakeUnits: num(row.stake_units, 0)
  };
}

async function fetchWindowTrades(env, dateKey) {
  if (!env.DB) return [];
  const { start, end } = windowForDateKey(dateKey);
  const result = await env.DB.prepare(`
    SELECT * FROM paper_trades_side
    WHERE created_at >= ? AND created_at < ?
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(start, end, DAILY_LIMIT).all();
  return (result.results || []).map(normalizedTrade);
}

async function fetchHistory(env, now = Date.now(), days = HISTORY_DAYS) {
  if (!env.DB) return [];
  const cutoff = now - (days + 1) * DAY_MS;
  const result = await env.DB.prepare(`
    SELECT * FROM paper_trades_side
    WHERE created_at >= ?
    ORDER BY created_at ASC
    LIMIT 5000
  `).bind(cutoff).all();

  const groups = new Map();
  for (const row of result.results || []) {
    const createdAt = num(row.created_at, 0);
    if (!createdAt || !inJengWindow(createdAt)) continue;
    const key = bangkokDateKey(createdAt);
    const group = groups.get(key) || [];
    if (group.length < DAILY_LIMIT) {
      group.push(normalizedTrade(row));
      groups.set(key, group);
    }
  }

  const cutoffKey = bangkokDateKey(now - days * DAY_MS);
  return [...groups.entries()]
    .filter(([key]) => key >= cutoffKey)
    .flatMap(([, rows]) => rows)
    .sort((a, b) => b.createdAt - a.createdAt);
}

function statsFor(trades) {
  const wins = trades.filter(item => item.outcome === 'WIN').length;
  const losses = trades.filter(item => item.outcome === 'LOSS').length;
  const pushes = trades.filter(item => ['PUSH', 'VOID'].includes(item.outcome)).length;
  const pending = trades.filter(item => item.outcome === 'PENDING').length;
  const settled = wins + losses;
  const odds = trades.map(item => item.odds).filter(value => Number.isFinite(value) && value > 1);
  const netUnits = trades.reduce((sum, item) => sum + (Number(item.profitUnits) || 0), 0);
  const settledStake = trades
    .filter(item => item.outcome !== 'PENDING')
    .reduce((sum, item) => sum + (Number(item.stakeUnits) || 0), 0);
  return {
    total: trades.length,
    wins,
    losses,
    pushes,
    pending,
    accuracy: settled ? wins / settled * 100 : 0,
    averageOdds: odds.length ? odds.reduce((sum, value) => sum + value, 0) / odds.length : null,
    netUnits,
    roi: settledStake > 0 ? netUnits / settledStake * 100 : 0
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function jengData(env) {
  const now = Date.now();
  const window = currentWindow(now);
  const [today, history] = await Promise.all([
    fetchWindowTrades(env, window.dateKey),
    fetchHistory(env, now, HISTORY_DAYS)
  ]);
  return {
    ok: true,
    name: 'เจ๋งหาเงิน',
    generatedAt: new Date(now).toISOString(),
    timezone: 'Asia/Bangkok',
    schedule: { start: '19:00', end: '22:00', dailyLimit: DAILY_LIMIT },
    mode: modeForNow(now),
    source: 'Engine 3 paper_trades_side · read-only reuse',
    footballApiCalls: 0,
    automaticBetting: false,
    lineConfigured: Boolean(env.JENG_LINE_USER_ID && env.LINE_CHANNEL_ACCESS_TOKEN),
    today: {
      date: window.dateKey,
      count: today.length,
      remaining: Math.max(0, DAILY_LIMIT - today.length),
      signals: today
    },
    history: {
      days: HISTORY_DAYS,
      stats: statsFor(history),
      signals: history.slice(0, 150)
    }
  };
}

const JENG_HTML = String.raw`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#07140e"><title>เจ๋งหาเงิน · NOMADTIPS3</title>
<style>
:root{color-scheme:dark;--bg:#07100c;--panel:#111c16;--line:#24342b;--text:#eff8f2;--muted:#91a69a;--green:#43d17f;--amber:#f3c45c;--red:#ff7474;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0,#163224 0,transparent 34%),var(--bg);color:var(--text)}.shell{width:min(1080px,calc(100% - 24px));margin:auto}.top{position:sticky;top:0;z-index:3;background:rgba(7,16,12,.9);border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.topin{min-height:58px;display:flex;align-items:center;justify-content:space-between}.brand{font-weight:900;letter-spacing:-.04em}.brand b{color:var(--green)}a{color:inherit}.back{font-size:12px;color:var(--muted);text-decoration:none}main{padding:26px 0 48px}.hero{display:flex;align-items:end;justify-content:space-between;gap:16px}h1{font-size:clamp(30px,6vw,54px);margin:0;letter-spacing:-.06em}.sub{margin:7px 0 0;color:var(--muted)}.pill{border:1px solid var(--line);border-radius:999px;padding:8px 12px;font-size:12px}.pill.active{color:var(--green);border-color:rgba(67,209,127,.35)}.metrics{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-top:20px}.metric,.panel{background:linear-gradient(180deg,var(--panel),#0d1712);border:1px solid rgba(255,255,255,.05);border-radius:12px}.metric{padding:14px}.metric small{display:block;color:var(--muted);font-size:10px;letter-spacing:.08em}.metric b{display:block;margin-top:6px;font-size:22px}.good{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.panel{padding:16px;margin-top:12px}.head{display:flex;justify-content:space-between;gap:12px;align-items:center}.head h2{font-size:15px;margin:0}.note{font-size:11px;color:var(--muted)}.list{display:grid;gap:8px;margin-top:12px}.row{display:grid;grid-template-columns:minmax(0,1.5fr) repeat(4,minmax(70px,.55fr));gap:10px;align-items:center;padding:12px;background:rgba(255,255,255,.025);border-radius:9px}.match b{display:block}.match span,.cell small{display:block;color:var(--muted);font-size:10px;margin-top:3px}.cell b{font-size:13px}.empty{text-align:center;padding:28px;color:var(--muted)}.stats{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:12px}.stat{padding:11px;background:rgba(255,255,255,.025);border-radius:8px}.stat small{display:block;color:var(--muted);font-size:9px}.stat b{display:block;margin-top:5px}.foot{margin-top:12px;padding:12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:11px;line-height:1.6}@media(max-width:820px){.metrics{grid-template-columns:repeat(2,1fr)}.stats{grid-template-columns:repeat(3,1fr)}.row{grid-template-columns:1fr 1fr}.match{grid-column:1/-1}}@media(max-width:480px){.hero{align-items:start;flex-direction:column}.metrics{grid-template-columns:1fr 1fr}.stats{grid-template-columns:1fr 1fr}}
</style></head><body><header class="top"><div class="shell topin"><div class="brand">NOMAD<b>TIPS3</b></div><a class="back" href="/">OWNER DESK</a></div></header><main class="shell"><section class="hero"><div><h1>เจ๋งหาเงิน</h1><p class="sub">อ่านสัญญาณที่ผ่านเงื่อนไขจาก Engine 3 · เฉพาะ 19:00–22:00 · สูงสุด 5 คู่/วัน</p></div><div id="modePill" class="pill">CONNECTING</div></section><section class="metrics"><div class="metric"><small>สถานะ</small><b id="mode">—</b></div><div class="metric"><small>วันนี้</small><b id="count">—</b></div><div class="metric"><small>เหลือ</small><b id="remaining">—</b></div><div class="metric"><small>LINE ส่วนตัว</small><b id="line">—</b></div><div class="metric"><small>API เพิ่ม</small><b class="good">0</b></div></section><section class="panel"><div class="head"><h2>สัญญาณวันนี้</h2><span id="fresh" class="note">—</span></div><div id="todayList" class="list"><div class="empty">กำลังอ่านข้อมูล…</div></div></section><section class="panel"><div class="head"><h2>สถิติ เจ๋งหาเงิน · 30 วัน</h2><span class="note">คัดเฉพาะ 5 สัญญาณแรกของช่วงเวลาในแต่ละวัน</span></div><div id="stats" class="stats"></div><div class="head" style="margin-top:16px"><h2>ประวัติล่าสุด</h2><span class="note">PAPER / REFERENCE LEDGER</span></div><div id="historyList" class="list"></div></section><div class="foot">ระบบนี้ไม่สแกนฟุตบอลซ้ำและไม่เรียก Football API จากหน้านี้ ข้อมูลมาจาก ledger ของ Engine 3 เท่านั้น ไม่มีการกดเดิมพันหรือส่งคำสั่งเดิมพันอัตโนมัติ กรุณาตรวจตลาดและราคาจริงก่อนตัดสินใจเองทุกครั้ง</div></main>
<script>
const $=id=>document.getElementById(id);const f=n=>Number.isFinite(Number(n))?Number(n):null;const odds=n=>f(n)==null?'—':f(n).toFixed(2);const pct=n=>f(n)==null?'—':f(n).toFixed(1)+'%';const signed=n=>{n=f(n)||0;return (n>0?'+':'')+n.toFixed(2)+'u'};const clock=ms=>new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ms));const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function row(x){return '<article class="row"><div class="match"><b>'+safe(x.home)+' vs '+safe(x.away)+'</b><span>'+safe(clock(x.createdAt))+' · นาที '+safe(x.minute??'—')+' · สกอร์ '+safe(x.score)+'</span></div><div class="cell"><small>เลือก</small><b>'+safe(x.selectedTeam)+'</b></div><div class="cell"><small>AH</small><b>'+safe((x.ahLine>=0?'+':'')+x.ahLine)+'</b></div><div class="cell"><small>ODDS</small><b>'+safe(odds(x.odds))+'</b></div><div class="cell"><small>ผล</small><b class="'+(x.outcome==='WIN'?'good':x.outcome==='LOSS'?'bad':'warn')+'">'+safe(x.outcome)+'</b></div></article>'}
function render(d){$('mode').textContent=d.mode;$('count').textContent=d.today.count+'/5';$('remaining').textContent=d.today.remaining;$('line').textContent=d.lineConfigured?'READY':'SETUP';$('line').className=d.lineConfigured?'good':'warn';$('fresh').textContent='อัปเดต '+clock(Date.parse(d.generatedAt));const p=$('modePill');p.textContent=d.mode==='ACTIVE'?'ACTIVE · 19:00–22:00':d.mode==='WAITING'?'WAITING · START 19:00':'CLOSED · NEXT 19:00';p.className='pill '+(d.mode==='ACTIVE'?'active':'');const list=d.today.signals||[];$('todayList').innerHTML=list.length?list.map(row).join(''):'<div class="empty">ยังไม่มีสัญญาณที่ผ่านเงื่อนไขในช่วงเวลาวันนี้</div>';const s=d.history.stats;$('stats').innerHTML=[['TOTAL',s.total],['WIN',s.wins],['LOSS',s.losses],['PENDING',s.pending],['ACCURACY',pct(s.accuracy)],['AVG ODDS',odds(s.averageOdds)],['NET',signed(s.netUnits)]].map(v=>'<div class="stat"><small>'+v[0]+'</small><b>'+safe(v[1])+'</b></div>').join('');const h=(d.history.signals||[]).slice(0,30);$('historyList').innerHTML=h.length?h.map(row).join(''):'<div class="empty">ยังไม่มีประวัติ</div>'}
async function refresh(){try{const r=await fetch('/jeng-money/data',{cache:'no-store'});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'โหลดข้อมูลไม่ได้');render(d)}catch(e){$('fresh').textContent=e.message||'ข้อมูลไม่พร้อม'}}refresh();setInterval(refresh,10000);
</script></body></html>`;

export function handleJengMoneyPage(request) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== JENG_HOST) return null;
  if (url.pathname === '/jeng-money' || url.pathname === '/jeng-money/') {
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
    return new Response(JENG_HTML, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive'
      }
    });
  }
  return null;
}

export async function handleJengMoneyRoute(request, env) {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== JENG_HOST || url.pathname !== '/jeng-money/data') return null;
  if (request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405);
  try {
    return json(await jengData(env));
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Jeng Money data failed' }, 500);
  }
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error('D1 binding DB is not configured');
  if (schemaReady) return;
  await env.DB.prepare(DELIVERIES_SQL).run();
  schemaReady = true;
}

async function pushText(env, userId, text) {
  if (!env.LINE_CHANNEL_ACCESS_TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  const response = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ to: userId, messages: [{ type: 'text', text: String(text).slice(0, 5000) }] })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `LINE HTTP ${response.status}`);
}

async function deliverySent(env, key) {
  const row = await env.DB.prepare(
    `SELECT status FROM line_deliveries WHERE delivery_key = ? AND status = 'SENT' LIMIT 1`
  ).bind(key).first();
  return Boolean(row);
}

async function saveDelivery(env, key, userId, trade, eventType, status, error = null) {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO line_deliveries
      (delivery_key, user_id, fixture_id, event_type, status, sent_at, error, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(delivery_key) DO UPDATE SET
      status = excluded.status,
      sent_at = excluded.sent_at,
      error = excluded.error,
      updated_at = excluded.updated_at
  `).bind(
    key, userId, Number(trade.fixtureId || 0), eventType, status,
    status === 'SENT' ? now : null,
    error ? String(error).slice(0, 500) : null,
    now
  ).run();
}

async function send(env, userId, trade, eventType, text) {
  const key = `${eventType}:${trade.tradeKey}:${userId}`;
  if (await deliverySent(env, key)) return false;
  try {
    await pushText(env, userId, text);
    await saveDelivery(env, key, userId, trade, eventType, 'SENT');
    return true;
  } catch (error) {
    await saveDelivery(env, key, userId, trade, eventType, 'FAILED', error?.message || error);
    return false;
  }
}

function signalText(trade) {
  return [
    '💰 เจ๋งหาเงิน',
    '19:00–22:00 · Engine 3',
    '',
    `${trade.home} vs ${trade.away}`,
    `เลือก: ${trade.selectedTeam} (${trade.selectedSide})`,
    `นาที ${trade.minute ?? '—'}′ | สกอร์ ${trade.score}`,
    `Momentum ${Math.round(Number(trade.momentum || 0))}%`,
    `AH ${trade.ahLine >= 0 ? '+' : ''}${trade.ahLine} @ ${Number(trade.odds || 0).toFixed(2)}`,
    '',
    'ตรวจตลาดและราคาจริงก่อนตัดสินใจเอง'
  ].join('\n');
}

function resultText(trade) {
  const icon = trade.outcome === 'WIN' ? '✅' : trade.outcome === 'LOSS' ? '❌' : '➖';
  return [
    `${icon} เจ๋งหาเงิน · RESULT`,
    '',
    `${trade.home} vs ${trade.away}`,
    `เลือก: ${trade.selectedTeam}`,
    `ผล: ${trade.outcome}`,
    `PAPER: ${(Number(trade.profitUnits || 0) >= 0 ? '+' : '')}${Number(trade.profitUnits || 0).toFixed(2)} Units`
  ].join('\n');
}

export async function notifyJengMoneyLineEvents(env) {
  const userId = String(env.JENG_LINE_USER_ID || '').trim();
  if (!userId || !env.LINE_CHANNEL_ACCESS_TOKEN || !env.DB) {
    return { configured: false, sent: 0 };
  }
  await ensureSchema(env);
  const now = Date.now();
  const todayKey = bangkokDateKey(now);
  const mode = modeForNow(now);
  let sent = 0;

  const today = await fetchWindowTrades(env, todayKey);
  if (mode === 'ACTIVE') {
    for (const trade of today) {
      if (await send(env, userId, trade, 'JENG_SIGNAL', signalText(trade))) sent += 1;
    }
  }

  const recent = await fetchHistory(env, now, 2);
  for (const trade of recent) {
    if (!['SETTLED', 'VOID'].includes(trade.status)) continue;
    const signalKey = `JENG_SIGNAL:${trade.tradeKey}:${userId}`;
    if (!(await deliverySent(env, signalKey))) continue;
    if (await send(env, userId, trade, 'JENG_RESULT', resultText(trade))) sent += 1;
  }

  return { configured: true, sent, userIdBound: true };
}

export const JENG_MONEY_CONFIG = Object.freeze({
  timezone: 'Asia/Bangkok',
  start: '19:00',
  end: '22:00',
  dailyLimit: DAILY_LIMIT,
  source: 'Engine 3 paper_trades_side',
  footballApiCalls: 0,
  automaticBetting: false
});
