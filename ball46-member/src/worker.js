const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const SOURCE_BASE = 'https://www.ball46.com';
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIRROR_TTL_MS = 15_000;
const MAX_DAILY_PAGES = 30;

let mirrorCache = null;

function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}
  });
}

function num(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cutoffWindow(nowMs=Date.now()) {
  const local = new Date(nowMs + BANGKOK_OFFSET_MS);
  let start = Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),12,0,0,0) - BANGKOK_OFFSET_MS;
  if (nowMs < start) start -= DAY_MS;
  return {start,end:start+DAY_MS};
}

function bangkokTime(ms) {
  try {
    return new Intl.DateTimeFormat('en-GB',{
      timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
    }).format(new Date(ms));
  } catch {
    return new Date(ms+BANGKOK_OFFSET_MS).toISOString().slice(11,19);
  }
}

function bangkokDate(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'
    }).format(new Date(ms));
  } catch {
    return new Date(ms+BANGKOK_OFFSET_MS).toISOString().slice(0,10);
  }
}

function pair(v) {
  if (!v || typeof v !== 'object') return {home:null,away:null};
  return {home:num(v.home??v.h??v[0]),away:num(v.away??v.a??v[1])};
}

function cleanStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {
    attacks:pair(raw.attacks??raw.attack),
    dangerousAttacks:pair(raw.dangerousAttacks??raw.dangerous_attacks??raw.dangerousAttack??raw.dangerous),
    shotsOnTarget:pair(raw.shotsOnTarget??raw.shots_on_target??raw.shotOnTarget??raw.sot),
    shotsOffTarget:pair(raw.shotsOffTarget??raw.shots_off_target??raw.shotOff??raw.off),
    possession:pair(raw.possession??raw.possessionPct??raw.possession_percent)
  };
  if (raw.half && typeof raw.half === 'object') out.half = cleanStats(raw.half);
  return out;
}

function cleanCorners(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    home:num(raw.home),away:num(raw.away),
    halfHome:num(raw.halfHome),halfAway:num(raw.halfAway)
  };
}

function cleanCards(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const side=v=>({
    yellow:num(v?.yellow)??0,
    red:num(v?.red)??0
  });
  return {home:side(raw.home),away:side(raw.away)};
}

function cleanScore(raw) {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return null;
  return {
    home:num(raw.home??raw.h),
    away:num(raw.away??raw.a),
    halfHome:num(raw.halfHome),
    halfAway:num(raw.halfAway)
  };
}

function marketCategory(row) {
  const key = String(row?.market??row?.providerMarket??'').toLowerCase();
  if (key.includes('corner')) return 'CORNERS';
  if (key.includes('card')) return 'CARDS';
  if (key.includes('btts')) return 'BTTS';
  if (key.includes('1x2')) return '1X2';
  if (/(^|_)(ah|asian)(_|$)/.test(key) || key.includes('handicap')) return 'AH';
  if (key.includes('over') || key.includes('under') || key.includes('goalline') || key.includes('goal_line') || key.includes('total')) return 'O/U';
  return 'OTHER';
}

function resultPnl(result,odds) {
  const o = num(odds);
  const r = String(result||'').toUpperCase();
  if (r === 'WIN') return o===null ? 0 : o-1;
  if (r === 'LOSS') return -1;
  if (r === 'HALF_WIN') return o===null ? 0 : (o-1)/2;
  if (r === 'HALF_LOSS') return -0.5;
  return 0;
}

function signalState(row) {
  const result = String(row?.result||'').toUpperCase();
  const terminal = ['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS','VOID'].includes(result);
  if (String(row?.status||'').toUpperCase() === 'SETTLED' || terminal) return 'FINISHED';
  const s = String(row?.mirrorStatus||'').toLowerCase();
  if (/(finished|ended|full.?time|\bft\b|after.?pen|\baet\b)/.test(s)) return 'FINISHED';
  if (/(live|in.?play|1h|2h|half.?time|\bht\b|break|paused|extra.?time|penalt)/.test(s)) return 'LIVE';
  if (num(row?.mirrorMinute)!==null && num(row?.mirrorMinute)>0) return 'LIVE';
  return 'WAITING';
}

