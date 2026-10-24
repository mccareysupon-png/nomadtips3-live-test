const base='https://ball46.com';
async function load(p){const r=await fetch(base+p,{signal:AbortSignal.timeout(55000)});return r.json();}
const js=await fetch(base+'/dashboard-v2-stage3-featured-facts-20261013a.js?audit='+Date.now(),{signal:AbortSignal.timeout(55000)}).then(r=>r.text());
const idx=js.indexOf('function signalDetailsHtml('),end=js.indexOf('\nfunction ',idx+10);
const fun=js.slice(idx,end>0?end:idx+3400);
const signals=await load('/api/engine/signals'),stats=await load('/api/engine/statistics?paged=1');
const fromStats=(stats.rows||[]).filter(x=>/corner/i.test(x.market||'')).slice(0,12);
const allKeys=x=>x&&typeof x==='object'?Object.keys(x):[];
const cut=s=>JSON.stringify(s).slice(0,2500);
const res={time:new Date().toISOString(),jsLen:js.length,renderer:fun.slice(0,3800),
activeSignals:(signals.signals||[]).map(x=>({id:x.id,market:x.market,keys:allKeys(x),entryScore:x.entryScore,entryMinute:x.entryMinute,entryStats:x.entryStats,statsAtEntry:x.statsAtEntry,entryCorners:x.entryCorners,cornerEntry:x.cornerEntry,stats:x.stats,mirrorStats:x.mirrorStats,mirrorCorners:x.mirrorCorners})).slice(0,12),
cornerStatCount:fromStats.length,cornerStatSamples:fromStats.map(x=>({id:x.id,fixtureId:x.fixtureId,market:x.market,selection:x.selection,keys:allKeys(x),snapshot:x.entryStats,entryCorners:x.entryCorners,entryScore:x.entryScore,evidence:x.evidence,stats:x.stats,entry:x.entry})).slice(0,7)};
console.log('B46_CORNER_FOCUS='+JSON.stringify(res).slice(0,18500));
