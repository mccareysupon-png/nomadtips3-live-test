import { CAR31_DEFAULT_CONFIG, CAR31_SOURCE_MODE, normalizeCar31Config } from '../src/config.js';

const STORAGE_KEY = 'nomadtips3-car31-active-config';
const config = normalizeCar31Config(JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') || CAR31_DEFAULT_CONFIG);

let runtime = null;
let snapshots = [];
let matches = [];
let selected = 0;

const $ = selector => document.querySelector(selector);
const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const pair = value => [n(value?.home), n(value?.away)];
const swap = (values, side) => side === 1 ? [values[1], values[0]] : values;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

$('#primarySource').textContent = 'GOALOO';
$('#apiPolicy').textContent = CAR31_SOURCE_MODE.locked ? 'OFF · GOALOO ONLY' : config.apiVerifyPolicy.replaceAll('_', ' ');

function pressure(stats) {
  const w = config.momentumWeights;
  const items = [
    ['attacks', w.attacks],
    ['dangerous_attacks', w.dangerous_attacks],
    ['shots', w.shots],
    ['shots_on_target', w.shots_on_target],
    ['corners', w.corners],
    ['possession', w.possession]
  ];
  let home = 0;
  let away = 0;
  for (const [key, weight] of items) {
    home += n(stats?.[key]?.home) * weight;
    away += n(stats?.[key]?.away) * weight;
  }
  const total = Math.max(0.0001, home + away);
  return [Math.round(home / total * 100), Math.round(away / total * 100)];
}

function selectedSide(row) {
  if (config.side === 'AWAY') return 1;
  if (config.side === 'HOME') return 0;
  const p = pressure(row.stats || {});
  return p[1] > p[0] ? 1 : 0;
}

function snapshotRows(id, side, kind) {
  const rows = [];
  for (const snapshot of snapshots) {
    const found = (snapshot.matches || []).find(m => String(m.id) === String(id));
    if (!found || !Number.isFinite(Number(found.minute))) continue;
    if (kind === 'pressure') {
      const p = swap(pressure(found.stats || {}), side);
      rows.push([Number(found.minute), p[0], p[1]]);
    } else {
      const d = swap(pair(found.stats?.dangerous_attacks), side);
      rows.push([Number(found.minute), d[0], d[1]]);
    }
  }
  const byMinute = new Map();
  for (const row of rows) byMinute.set(row[0], row);
  return [...byMinute.values()].sort((a,b) => a[0] - b[0]).slice(-Math.max(4, config.chartHistoryMinutes));
}

function baseline(id, side, currentStats) {
  const candidates = [];
  for (const snapshot of snapshots) {
    const found = (snapshot.matches || []).find(m => String(m.id) === String(id));
    if (!found || !Number.isFinite(Number(found.minute))) continue;
    if (Number(found.minute) >= config.minuteMin) candidates.push(found);
  }
  candidates.sort((a,b) => Number(a.minute) - Number(b.minute));
  const first = candidates[0];
  const stat = key => swap(pair(first?.stats?.[key]), side)[0];
  return {
    dangerous: first ? stat('dangerous_attacks') : currentStats.dangerous[0],
    shots: first ? stat('shots') : currentStats.shots[0],
    sot: first ? stat('shots_on_target') : currentStats.sot[0],
    corners: first ? stat('corners') : currentStats.corners[0]
  };
}

function adapt(row) {
  const side = selectedSide(row);
  const p = swap(pressure(row.stats || {}), side);
  const rawStats = {
    possession: pair(row.stats?.possession),
    attacks: pair(row.stats?.attacks),
    dangerous: pair(row.stats?.dangerous_attacks),
    shots: pair(row.stats?.shots),
    sot: pair(row.stats?.shots_on_target),
    corners: pair(row.stats?.corners),
    red: pair(row.stats?.red_cards)
  };
  const stats = Object.fromEntries(Object.entries(rawStats).map(([key, values]) => [key, swap(values, side)]));
  const score = swap([n(row.score?.home), n(row.score?.away)], side);
  const home = side === 1 ? row.away : row.home;
  const away = side === 1 ? row.home : row.away;
  const item = {
    id: String(row.sourceMatchId),
    side,
    home: home || 'Selected Team',
    away: away || 'Opponent',
    league: row.league || 'Goaloo Live',
    minute: Number.isFinite(Number(row.minute)) ? Number(row.minute) : 0,
    score,
    momentum: p[0],
    stats,
    matchConfidence: row.coreStatsComplete ? 100 : 70,
    coreStatsComplete: Boolean(row.coreStatsComplete),
    state: 'WATCH',
    odds: { win: [null,null,null], ah: [null,null], ou: [null,null] },
    events: [],
    sources: [
      ['GOALOO', `live · ${row.sourceFreshnessSeconds ?? 0}s`],
      ['CORE STATS', row.coreStatsComplete ? 'READY' : 'PARTIAL'],
      ['SOURCE ID', String(row.sourceMatchId)]
    ],
    trace: `GOALOO ONLY · ${row.sourceUrl || ''} · ${row.warnings?.length ? row.warnings.join(', ') : 'parser OK'}`
  };
  item.baseline = baseline(item.id, side, item.stats);
  item.pressure = snapshotRows(item.id, side, 'pressure');
  item.danger = snapshotRows(item.id, side, 'danger');
  if (!item.pressure.length) item.pressure = [[item.minute, p[0], p[1]]];
  if (!item.danger.length) item.danger = [[item.minute, item.stats.dangerous[0], item.stats.dangerous[1]]];
  const decision = decide(item);
  item.state = decision.decision === 'SHADOW SIGNAL' ? 'SIGNAL' : decision.decision;
  return item;
}

function decide(match) {
  const selectedOdds = config.market === 'AH' ? Number(match.odds.ah[1]) : config.market === 'OU' ? Number(match.odds.ou[1]) : Number(match.odds.win[0]);
  const hasOdds = Number.isFinite(selectedOdds);
  const goalGap = Math.abs(match.score[0] - match.score[1]);
  const evidence = {
    dangerous: match.stats.dangerous[0] - match.baseline.dangerous,
    shots: match.stats.shots[0] - match.baseline.shots,
    sot: match.stats.sot[0] - match.baseline.sot,
    corners: match.stats.corners[0] - match.baseline.corners
  };
  const rules = [
    [config.attackEvidenceDangerousAttacksEnabled, evidence.dangerous, config.attackEvidenceDangerousAttacksMin],
    [config.attackEvidenceShotsEnabled, evidence.shots, config.attackEvidenceShotsMin],
    [config.attackEvidenceShotsOnTargetEnabled, evidence.sot, config.attackEvidenceShotsOnTargetMin],
    [config.attackEvidenceCornersEnabled, evidence.corners, config.attackEvidenceCornersMin]
  ].filter(rule => rule[0]);
  const passed = rules.filter(rule => rule[1] >= rule[2]).length;
  const required = config.attackEvidenceRequirement === 'ALL' ? rules.length : Number(config.attackEvidenceRequirement);
  const gates = [
    ['MINUTE', match.minute >= config.minuteMin && match.minute <= config.minuteMax, `${config.minuteMin}-${config.minuteMax}'`],
    ['CORE STATS', !config.requireCoreStats || match.coreStatsComplete, match.coreStatsComplete ? 'complete' : 'partial'],
    ['MARKET / ODDS', hasOdds, hasOdds ? `${config.market} @ ${selectedOdds.toFixed(2)}` : 'Goaloo odds parser waiting'],
    ['MOMENTUM', match.momentum >= config.momentumMin, `${match.momentum}% / ≥${config.momentumMin}%`],
    ['EVIDENCE', !config.attackEvidenceEnabled || passed >= Math.min(required, rules.length), `${passed}/${rules.length} · need ${config.attackEvidenceRequirement}`],
    ['GOAL GAP', !config.goalGapLimited || goalGap <= config.maxGoalGap, `${goalGap} / max ${config.maxGoalGap}`],
    ['SOURCE', match.matchConfidence >= config.matchConfidenceMin, `${match.matchConfidence}% / ≥${config.matchConfidenceMin}%`]
  ];
  const all = gates.every(g => g[1]);
  return {
    gates,
    evidence,
    decision: all ? 'SHADOW SIGNAL' : match.momentum >= Math.max(1, config.momentumMin - 7) ? 'NEAR' : 'WATCH',
    reason: all ? `confirmation ${config.confirmationRounds} rounds required before real activation` : 'one or more gates not ready'
  };
}

function spark(points) {
  const values = (points || []).map(p => p[1]);
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const coords = values.map((value,index) => `${index/(values.length-1||1)*100},${28-((value-min)/range)*22}`).join(' ');
  return `<svg viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="#00df91" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

function barRow(label, values) {
  const total = Math.max(1, values[0] + values[1]);
  const left = Math.round(values[0] / total * 100);
  return `<div class="stat-row"><div class="stat-label"><b>${values[0]}</b><span>${label}</span><b>${values[1]}</b></div><div class="bar"><i style="width:${left}%"></i><i style="width:${100-left}%"></i></div></div>`;
}

function lineChart(svg, points, threshold = null) {
  const data = points?.length ? points : [[0,0,0]];
  const width = 800, height = 220, pad = 22;
  const xs = data.map(p => p[0]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), xRange = Math.max(1, maxX-minX);
  const map = (x,y) => [pad + ((x-minX)/xRange)*(width-pad*2), height-pad-(Math.max(0,Math.min(100,y))/100)*(height-pad*2)];
  const path = index => data.map((point,i) => `${i?'L':'M'} ${map(point[0],point[index])[0].toFixed(1)} ${map(point[0],point[index])[1].toFixed(1)}`).join(' ');
  let grid = '';
  for (let y=0;y<=100;y+=25) {
    const yy=map(minX,y)[1];
    grid += `<line x1="${pad}" y1="${yy}" x2="${width-pad}" y2="${yy}" stroke="#233137"/><text x="2" y="${yy+3}" fill="#6f8580" font-size="9">${y}</text>`;
  }
  const th = threshold === null ? '' : `<line x1="${pad}" y1="${map(minX,threshold)[1]}" x2="${width-pad}" y2="${map(minX,threshold)[1]}" stroke="#f4c84b" stroke-width="1.5" stroke-dasharray="7 6"/>`;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  svg.innerHTML = `${grid}${th}<path d="${path(1)}" fill="none" stroke="#00df91" stroke-width="3"/><path d="${path(2)}" fill="none" stroke="#55c8ff" stroke-width="2.5"/>`;
}

function renderMetrics() {
  $('#metricLive').textContent = matches.length;
  $('#metricStats').textContent = matches.filter(m => m.coreStatsComplete).length;
  $('#metricWindow').textContent = matches.filter(m => m.minute >= config.minuteMin && m.minute <= config.minuteMax).length;
  const states = matches.map(m => decide(m).decision);
  $('#metricWatch').textContent = states.filter(s => s === 'WATCH').length;
  $('#metricNear').textContent = states.filter(s => s === 'NEAR').length;
  $('#metricSignal').textContent = states.filter(s => s === 'SHADOW SIGNAL').length;
}

function renderCandidates() {
  if (!matches.length) {
    $('#candidateList').innerHTML = '<div class="footer-note">เครื่อง 3.1 กำลังหมุน · ยังไม่พบ Goaloo live record ที่ parser อ่านได้ในรอบล่าสุด</div>';
    return;
  }
  $('#candidateList').innerHTML = matches.map((m,index) => `<button class="candidate ${index===selected?'active':''}" data-index="${index}"><div class="candidate-top"><span class="candidate-minute">${m.minute?`${m.minute}'`:'LIVE'}</span><span class="state ${m.state.toLowerCase()}">${m.state}</span></div><div class="teams">${esc(m.home)} ${m.score[0]}–${m.score[1]} ${esc(m.away)}</div><div class="candidate-sub"><span>Momentum ${m.momentum}%</span><span>${esc(m.league)}</span></div><div class="spark">${spark(m.pressure)}</div></button>`).join('');
  document.querySelectorAll('.candidate').forEach(button => button.addEventListener('click', () => { selected = Number(button.dataset.index); render(); }));
}

function emptyDetail(message) {
  $('#homeTeam').textContent='—'; $('#awayTeam').textContent='—'; $('#matchMinute').textContent='WAITING'; $('#scoreText').textContent='—'; $('#leagueText').textContent=message;
  $('#sourceRow').innerHTML=''; $('#statsGrid').innerHTML=''; $('#evidenceGrid').innerHTML=''; $('#oddsGrid').innerHTML='<div class="footer-note">Waiting for Goaloo live data.</div>'; $('#events').innerHTML=''; $('#sourceTrace').textContent=message; $('#gateList').innerHTML=''; $('#finalDecision').textContent='WAIT'; $('#finalReason').textContent=message;
  lineChart($('#pressureChart'),[[0,0,0]],config.momentumMin); lineChart($('#dangerChart'),[[0,0,0]]);
}

function render() {
  renderMetrics();
  renderCandidates();
  if (!matches.length) return emptyDetail(runtime?.workerUrl ? 'Goaloo collector online · next scan every minute' : 'Worker endpoint not published yet');
  if (selected >= matches.length) selected = 0;
  const m = matches[selected];
  $('#homeTeam').textContent=m.home; $('#awayTeam').textContent=m.away; $('#matchMinute').textContent=m.minute?`${m.minute}' LIVE`:'LIVE'; $('#scoreText').textContent=`${m.score[0]} – ${m.score[1]}`; $('#leagueText').textContent=m.league;
  $('#sourceRow').innerHTML=m.sources.map(([key,value])=>`<div class="source-pill"><small>${esc(key)}</small><b>${esc(value)}</b></div>`).join('');
  $('#statsGrid').innerHTML=[['Possession %',m.stats.possession],['Attacks',m.stats.attacks],['Dangerous Attacks',m.stats.dangerous],['Shots',m.stats.shots],['Shots on Target',m.stats.sot],['Corners',m.stats.corners],['Red Cards',m.stats.red]].map(([label,values])=>barRow(label,values)).join('');
  lineChart($('#pressureChart'),m.pressure,config.momentumMin); lineChart($('#dangerChart'),m.danger);
  const d=decide(m);
  $('#evidenceGrid').innerHTML=[['DANGEROUS ATTACKS',d.evidence.dangerous,config.attackEvidenceDangerousAttacksMin],['SHOTS',d.evidence.shots,config.attackEvidenceShotsMin],['SHOTS ON TARGET',d.evidence.sot,config.attackEvidenceShotsOnTargetMin],['CORNERS',d.evidence.corners,config.attackEvidenceCornersMin]].map(([name,value,min])=>`<div class="evidence-card"><small>${name}</small><strong>${value>=0?'+':''}${value}</strong><span class="delta">need ≥${min}</span><div class="evidence-meter"><i style="width:${Math.min(100,Math.max(0,min?value/min*100:0))}%"></i></div></div>`).join('');
  $('#oddsGrid').innerHTML='<div class="odds-box"><small>1X2</small><b>N/A</b></div><div class="odds-box"><small>ASIAN HANDICAP</small><b>N/A</b></div><div class="odds-box"><small>OVER / UNDER</small><b>N/A</b></div>';
  $('#events').innerHTML='<div class="footer-note">Event parser phase 2.</div>';
  $('#sourceTrace').textContent=m.trace;
  $('#gateList').innerHTML=d.gates.map(([name,pass,text])=>`<div class="gate ${pass?'pass':''}"><span>${name}</span><b>${pass?'PASS':'WAIT'}</b><small>${esc(text)}</small></div>`).join('');
  $('#finalDecision').textContent=d.decision; $('#finalReason').textContent=d.reason;
}

async function loadRuntime() {
  const response = await fetch(`./runtime.json?t=${Date.now()}`, { cache:'no-store' });
  if (!response.ok) throw new Error(`runtime ${response.status}`);
  return response.json();
}

async function refresh() {
  try {
    runtime = runtime || await loadRuntime();
    if (!runtime?.workerUrl) return render();
    const stamp = Date.now();
    const [liveResponse,snapshotResponse,healthResponse] = await Promise.all([
      fetch(`${runtime.liveUrl}?t=${stamp}`,{cache:'no-store'}),
      fetch(`${runtime.workerUrl}/snapshots?t=${stamp}`,{cache:'no-store'}),
      fetch(`${runtime.healthUrl}?t=${stamp}`,{cache:'no-store'})
    ]);
    const live = liveResponse.ok ? await liveResponse.json() : {matches:[]};
    snapshots = snapshotResponse.ok ? (await snapshotResponse.json()).snapshots || [] : [];
    const health = healthResponse.ok ? await healthResponse.json() : null;
    matches = (live.matches || []).map(adapt).filter(m => m.home && m.away).sort((a,b)=>b.momentum-a.momentum);
    if (health) {
      $('#primarySource').textContent=`GOALOO · ${health.lastSuccess?'ONLINE':'WAIT'}`;
      $('#apiPolicy').textContent=`API OFF · CRON 1 MIN · ${health.cycleMs ?? '—'}ms`;
    }
    render();
  } catch (error) {
    console.error('CAR 3.1 refresh failed', error);
    render();
  }
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  ['odds','events','source'].forEach(name => { document.querySelector(`#tab-${name}`).hidden = name !== button.dataset.tab; });
}));

render();
refresh();
setInterval(refresh, 15000);
