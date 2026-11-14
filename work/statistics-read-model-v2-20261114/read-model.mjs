// TEST ONLY: immutable, complete-ledger read-model. No provider or Cloudflare writes.
// It is built outside the user's page request. Ledger and financial formulas remain authoritative.
const VALID=['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'];
const GROUPS=['all','1x2','ah','ou','btts','corners','cards','other'];
const safeNumber=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
export function dateMs(v){const n=safeNumber(v);if(n!==null)return n<1e12?n*1000:n;const p=Date.parse(String(v||''));return Number.isFinite(p)?p:0;}
export function outcome(r){return String(r?.result||r?.settlement||r?.outcome||'').trim().toUpperCase();}
export function isSettled(r){const s=String(r?.status||'').toUpperCase();return(!s||s==='SETTLED')&&VALID.includes(outcome(r));}
export function familyOf(row,registry){const named=registry?.resolve?.(row)?.family;if(named&&GROUPS.includes(named))return named;const x=String(row?.marketLabel||row?.market||row?.providerMarket||'').toLowerCase();if(/corner/.test(x))return'corners';if(/card/.test(x))return'cards';if(/btts|both teams/.test(x))return'btts';if(/asian|handicap|\bah\b/.test(x))return'ah';if(/over|under|o\/u|total/.test(x))return'ou';if(/1x2|match result|moneyline|winner|3way|three way/.test(x))return'1x2';return'other';}
export function selectionOf(row){const x=String(row?.selection||row?.pick||'').trim().toUpperCase();if(x.includes('HOME'))return'home';if(x.includes('AWAY'))return'away';if(x.includes('DRAW')||x==='X')return'draw';if(x.includes('OVER'))return'over';if(x.includes('UNDER'))return'under';if(x==='YES'||x.includes('BTTS YES'))return'yes';if(x==='NO'||x.includes('BTTS NO'))return'no';return x.toLowerCase().replace(/[^a-z0-9]+/g,'_')||'other';}
export function financial(row){const result=outcome(row),odds=safeNumber(row?.odds);if(result==='PUSH'||result==='VOID')return{profit:0,stake:1,priced:true};if(result==='LOSS')return{profit:-1,stake:1,priced:true};if(result==='HALF_LOSS')return{profit:-0.5,stake:1,priced:true};if(result==='WIN'||result==='HALF_WIN'){if(odds===null||odds<=1)return{profit:null,stake:0,priced:false};return{profit:(odds-1)*(result==='HALF_WIN'?0.5:1),stake:1,priced:true}}return{profit:null,stake:0,priced:false};}
const key=(market='all',variant='all',filter='all')=>JSON.stringify([market,variant,filter]);
function keysFor(r,registry){const market=familyOf(r,registry),variant=registry?.resolve?.(r)?.key||'other',filter=selectionOf(r);return [...new Set([key(),key(market),key(market,variant),key(market,'all',filter),key(market,variant,filter)])];}
function empty(){return {ledgerTotal:0,settledTotal:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,priced:0,stake:0,net:0,oddsSum:0,oddsCount:0};}
const bangkokDayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});
function makeChart(indices,rows,cutoff){
 const ordered=indices.filter(i=>cutoff===null||dateMs(rows[i].settledAt??rows[i].createdAt)>=cutoff).sort((a,b)=>dateMs(rows[a].settledAt??rows[a].createdAt)-dateMs(rows[b].settledAt??rows[b].createdAt)||a-b);
 const days=new Map();let net=0,stake=0,peak=0,maxDD=0,trough=0,bestRun=0,wins=0,losses=0,winCredits=0;
 for(const i of ordered){
  const r=rows[i],o=outcome(r),ts=dateMs(r.settledAt??r.createdAt);if(!ts)continue;
  if(o==='WIN'||o==='HALF_WIN'){wins++;winCredits+=o==='WIN'?1:.5}else if(o==='LOSS'||o==='HALF_LOSS')losses++;
  const day=bangkokDayFormatter.format(new Date(ts)),f=financial(r);let c=days.get(day);
  if(!c){c={day,open:net,high:net,low:net,close:net,stake,roi:stake?net/stake*100:null,rate:null,rows:0};days.set(day,c)}
  c.rows++;
  if(f.priced){net+=f.profit;stake+=f.stake;peak=Math.max(peak,net);maxDD=Math.max(maxDD,peak-net);trough=Math.min(trough,net);bestRun=Math.max(bestRun,net-trough);c.high=Math.max(c.high,net);c.low=Math.min(c.low,net);c.close=net;c.stake=stake;c.roi=stake?net/stake*100:null}
  c.rate=wins+losses?winCredits/(wins+losses)*100:null;
 }
 return{days:[...days.values()],net,stake,peak,maxDD,bestRun};
}
function metricsFor(indices,rows,now){const m=empty(),settled=[],all=[];let lastTs=0;for(const i of indices){const row=rows[i],status=String(row.status||'').toUpperCase(),o=outcome(row);m.ledgerTotal++;if(status==='PENDING')m.pending++;else if(status==='UNRESOLVED')m.unresolved++;if(status==='SETTLED'){m.settledTotal++;if(o==='WIN')m.win++;else if(o==='LOSS')m.loss++;else if(o==='PUSH')m.push++;else if(o==='HALF_WIN')m.halfWin++;else if(o==='HALF_LOSS')m.halfLoss++;const odd=safeNumber(row.odds);if(odd!==null&&odd>1){m.oddsSum+=odd;m.oddsCount++}const f=financial(row);if(f.priced){m.priced++;m.net+=f.profit;m.stake+=f.stake}if(isSettled(row))settled.push(i)}all.push(i);lastTs=Math.max(lastTs,dateMs(row.settledAt??row.createdAt))}
 const denom=m.win+m.loss+m.halfWin+m.halfLoss;m.winRate=denom?Math.round((m.win+0.5*m.halfWin)/denom*1000)/10:null;m.roi=m.stake?m.net/m.stake*100:null;m.avgOdds=m.oddsCount?m.oddsSum/m.oddsCount:null;
 // Preserve exact accounting and reset cumulative units at each range boundary.
 const a=makeChart(settled,rows,null),b=makeChart(settled,rows,now-30*86400000),c=makeChart(settled,rows,now-90*86400000);
 m.peak=a.peak;m.maxDrawdown=a.maxDD;m.bestRecovery=a.bestRun;
 return{metrics:m,charts:{all:a.days,30:b.days,90:c.days},indices:all};}