function normalizeSignal(row) {
  const createdAt = num(row?.createdAt) ?? 0;
  const result = String(row?.result||'PENDING').toUpperCase();
  const entryMinute = num(row?.minute??row?.entryMinute);
  const category = marketCategory(row);
  return {
    id:String(row?.id||''),
    fixtureId:String(row?.fixtureId||''),
    createdAt,
    signalTime:bangkokTime(createdAt),
    league:[row?.league?.country,row?.league?.name].filter(Boolean).join(' · ') || '—',
    leagueData:row?.league && typeof row.league==='object' ? {
      id:row.league.id??null,name:row.league.name??null,country:row.league.country??null
    } : null,
    home:String(row?.home?.name||'HOME'),
    away:String(row?.away?.name||'AWAY'),
    homeId:row?.home?.id??null,
    awayId:row?.away?.id??null,
    market:category,
    sourceMarket:String(row?.market||''),
    marketLabel:String(row?.marketLabel||row?.market||category),
    providerMarket:String(row?.providerMarket||''),
    period:String(row?.period||''),
    selection:String(row?.selection||'—').toUpperCase(),
    line:num(row?.line),
    odds:num(row?.odds),
    bookmaker:String(row?.bookmaker||'—'),
    signalMinute:entryMinute,
    matchMinute:num(row?.mirrorMinute)??entryMinute,
    entryScore:cleanScore(row?.entryScore??row?.scoreAt),
    mirrorScore:cleanScore(row?.mirrorScore),
    finalScore:cleanScore(row?.finalScore),
    entryStats:cleanStats(row?.entryStats??row?.statisticsAtEntry),
    entryCorners:cleanCorners(row?.entryCorners),
    entryCards:cleanCards(row?.entryCards),
    mirrorMinute:num(row?.mirrorMinute),
    mirrorStatus:row?.mirrorStatus??null,
    state:signalState(row),
    status:String(row?.status||'PENDING').toUpperCase(),
    result,
    settledAt:num(row?.settledAt),
    pnl:Number(resultPnl(result,row?.odds).toFixed(3))
  };
}

function dailySummary(rows) {
  const out = {};
  for (const market of MARKET_ORDER) {
    const scoped = market === 'ALL' ? rows : rows.filter(r=>r.market===market);
    const counts = {signals:scoped.length,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0};
    let pnl = 0;
    for (const row of scoped) {
      pnl += Number(row.pnl||0);
      if (row.result === 'WIN') counts.win++;
      else if (row.result === 'LOSS') counts.loss++;
      else if (row.result === 'PUSH') counts.push++;
      else if (row.result === 'HALF_WIN') counts.halfWin++;
      else if (row.result === 'HALF_LOSS') counts.halfLoss++;
      else counts.pending++;
    }
    const decided = counts.win + counts.loss + counts.halfWin + counts.halfLoss;
    const winPoints = counts.win + counts.halfWin * 0.5;
    out[market] = {
      ...counts,
      winRate: decided ? Number((winPoints / decided * 100).toFixed(1)) : null,
      pnl:Number(pnl.toFixed(2))
    };
  }
  return out;
}

