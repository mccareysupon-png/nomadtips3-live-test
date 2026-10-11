const from=Date.parse("2026-10-11T12:51:26.670Z");
const end=["ft_over","ft_under","ht_over","ht_under"];
const base="https://www.ball46.com";
async function read(path){const r=await fetch(base+path+(path.includes("?")?"&":"?")+"qa="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(25000)});const x=await r.json().catch(()=>null);if(!r.ok||!x?.ok)throw Error(path+"_HTTP_"+r.status);return x;}
const [ledger,signals,board,health,fullHealth]=await Promise.all([read("/api/engine/statistics?paged=1"),read("/api/engine/signals"),read("/api/engine/board"),read("/api/engine/health"),read("/api/full-market/health")]);
const raw=[...new Map([...(ledger.rows||[]),...(signals.signals||[])].map(x=>[x.id,x])).values()];
const post=raw.filter(s=>end.includes(s.market)&&Number(s.createdAt)>from).sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
const pre=raw.filter(s=>end.includes(s.market)&&Number(s.createdAt)<=from).sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
const fixtures=new Map((board.fixtures||[]).map(f=>[String(f.fixtureId),f]));
function sanitize(v,max){const s=JSON.stringify(v);return s?.slice(0,max)||null}
function sigview(s){const f=fixtures.get(String(s.fixtureId));
 const a=f?.analysis?.[s.market];
 const out={id:s.id,fixtureId:s.fixtureId,market:s.market,createdAt:s.createdAt,entryMinute:s.entryMinute,bookmaker:s.bookmaker,bookmakerSlug:s.bookmakerSlug,selection:s.selection,line:s.line,providerLine:s.providerLine,odds:s.odds,selectionLine:s.selectionLine,
 priceSource:s.priceSource,priceReference:s.priceReference,referenceProviderLine:s.referenceProviderLine,refereeConsensusBooks:s.refereeConsensusBooks,refereeConsensusSlugs:s.refereeConsensusSlugs,
 refereeBookCount:s.refereeBookCount,refereeOfferCount:s.refereeOfferCount,status:s.status,priceStage:s.priceStage,
 inplayPrice:sanitize(s.inplayPrice,1800),evidence:sanitize(s.evidence,2000),bookmakerHistory:sanitize(s.bookmakerHistory,1200),
 board:{present:!!f,boardMinute:f?.minute,boardPriceAgeMs:f?.providerOddsUpdatedAt?Date.now()-Number(f.providerOddsUpdatedAt):null,boardState:a?.state,boardAnalysis:a?sanitize(a,500):null}};
 return out;}
console.log("JOHN_PRICE_AUDIT_SUMMARY",JSON.stringify({now:new Date().toISOString(),ledgerTotal:ledger.total,ledgerRows:ledger.rows?.length,signalsVisible:signals.signals?.length,boardFixtures:board.fixtures?.length,
 health:{scanAt:health.finishedAt,errors:health.refereeErrors?.length,refereeRequests:health.refereeRequests},
 fullMarket:{providerStatus:fullHealth.providerMeta?.lastStatus,remaining:fullHealth.providerMeta?.remaining,blocked:fullHealth.retryAfterSec},
 sinceRestore:post.length,prior:pre.length,postSources:post.reduce((o,s)=>(o[s.priceSource]=(o[s.priceSource]||0)+1,o),{}),newest:post.slice(0,5).map(s=>({id:s.id,market:s.market,source:s.priceSource,createdAt:s.createdAt}))}));
for(const s of post.slice(0,15))console.log("JOHN_PRICE_AUDIT_SIGNAL",JSON.stringify(sigview(s)));
for(const s of pre.slice(0,2))console.log("JOHN_PRICE_AUDIT_PREVIOUS",JSON.stringify(sigview(s)));
const report={inspected:post.length,wrongSource:post.filter(s=>s.priceSource!=="BEST_OF_19_INPLAY").length,
 invalidOdds:post.filter(s=>!Number.isFinite(Number(s.odds))||Number(s.odds)<=1).length,
 invalidLine:post.filter(s=>s.line==null||!Number.isFinite(Number(s.line))).length,
 noBookmaker:post.filter(s=>!s.bookmakerSlug).length,
 mismatchedSelectionLine:post.filter(s=>s.selectionLine!=null&&Math.abs(Number(s.selectionLine)-Number(s.line))>1e-8).length,
 noReference:post.filter(s=>s.priceReference!=="BEST19_CONSENSUS_LINE").length,
 noEvidence:post.filter(s=>!s.evidence).length};
console.log("JOHN_PRICE_AUDIT_CHECKS",JSON.stringify(report));
