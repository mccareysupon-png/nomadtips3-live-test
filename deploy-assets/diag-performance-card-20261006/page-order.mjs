const TZ='Europe/London',CUT=6;
function parts(ms){const o={};for(const p of new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)))if(p.type!=='literal')o[p.type]=p.value;return o}
function prev(k){const [y,m,d]=k.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)-86400000).toISOString().slice(0,10)}
function sportDay(ms){const p=parts(ms);let k=`${p.year}-${p.month}-${p.day}`;if(Number(p.hour)<CUT)k=prev(k);return k}
function ms(v){if(v==null||v==='')return null;if(typeof v==='number'||/^\d+(?:\.\d+)?$/.test(String(v))){const n=Number(v);return Number.isFinite(n)?(n>1e12?n:n>1e9?n*1000:null):null}const n=Date.parse(String(v));return Number.isFinite(n)?n:null}
function stamp(r){for(const k of ['createdAt','created_at']){const n=ms(r?.[k]);if(n!==null)return n}return null}
const r=await fetch('https://www.ball46.com/api/engine/statistics?paged=1&_='+Date.now(),{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
const j=await r.json();
const rows=j.rows||[];
const tk=sportDay(Date.now()),yk=prev(tk);
const stamps=rows.map(stamp).filter(Number.isFinite);
let desc=true;for(let i=1;i<stamps.length;i++)if(stamps[i]>stamps[i-1]){desc=false;break}
const counts={today:0,yesterday:0,older:0,newer:0,unknown:0};
for(const row of rows){const t=stamp(row);if(t===null){counts.unknown++;continue}const k=sportDay(t);if(k===tk)counts.today++;else if(k===yk)counts.yesterday++;else if(k<yk)counts.older++;else counts.newer++}
console.log(JSON.stringify({
 status:r.status,ledgerTotal:j.ledgerTotal,rows:rows.length,nextCursor:Boolean(j.nextCursor),todayKey:tk,yesterdayKey:yk,
 descending:desc,counts,
 first:stamps[0]?new Date(stamps[0]).toISOString():null,
 last:stamps.at(-1)?new Date(stamps.at(-1)).toISOString():null,
 lastSportDay:stamps.at(-1)?sportDay(stamps.at(-1)):null
},null,2));