async function sourceJson(path,params={}) {
  const url = new URL(path,SOURCE_BASE);
  for (const [k,v] of Object.entries(params)) if (v!==null && v!==undefined && v!=='') url.searchParams.set(k,String(v));
  url.searchParams.set('_member_mirror',String(Date.now()));
  const r = await fetch(url.toString(),{
    cache:'no-store',
    headers:{accept:'application/json','cache-control':'no-cache'}
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok || !j || j.ok===false) throw new Error(j?.error||('SOURCE_HTTP_'+r.status));
  return j;
}

async function loadDailyMirror(force=false) {
  const nowMs = Date.now();
  const cycle = cutoffWindow(nowMs);
  if (!force && mirrorCache && mirrorCache.cycleStart===cycle.start && mirrorCache.expiresAt>nowMs) {
    return mirrorCache.payload;
  }

  const unique = new Map();
  let cursor = null;
  let pagesRead = 0;
  let lastMeta = null;
  let hasMore = true;

  while (hasMore && pagesRead < MAX_DAILY_PAGES) {
    const page = await sourceJson('/api/engine/statistics',{
      paged:1,
      cursor:cursor||undefined
    });
    pagesRead++;
    lastMeta = page;
    const rows = Array.isArray(page.rows) ? page.rows : [];
    let oldest = Infinity;

    for (const row of rows) {
      const createdAt = num(row?.createdAt);
      if (createdAt===null) continue;
      oldest = Math.min(oldest,createdAt);
      if (createdAt >= cycle.start && createdAt < cycle.end && row?.id) {
        const id=String(row.id);
        if (!unique.has(id)) unique.set(id,row);
      }
    }

    hasMore = page.hasMore===true && Boolean(page.nextCursor);
    cursor = page.nextCursor || null;
    if (!rows.length || oldest < cycle.start) break;
  }

  if (hasMore && pagesRead >= MAX_DAILY_PAGES) throw new Error('DAILY_MIRROR_PAGE_LIMIT');

  let signals = [...unique.values()]
    .map(normalizeSignal)
    .filter(r=>r.id && r.fixtureId)
    .sort((a,b)=>b.createdAt-a.createdAt);

  // Current Ball46 board is authoritative for matches that are still live.
  // This prevents stale ledger/mirror status from labeling an active match as FINISHED.
  try {
    const board = await sourceJson('/api/engine/board');
    const byFixture = new Map((Array.isArray(board?.fixtures)?board.fixtures:[]).map(f=>[String(f?.fixtureId||''),f]));
    signals = signals.map(s=>{
      const f = byFixture.get(String(s.fixtureId));
      if (!f) return s;
      const rawStatus = String(f.status??f.statusCode??f.boardState??'');
      const probe = {
        status:'PENDING',
        result:'PENDING',
        mirrorStatus:rawStatus,
        mirrorMinute:num(f.minute)
      };
      const currentState = signalState(probe);
      return {
        ...s,
        state:currentState,
        matchMinute:num(f.minute)??s.matchMinute,
        mirrorMinute:num(f.minute)??s.mirrorMinute,
        mirrorStatus:rawStatus||s.mirrorStatus,
        mirrorScore:cleanScore(f?.goals??f?.score)??s.mirrorScore
      };
    });
  } catch {
    // Keep ledger-derived state if current board is temporarily unavailable.
  }

  const payload = {
    ok:true,
    prototype:false,
    source:'BALL46_PRODUCTION_LEDGER_V2',
    sourceEndpoint:'/api/engine/statistics?paged=1',
    sourceStatistics:lastMeta?.statisticsSource||null,
    day:bangkokDate(cycle.start),
    timezone:'Asia/Bangkok',
    cutoffLocal:'12:00',
    cycleStart:cycle.start,
    cycleEnd:cycle.end,
    generatedAt:nowMs,
    pagesRead,
    signalCount:signals.length,
    summary:dailySummary(signals),
    signals
  };

  mirrorCache={cycleStart:cycle.start,expiresAt:nowMs+MIRROR_TTL_MS,payload};
  return payload;
}

function cleanEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.slice().sort((a,b)=>{
    const am=num(a?.minute??a?.elapsed??a?.time?.elapsed)??0;
    const bm=num(b?.minute??b?.elapsed??b?.time?.elapsed)??0;
    return bm-am;
  }).slice(0,20).map(e=>{
    const team=e?.team??e?.team_name;
    return {
      minute:num(e?.minute??e?.elapsed??e?.time?.elapsed),
      type:String(e?.type??e?.event??e?.name??e?.detail??'Match event'),
      team:typeof team==='object' ? String(team?.name||'') : String(team||'')
    };
  });
}

function cleanHistoryRow(row) {
  return {
    at:num(row?.at),
    minute:num(row?.minute),
    attacks:pair(row?.attacks),
    dangerousAttacks:pair(row?.dangerousAttacks),
    shotsOnTarget:pair(row?.shotsOnTarget),
    shotsOffTarget:pair(row?.shotsOffTarget),
    corners:pair(row?.corners),
    possession:pair(row?.possession),
    goals:cleanScore(row?.goals),
    cards:cleanCards(row?.cards)
  };
}