export function createReadModel(source,{contentRevision,asOf,registry=null,now=Date.now()}={}){
 if(!Number.isSafeInteger(contentRevision)||contentRevision<0)throw Error('INVALID_CONTENT_REVISION');
 if(!Array.isArray(source))throw Error('LEDGER_ROWS_REQUIRED');
 const ids=new Set(),rows=source.slice();
 for(const row of rows){const id=String(row?.id||'');if(!id||ids.has(id))throw Error('DUPLICATE_OR_MISSING_LEDGER_ID');ids.add(id);}
 const ordered=rows.map((_,i)=>i).sort((a,b)=>dateMs(rows[b].settledAt??rows[b].createdAt)-dateMs(rows[a].settledAt??rows[a].createdAt)||a-b);
 const groups=new Map();for(const i of ordered){for(const k of keysFor(rows[i],registry)){if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}}
 const views=new Map();for(const[k,indices]of groups)views.set(k,metricsFor(indices,rows,now));
 const global=views.get(key());if(global.metrics.ledgerTotal!==rows.length)throw Error('INCOMPLETE_GLOBAL_COUNT');
 const marketCounts=Object.fromEntries(GROUPS.map(k=>[k,k==='all'?rows.length:views.get(key(k))?.metrics.ledgerTotal||0]));
 if(Object.values(marketCounts).slice(1).reduce((a,b)=>a+b,0)!==rows.length)throw Error('MARKET_PARTITION_MISMATCH');
 const summary=Object.freeze({ok:true,contentRevision,asOf,ledgerTotal:rows.length,marketCounts,...global.metrics});
 function query({market='all',variant='all',filter='all',page=1,limit=50,rangeDays='all'}={}){
  if(!GROUPS.includes(market))throw Error('INVALID_MARKET');
  if(!Number.isSafeInteger(page)||page<1||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('INVALID_PAGINATION');
  if(!['all',30,90].includes(rangeDays))throw Error('INVALID_RANGE');
  const v=views.get(key(market,variant,filter))||{indices:[],metrics:empty(),charts:{all:[],30:[],90:[]}},start=(page-1)*limit;
   const chart=v.charts[String(rangeDays)];
   return{ok:true,contentRevision,asOf,market,variant,filter,page,pageSize:limit,totalRows:v.indices.length,pages:Math.max(1,Math.ceil(v.indices.length/limit)),metrics:v.metrics,rows:v.indices.slice(start,start+limit).map(i=>rows[i]),chart,rangeDays};
 }
 return Object.freeze({summary,query,sourceRows:rows.length,groupCount:views.size});
}
