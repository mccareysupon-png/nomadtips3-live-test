import { createHash } from "node:crypto";
const worker="nomadtips3-engine-343";
const root=`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/workers`;
const auth={Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`};
const cf=async path=>{const r=await fetch(root+path,{headers:auth,signal:AbortSignal.timeout(35000)});const x=await r.json();if(!r.ok||!x.success)throw Error("CLOUDFLARE_READ_"+r.status);return x.result;};
const d=await cf(`/scripts/${worker}/deployments`);
const active=d.deployments?.[0]?.versions?.find(v=>Number(v.percentage)===100);
if(!active)throw Error("ACTIVE_NOT_CONFIRMED");
const v=await cf(`/workers/${worker}/versions/${active.version_id}?include=modules`);
const main=v.modules?.find(m=>m.name===v.main_module);
if(!main?.content_base64)throw Error("ACTIVE_MODULE_MISSING");
const s=Buffer.from(main.content_base64,"base64").toString("utf8");
const chk=(needle)=>s.includes(needle);
console.log("ACTIVE_WORKER",JSON.stringify({at:new Date().toISOString(),id:active.version_id,sha256:createHash("sha256").update(s).digest("hex"),
 phase1AgeZero:chk("var FINAL_RECHECK_MIN_SIGNAL_AGE_MS = 0;"),
 phase2EarlyWin:chk("LIVE_OVER_EARLY_V1"),phase2Scan:chk("phase2ApplyLive(signals, fixtureMap, at, hub.stale === true)"),
 phase2LedgerWrites:chk("if (phase2Changed.length) await this.upsertLedgerRows(phase2Changed, fixtureMap);"),
 provisionalRetention:chk("phase2IsEarly(x)"),
 fallbackPendingOnly:chk('if (sig?.status !== "PENDING" || !sig?.fixtureId) continue;'),
 fallbackBoardSkip:chk("if (boardIds.has(id)) continue;"),
 bridgeHandlesProvisional:chk('sig?.status !== "PENDING" && !phase2IsEarly(sig)')}));
const base="https://www.ball46.com/api/engine";
async function get(name){try{const url=base+"/"+name+(name.includes("?")?"&":"?")+"qa_read="+Date.now();
 const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(28000)});const j=await r.json().catch(()=>null);
 if(!r.ok||!j||j.ok===false)throw Error("HTTP_"+r.status+"_"+String(j?.error||""));
 return j;}catch(err){console.log("API_ERROR",JSON.stringify({name,error:String(err?.message||err)}));return null}}
const [health,board,signals,ledger,statistics]=await Promise.all([
 get("health"),get("board"),get("signals"),get("ledger-health"),get("statistics?paged=1")]);
console.log("PUBLIC_HEALTH",JSON.stringify({engine:health?.version,healthOk:health?.ok,ledgerVersion:ledger?.version,ledgerTotal:ledger?.ledgerTotal,
 ledgerSettled:ledger?.settledTotal,ledgerPending:ledger?.pending,ledgerUpdatedAt:ledger?.updatedAt}));
const fixtures=Array.isArray(board?.fixtures)?board.fixtures:[];
const boardIds=new Set(fixtures.map(f=>String(f.fixtureId??f.id)));
const byState={};for(const f of fixtures){const st=String(f.boardState||f.status||f.statusCode||"unknown");byState[st]=(byState[st]||0)+1}
console.log("PUBLIC_BOARD",JSON.stringify({count:fixtures.length,hubFetchedAt:board?.hubFetchedAt,hubAgeMs:board?.hubAgeMs,stale:board?.stale,states:byState}));
const live=Array.isArray(signals?.signals)?signals.signals:[];
const rows=Array.isArray(statistics?.rows)?statistics.rows:[];
const watched=new Set(["ft_over","ht_over","ft_corner_over","ht_corner_over"]);
function analyze(label,list){const out={count:list.length,market:{},sources:{},status:{},early:0,earlyMissingFromBoard:0,earlyLive:0,
 pendingOverMissingEntry:0,pendingOverWithEntry:0,pendingOverAlreadyWinning:0,earlySamples:[]};
 for(const x of list){const market=String(x.market||"");const status=String(x.status||"");const source=String(x.settlementSource||"NONE");
 out.market[market]=(out.market[market]||0)+1;out.sources[source]=(out.sources[source]||0)+1;out.status[status]=(out.status[status]||0)+1;
 const id=String(x.fixtureId||"");const f=fixtures.find(f=>String(f.fixtureId??f.id)===id);
 if(source==="LIVE_OVER_EARLY_V1"){out.early++;if(!boardIds.has(id))out.earlyMissingFromBoard++;
 if(f?.boardState==="live")out.earlyLive++;if(out.earlySamples.length<5)out.earlySamples.push({market,status,result:x.result,minute:x.mirrorMinute,board:!!f,source});}
 if(status==="PENDING"&&watched.has(market)){const data=market.includes("corner")?x.entryCorners:(x.entryScore??x.scoreAt);
 if(Number.isFinite(Number(data?.home))&&Number.isFinite(Number(data?.away)))out.pendingOverWithEntry++;else out.pendingOverMissingEntry++;
 if(f){const countData=market.includes("corner")?f.corners:f.goals;const total=Number(countData?.home)+Number(countData?.away);
 if(Number.isFinite(total)&&Number.isFinite(Number(x.line))&&total>Number(x.line))out.pendingOverAlreadyWinning++;}}
 }console.log(label,JSON.stringify(out));}
analyze("WORKING_SIGNALS",live);analyze("LATEST_LEDGER_ROWS",rows);
console.log("STATISTICS_PAGING",JSON.stringify({returned:statistics?.returned,hasMore:statistics?.hasMore,nextCursor:!!statistics?.nextCursor,
 ledgerTotal:statistics?.ledgerTotal,total:statistics?.total,pending:statistics?.pending}));
