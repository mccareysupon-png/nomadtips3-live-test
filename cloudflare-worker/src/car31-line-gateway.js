const LINE_PUSH_URL='https://api.line.me/v2/bot/message/push';
const CUTOVER_AT='2026-08-16T04:57:44.000Z';
const CUTOVER_MS=Date.parse(CUTOVER_AT);

const MEMBERSHIP_SQL=`
CREATE TABLE IF NOT EXISTS paid_memberships (
  activation_id TEXT PRIMARY KEY,
  activation_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'INITIATED',
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_payment_status TEXT,
  line_user_id TEXT UNIQUE,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  activated_at INTEGER,
  updated_at INTEGER NOT NULL
)`;

const SUBSCRIBERS_SQL=`
CREATE TABLE IF NOT EXISTS line_subscribers (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  subscribed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`;

const DELIVERIES_SQL=`
CREATE TABLE IF NOT EXISTS car31_line_deliveries (
  delivery_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  signal_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at INTEGER,
  error TEXT,
  updated_at INTEGER NOT NULL
)`;

const STATE_SQL=`
CREATE TABLE IF NOT EXISTS car31_line_gateway_state (
  state_key TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`;

let schemaReady=false;

const ms=value=>{
  if(value===null||value===undefined||value==='')return 0;
  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>1e11)return numeric;
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?parsed:0;
};

const n=value=>{
  const numeric=Number(value);
  return Number.isFinite(numeric)?numeric:null;
};

function scoreText(score){
  const home=n(score?.home),away=n(score?.away);
  return home===null||away===null?'—':`${home}-${away}`;
}

function marketText(record){
  const market=String(record?.market||'').toUpperCase()||'—';
  const line=n(record?.selectedLine??record?.line);
  const direction=String(record?.ouDirection||'').toUpperCase();
  if(market==='AH'&&line!==null)return`AH ${line>=0?'+':''}${line}`;
  if(market==='OU'&&line!==null)return`${direction||'O/U'} ${line}`;
  return market;
}

function signalText(record){
  const minute=n(record?.entryMinute);
  const momentum=n(record?.momentum);
  const odds=n(record?.odds);
  return [
    '⚡ NOMADTIPS3 LIVE SIGNAL',
    '',
    `${record?.home||'HOME'} (HOME) vs ${record?.away||'AWAY'} (AWAY)`,
    `Selected: ${record?.selectedTeam||'—'} (${String(record?.selectedSide||'—').toUpperCase()})`,
    `Minute: ${minute===null?'—':`${minute}′`} | Score: ${scoreText(record?.entryScore)}`,
    `Market: ${marketText(record)}${odds===null?'':` @ ${odds.toFixed(2)}`}`,
    `Momentum: ${momentum===null?'—':`${Math.round(momentum)}%`}`,
    '',
    'Status: PENDING'
  ].join('\n');
}

function resultText(record){
  const group=String(record?.resultGroup||record?.result||'VOID').toUpperCase();
  const exact=String(record?.settlementResult||'').toUpperCase();
  const icon=group==='WIN'?'✅':group==='LOSS'?'❌':group==='DRAW'?'➖':'⚪';
  const odds=n(record?.odds);
  return [
    `${icon} NOMADTIPS3 RESULT`,
    '',
    `${record?.home||'HOME'} (HOME) vs ${record?.away||'AWAY'} (AWAY)`,
    `Selected: ${record?.selectedTeam||'—'} (${String(record?.selectedSide||'—').toUpperCase()})`,
    `Final Score: ${scoreText(record?.finalScore)}`,
    `Market: ${marketText(record)}${odds===null?'':` @ ${odds.toFixed(2)}`}`,
    `Result: ${group}${exact&&exact!==group?` · ${exact}`:''}`
  ].join('\n');
}

async function ensureSchema(env){
  if(!env?.DB)throw new Error('Signal Hub requires DB binding');
  if(schemaReady)return;
  await env.DB.batch([
    env.DB.prepare(MEMBERSHIP_SQL),
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare(DELIVERIES_SQL),
    env.DB.prepare(STATE_SQL)
  ]);
  schemaReady=true;
}

