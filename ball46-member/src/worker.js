const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];

const DEMO_SIGNALS = [
  {id:'b46-0012',signalTime:'14:32:18',league:'Premier League',home:'Arsenal',away:'Chelsea',matchMinute:78,market:'AH',selection:'HOME',line:'-0.5',odds:1.86,bookmaker:'Bet365',signalMinute:76,state:'LIVE',result:'PENDING',pnl:0},
  {id:'b46-0011',signalTime:'14:28:04',league:'Serie A',home:'Milan',away:'Roma',matchMinute:74,market:'AH',selection:'AWAY',line:'+0.25',odds:1.91,bookmaker:'Crown',signalMinute:72,state:'FINISHED',result:'WIN',pnl:0.91},
  {id:'b46-0010',signalTime:'14:21:37',league:'La Liga',home:'Barcelona',away:'Atletico Madrid',matchMinute:81,market:'O/U',selection:'OVER',line:'2.5',odds:1.88,bookmaker:'12BET',signalMinute:79,state:'LIVE',result:'PENDING',pnl:0},
  {id:'b46-0009',signalTime:'14:17:09',league:'Bundesliga',home:'Dortmund',away:'Leipzig',matchMinute:86,market:'CORNERS',selection:'OVER',line:'9.5',odds:1.83,bookmaker:'EasyBet',signalMinute:83,state:'FINISHED',result:'LOSS',pnl:-1},
  {id:'b46-0008',signalTime:'14:11:45',league:'Ligue 1',home:'Lyon',away:'Monaco',matchMinute:69,market:'1X2',selection:'HOME',line:'—',odds:2.15,bookmaker:'Betsson',signalMinute:66,state:'FINISHED',result:'WIN',pnl:1.15},
  {id:'b46-0007',signalTime:'14:05:31',league:'Premier League',home:'Liverpool',away:'Everton',matchMinute:64,market:'BTTS',selection:'YES',line:'—',odds:1.79,bookmaker:'Bet365',signalMinute:62,state:'FINISHED',result:'PUSH',pnl:0},
  {id:'b46-0006',signalTime:'13:58:26',league:'Serie A',home:'Napoli',away:'Inter',matchMinute:73,market:'CARDS',selection:'OVER',line:'4.5',odds:1.94,bookmaker:'12BET',signalMinute:70,state:'FINISHED',result:'HALF_WIN',pnl:0.47},
  {id:'b46-0005',signalTime:'13:52:03',league:'La Liga',home:'Sevilla',away:'Villarreal',matchMinute:59,market:'AH',selection:'HOME',line:'0',odds:1.82,bookmaker:'Crown',signalMinute:56,state:'FINISHED',result:'HALF_LOSS',pnl:-0.5},
  {id:'b46-0004',signalTime:'13:45:17',league:'Eredivisie',home:'Ajax',away:'PSV',matchMinute:51,market:'O/U',selection:'UNDER',line:'3.5',odds:1.85,bookmaker:'EasyBet',signalMinute:48,state:'FINISHED',result:'WIN',pnl:0.85},
  {id:'b46-0003',signalTime:'13:39:50',league:'Champions League',home:'Real Madrid',away:'Bayern',matchMinute:44,market:'1X2',selection:'DRAW',line:'—',odds:3.05,bookmaker:'Betsson',signalMinute:42,state:'FINISHED',result:'LOSS',pnl:-1},
  {id:'b46-0002',signalTime:'13:31:12',league:'Premier League',home:'Newcastle',away:'Tottenham',matchMinute:37,market:'CORNERS',selection:'OVER',line:'8.5',odds:1.76,bookmaker:'Bet365',signalMinute:35,state:'FINISHED',result:'WIN',pnl:0.76},
  {id:'b46-0001',signalTime:'13:22:41',league:'La Liga',home:'Valencia',away:'Betis',matchMinute:28,market:'OTHER',selection:'HOME TEAM TOTAL OVER',line:'0.5',odds:1.81,bookmaker:'12BET',signalMinute:25,state:'FINISHED',result:'WIN',pnl:0.81}
];

function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{
    status,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}
  });
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
      pnl: Number(pnl.toFixed(2))
    };
  }
  return out;
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
      const rows = [...DEMO_SIGNALS].sort((a,b)=>b.signalTime.localeCompare(a.signalTime));
      return json({
        ok:true,
        day:'TODAY',
        timezone:'Ball46 cutoff timezone',
        prototype:true,
        summary:dailySummary(rows),
        signals:rows
      });
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
