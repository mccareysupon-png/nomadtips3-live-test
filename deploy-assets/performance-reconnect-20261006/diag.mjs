import assert from 'node:assert/strict';
const urls=[
 ['ball46-stats','https://ball46.com/api/engine/statistics?_='+Date.now()],
 ['ball46-stats-limit','https://ball46.com/api/engine/statistics?limit=5000&_='+Date.now()],
 ['ball46-stats-paged','https://ball46.com/api/engine/statistics?paged=1&_='+Date.now()],
 ['ball46-signals','https://ball46.com/api/engine/signals?_='+Date.now()],
 ['ball46-board','https://ball46.com/api/engine/board?_='+Date.now()],
 ['engine-stats','https://nomadtips3-engine-343.mccarey-supon.workers.dev/statistics?_='+Date.now()],
 ['engine-signals','https://nomadtips3-engine-343.mccarey-supon.workers.dev/signals?_='+Date.now()],
 ['engine-board','https://nomadtips3-engine-343.mccarey-supon.workers.dev/board?_='+Date.now()]
];
const contains=(v,needle)=>JSON.stringify(v).toLowerCase().includes(needle);
for(const [name,url] of urls){
 const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
 const text=await r.text();console.log('ENDPOINT',name,'HTTP',r.status,'BYTES',text.length);
 let j;try{j=JSON.parse(text)}catch{console.log(name,'NON_JSON',text.slice(0,500));continue}
 const rows=Array.isArray(j.rows)?j.rows:Array.isArray(j.signals)?j.signals:Array.isArray(j.fixtures)?j.fixtures:[];
 console.log(name,'SUMMARY',JSON.stringify({ok:j.ok,version:j.version,total:j.total,ledgerTotal:j.ledgerTotal,pending:j.pending,returned:j.returned,rows:rows.length,nextCursor:j.nextCursor,hasMore:j.hasMore}));
 if(rows[0])console.log(name,'ROW_KEYS',JSON.stringify(Object.keys(rows[0]).sort()));
 const matches=rows.filter(x=>contains(x,'nasinu')||contains(x,'rewa'));
 console.log(name,'NASINU_REWA_MATCHES',matches.length);
 for(const x of matches.slice(0,10))console.log(name,'MATCH',JSON.stringify(x));
 for(const x of rows.slice(0,12))console.log(name,'RECENT',JSON.stringify({id:x?.id,fixtureId:x?.fixtureId,home:x?.home,away:x?.away,homeName:x?.homeName,awayName:x?.awayName,market:x?.market,selection:x?.selection,status:x?.status,result:x?.result,createdAt:x?.createdAt,settledAt:x?.settledAt}));
}