async function saveStatus(env,status){
  if(!env?.DB)return;
  try{
    await ensureSchema(env);
    const now=Date.now();
    await env.DB.prepare(`
      INSERT INTO car31_line_gateway_state (state_key,state_json,updated_at)
      VALUES ('status',?,?)
      ON CONFLICT(state_key) DO UPDATE SET
        state_json=excluded.state_json,
        updated_at=excluded.updated_at
    `).bind(JSON.stringify(status),now).run();
  }catch(error){
    console.warn(JSON.stringify({event:'car31_line_status_write_failed',error:String(error?.message||error)}));
  }
}

async function readStatus(env){
  if(!env?.DB)return null;
  try{
    await ensureSchema(env);
    const row=await env.DB.prepare(`SELECT state_json FROM car31_line_gateway_state WHERE state_key='status' LIMIT 1`).first();
    return row?.state_json?JSON.parse(row.state_json):null;
  }catch{return null;}
}

async function fetchCar31History(env){
  if(!env?.CAR31_SOURCE)throw new Error('CAR 3.1 service binding is not configured');
  const request=new Request(`https://car31.internal/history?page=1&limit=100&t=${Date.now()}`,{
    method:'GET',
    headers:{accept:'application/json'}
  });
  const response=await env.CAR31_SOURCE.fetch(request);
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.ok||!Array.isArray(payload?.records)){
    throw new Error(`CAR 3.1 history unavailable through service binding: HTTP ${response.status}`);
  }
  return payload.records;
}

async function eligibleSubscribers(env){
  const result=await env.DB.prepare(`
    SELECT
      ls.user_id AS user_id,
      MAX(COALESCE(pm.activated_at,pm.paid_at,ls.subscribed_at)) AS entitled_at
    FROM line_subscribers ls
    INNER JOIN paid_memberships pm
      ON pm.line_user_id=ls.user_id
      AND pm.status='ACTIVE'
    WHERE ls.active=1
    GROUP BY ls.user_id
    ORDER BY entitled_at ASC
  `).all();
  return result.results||[];
}

async function alreadySent(env,key){
  const row=await env.DB.prepare(`
    SELECT 1 AS ok FROM car31_line_deliveries
    WHERE delivery_key=? AND status='SENT'
    LIMIT 1
  `).bind(key).first();
  return Boolean(row?.ok);
}

async function saveDelivery(env,key,userId,signalKey,eventType,status,error=null){
  const now=Date.now();
  await env.DB.prepare(`
    INSERT INTO car31_line_deliveries
      (delivery_key,user_id,signal_key,event_type,status,sent_at,error,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(delivery_key) DO UPDATE SET
      status=excluded.status,
      sent_at=excluded.sent_at,
      error=excluded.error,
      updated_at=excluded.updated_at
  `).bind(
    key,userId,signalKey,eventType,status,
    status==='SENT'?now:null,
    error?String(error).slice(0,500):null,
    now
  ).run();
}