async function loadMatchDetail(fixtureId) {
  const [boardResult,historyResult] = await Promise.allSettled([
    sourceJson('/api/engine/board'),
    sourceJson('/api/engine/history',{fixtureId,window:10})
  ]);

  let featured = null;
  if (boardResult.status==='fulfilled') {
    const board=boardResult.value;
    const f=(Array.isArray(board?.fixtures)?board.fixtures:[]).find(x=>String(x?.fixtureId??'')===String(fixtureId));
    if (f) {
      featured={
        fixtureId:String(f.fixtureId),
        minute:num(f.minute),
        status:String(f.status??f.statusCode??f.boardState??''),
        home:String(f?.home?.name||'HOME'),
        away:String(f?.away?.name||'AWAY'),
        league:[f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')||'—',
        score:cleanScore(f?.goals??f?.score),
        statistics:cleanStats(f?.statistics),
        corners:cleanCorners(f?.corners),
        cards:cleanCards(f?.cards),
        events:cleanEvents(f?.events)
      };
    }
  }

  let eventFlow = null;
  if (historyResult.status==='fulfilled' && historyResult.value?.ok===true) {
    const h=historyResult.value;
    eventFlow={
      version:h.version||null,
      retainedMinutes:num(h.retainedMinutes),
      pressureWindowMinutes:num(h.pressureWindowMinutes),
      rows:(Array.isArray(h.rows)?h.rows:[]).map(cleanHistoryRow),
      pressure:(Array.isArray(h.pressure)?h.pressure:[]).map(p=>({
        at:num(p?.at),minute:num(p?.minute),home:num(p?.home),away:num(p?.away),windowMinutes:num(p?.windowMinutes)
      }))
    };
  }

  return {
    ok:true,
    source:'BALL46_PRODUCTION_MIRROR',
    fixtureId:String(fixtureId),
    featured,
    eventFlow,
    available:Boolean(featured||eventFlow),
    generatedAt:Date.now()
  };
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-robots-tag','noindex, nofollow, noarchive');
  headers.set('referrer-policy','strict-origin-when-cross-origin');
  headers.set('x-content-type-options','nosniff');
  headers.set('permissions-policy','camera=(), microphone=(), geolocation=()');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function staticResponse(request,env,path) {
  const url = new URL(request.url);
  url.pathname = path;
  const assetReq = new Request(url.toString(),{method:request.method,headers:request.headers});
  return withSecurityHeaders(await env.ASSETS.fetch(assetReq));
}

async function createStripeCheckout(request,env) {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID) {
    return json({ok:false,error:'STRIPE_NOT_CONFIGURED'},503);
  }
  const origin = new URL(request.url).origin;
  const form = new URLSearchParams();
  form.set('mode','subscription');
  form.set('line_items[0][price]',env.STRIPE_PRICE_ID);
  form.set('line_items[0][quantity]','1');
  form.set('success_url',origin + '/success?session_id={CHECKOUT_SESSION_ID}');
  form.set('cancel_url',origin + '/pricing?canceled=1');
  form.set('allow_promotion_codes','true');
  const stripe = await fetch('https://api.stripe.com/v1/checkout/sessions',{
    method:'POST',
    headers:{
      authorization:'Bearer ' + env.STRIPE_SECRET_KEY,
      'content-type':'application/x-www-form-urlencoded'
    },
    body:form.toString()
  });
  const payload = await stripe.json();
  if (!stripe.ok || !payload?.url) {
    return json({ok:false,error:'STRIPE_CHECKOUT_FAILED',detail:payload?.error?.message||null},502);
  }
  return json({ok:true,url:payload.url});
}

export default {
  async fetch(request,env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      return json({ok:true,service:'ball46-member-production',stage:env.APP_STAGE||'unknown'});
    }

    if (url.pathname === '/api/member/session') {
      const prototype = (env.APP_STAGE||'prototype') === 'prototype';
      return json({
        ok:true,
        authenticated:prototype,
        member:prototype ? {
          displayName:env.DEMO_MEMBER_NAME||'JAY',
          status:'ACTIVE',
          plan:'BALL46 MEMBER',
          prototype:true
        } : null
      });
    }

    if (url.pathname === '/api/member/daily') {
      try {
        return json(await loadDailyMirror(url.searchParams.get('refresh')==='1'));
      } catch (e) {
        if (mirrorCache?.payload) return json({...mirrorCache.payload,stale:true,mirrorError:String(e?.message||e)});
        return json({ok:false,error:'DAILY_MIRROR_UNAVAILABLE',detail:String(e?.message||e)},502);
      }
    }

    if (url.pathname === '/api/member/match') {
      const fixtureId=String(url.searchParams.get('fixtureId')||'').trim();
      if (!fixtureId) return json({ok:false,error:'FIXTURE_ID_REQUIRED'},400);
      try {
        return json(await loadMatchDetail(fixtureId));
      } catch (e) {
        return json({ok:false,error:'MATCH_MIRROR_UNAVAILABLE',detail:String(e?.message||e)},502);
      }
    }

    if (url.pathname === '/api/stripe/checkout' && request.method === 'POST') {
      return createStripeCheckout(request,env);
    }

    if (url.pathname === '/api/stripe/webhook') {
      return json({ok:false,error:'WEBHOOK_NOT_ENABLED_IN_PROTOTYPE'},501);
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    }

    if (url.pathname === '/' || url.pathname === '/pricing') return staticResponse(request,env,'/pricing.html');
    if (url.pathname === '/member') return staticResponse(request,env,'/member.html');
    if (url.pathname === '/login') return staticResponse(request,env,'/login.html');
    if (url.pathname === '/success') return staticResponse(request,env,'/success.html');

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
