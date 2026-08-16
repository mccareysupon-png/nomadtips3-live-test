const LINE_PUSH_URL='https://api.line.me/v2/bot/message/push';
const DAY_MS=24*60*60*1000;
const RETRY_WINDOW_MS=30*DAY_MS;

const SUBSCRIBERS_SQL=`
CREATE TABLE IF NOT EXISTS line_subscribers (
  user_id TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 1,
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

let schemaReady=false;

const ms=value=>{
  if(value===null||value===undefined||value==='')return 0;
  const numeric=Number(value);
  if(Number.isFinite(numeric)&&numeric>1e11)return numeric;
  const parsed=Date.parse(String(value));
  return Number.isFinite(parsed)?parsed:0;
};

const n=(value,fallback=null)=>{
  const numeric=Number(value);
  return Number.isFinite(numeric)?numeric:fallback;
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
  if(!env?.DB)throw new Error('CAR 3.1 LINE requires DB binding');
  if(schemaReady)return;
  await env.DB.batch([
    env.DB.prepare(SUBSCRIBERS_SQL),
    env.DB.prepare(DELIVERIES_SQL)
  ]);
  schemaReady=true;
}

async function pushText(env,userId,text){
  if(!env?.LINE_CHANNEL_ACCESS_TOKEN)throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
  const response=await fetch(LINE_PUSH_URL,{
    method:'POST',
    headers:{
      authorization:`Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'content-type':'application/json'
    },
    body:JSON.stringify({to:userId,messages:[{type:'text',text:String(text).slice(0,5000)}]})
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(payload?.message||`LINE HTTP ${response.status}`);
}

async function alreadySent(env,key){
  const row=await env.DB.prepare(
    `SELECT status FROM car31_line_deliveries WHERE delivery_key = ? AND status = 'SENT' LIMIT 1`
  ).bind(key).first();
  return Boolean(row);
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

async function sendOnce(env,subscriber,record,eventType,text){
  const signalKey=String(record?.key||`${record?.id||'unknown'}:${record?.selectedSide||'SIDE'}:${record?.market||'MARKET'}`);
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

export async function notifyCar31History(env,records,{activatedAt}={}){
  const at=new Date().toISOString();
  const activationMs=ms(activatedAt);
  if(!env?.DB||!env?.LINE_CHANNEL_ACCESS_TOKEN){
    return{
      source:'CAR31',configured:false,dbConfigured:Boolean(env?.DB),tokenConfigured:Boolean(env?.LINE_CHANNEL_ACCESS_TOKEN),
      subscribers:0,candidates:0,signalSent:0,resultSent:0,failed:0,lastRunAt:at
    };
  }

  await ensureSchema(env);
  const query=await env.DB.prepare(`
    SELECT user_id,subscribed_at
    FROM line_subscribers
    WHERE active = 1
    ORDER BY subscribed_at ASC
  `).all();
  const subscribers=query.results||[];
  const now=Date.now();
  const floor=Math.max(activationMs||now,now-RETRY_WINDOW_MS);
  const candidates=(Array.isArray(records)?records:[]).filter(record=>{
    const selected=ms(record?.selectedAt);
    return selected>=floor;
  });

  let signalSent=0,resultSent=0,failed=0;
  for(const subscriber of subscribers){
    const subscribedAt=Number(subscriber.subscribed_at||0);
    for(const record of candidates){
      const selectedAt=ms(record?.selectedAt);
      if(!selectedAt||selectedAt<subscribedAt||selectedAt<activationMs)continue;

      const signal=await sendOnce(env,subscriber,record,'SIGNAL',signalText(record));
      if(signal.sent)signalSent+=1;
      if(signal.failed)failed+=1;

      const settled=Boolean(record?.settledAt)&&String(record?.resultGroup||record?.result||'PENDING').toUpperCase()!=='PENDING';
      if(settled){
        const result=await sendOnce(env,subscriber,record,'RESULT',resultText(record));
        if(result.sent)resultSent+=1;
        if(result.failed)failed+=1;
      }
    }
  }

  return{
    source:'CAR31',configured:true,dbConfigured:true,tokenConfigured:true,
    subscribers:subscribers.length,candidates:candidates.length,signalSent,resultSent,failed,lastRunAt:at
  };
}