async function pushText(env,userId,text){
  if(!env?.LINE_CHANNEL_ACCESS_TOKEN)throw new Error('LINE_CHANNEL_ACCESS_TOKEN is unavailable in Signal Hub');
  const response=await fetch(LINE_PUSH_URL,{
    method:'POST',
    headers:{authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,'content-type':'application/json'},
    body:JSON.stringify({to:userId,messages:[{type:'text',text:String(text).slice(0,5000)}]})
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(payload?.message||`LINE HTTP ${response.status}`);
}

async function sendOnce(env,subscriber,record,eventType,text){
  const signalKey=String(record?.key||`${record?.id||'unknown'}:${record?.selectedSide||'SIDE'}:${record?.market||'MARKET'}:${record?.selectedAt||''}`);
  const deliveryKey=`CAR31:${eventType}:${signalKey}:${subscriber.user_id}`;
  if(await alreadySent(env,deliveryKey))return{sent:false,duplicate:true};
  try{
    await pushText(env,subscriber.user_id,text);
    await saveDelivery(env,deliveryKey,subscriber.user_id,signalKey,eventType,'SENT');
    return{sent:true,duplicate:false};
  }catch(error){
    await saveDelivery(env,deliveryKey,subscriber.user_id,signalKey,eventType,'FAILED',error?.message||error);
    return{sent:false,duplicate:false,failed:true,error:String(error?.message||error)};
  }
}

export async function runCar31LineGateway(env){
  const startedAt=new Date().toISOString();
  const base={
    ok:false,
    source:'CAR3.1_HISTORY',
    sender:'SIGNAL_HUB',
    transport:'SERVICE_BINDING',
    entitlement:'PAID_ACTIVE',
    cutoverAt:CUTOVER_AT,
    dbConfigured:Boolean(env?.DB),
    tokenConfigured:Boolean(env?.LINE_CHANNEL_ACCESS_TOKEN),
    serviceConfigured:Boolean(env?.CAR31_SOURCE),
    car31FetchOk:false,
    eligibleMembers:0,
    candidateRecords:0,
    signalSent:0,
    resultSent:0,
    failed:0,
    startedAt,
    lastRunAt:startedAt
  };

  if(!env?.DB||!env?.LINE_CHANNEL_ACCESS_TOKEN||!env?.CAR31_SOURCE){
    const status={...base,error:'Signal Hub DB, LINE token, or CAR 3.1 service binding is not configured'};
    await saveStatus(env,status);
    return status;
  }

  try{
    await ensureSchema(env);
    const [records,subscribers]=await Promise.all([fetchCar31History(env),eligibleSubscribers(env)]);
    const candidates=records.filter(record=>ms(record?.selectedAt)>=CUTOVER_MS);
    let signalSent=0,resultSent=0,failed=0;

    for(const subscriber of subscribers){
      const entitledAt=Number(subscriber.entitled_at||0);
      for(const record of candidates){
        const selectedAt=ms(record?.selectedAt);
        if(!selectedAt||selectedAt<entitledAt)continue;

        const signal=await sendOnce(env,subscriber,record,'SIGNAL',signalText(record));
        if(signal.sent)signalSent+=1;
        if(signal.failed)failed+=1;

        const group=String(record?.resultGroup||record?.result||'PENDING').toUpperCase();
        const settled=Boolean(record?.settledAt)&&group!=='PENDING';
        if(settled){
          const result=await sendOnce(env,subscriber,record,'RESULT',resultText(record));
          if(result.sent)resultSent+=1;
          if(result.failed)failed+=1;
        }
      }
    }

    const status={
      ...base,
      ok:true,
      car31FetchOk:true,
      eligibleMembers:subscribers.length,
      candidateRecords:candidates.length,
      signalSent,
      resultSent,
      failed,
      lastRunAt:new Date().toISOString()
    };
    await saveStatus(env,status);
    return status;
  }catch(error){
    const status={...base,error:String(error?.message||error),lastRunAt:new Date().toISOString()};
    await saveStatus(env,status);
    console.warn(JSON.stringify({event:'car31_line_gateway_failed',error:status.error}));
    return status;
  }
}

export async function handleCar31LineGatewayRoute(request,env){
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/car31-line-status')return null;
  const status=await readStatus(env);
  return new Response(JSON.stringify({
    ok:true,
    gateway:status||{
      ok:false,
      source:'CAR3.1_HISTORY',
      sender:'SIGNAL_HUB',
      transport:'SERVICE_BINDING',
      entitlement:'PAID_ACTIVE',
      cutoverAt:CUTOVER_AT,
      dbConfigured:Boolean(env?.DB),
      tokenConfigured:Boolean(env?.LINE_CHANNEL_ACCESS_TOKEN),
      serviceConfigured:Boolean(env?.CAR31_SOURCE),
      status:'WAITING_FIRST_CRON'
    }
  },null,2),{
    status:200,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':'*'}
  });
}
