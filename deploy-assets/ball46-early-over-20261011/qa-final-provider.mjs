const key=process.env.FIVEDOLLAR_API_KEY;
if(!key)throw Error("NO_FIVEDOLLAR_AUDIT_KEY");
const get=async p=>{const r=await fetch("https://www.ball46.com/api/engine/"+p+(p.includes("?")?"&":"?")+"qa="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(25000)});const j=await r.json();if(!r.ok||j.ok===false)throw Error("ENGINE_READ_FAILED_"+r.status);return j};
const [board,stats]=await Promise.all([get("board"),get("statistics?paged=1")]);
const existing=new Set((board.fixtures||[]).map(x=>String(x.fixtureId??x.id)));
const missing=(stats.rows||[]).filter(x=>x.settlementSource==="LIVE_OVER_EARLY_V1"&&!existing.has(String(x.fixtureId))).slice(0,5);
for(const x of missing){const url=`https://api.5dollarfootballapi.com/v1/fixtures/${encodeURIComponent(x.fixtureId)}?include=events,stats`;
 try{const r=await fetch(url,{headers:{accept:"application/json",authorization:"Bearer "+key},cache:"no-store",signal:AbortSignal.timeout(24000)});
 const j=await r.json().catch(()=>null);const d=j?.data||j?.result||{};
 const basis=x.market?.includes("corner")?d.corners:d.goals;
 const total=Number(basis?.home)+Number(basis?.away);const line=Number(x.line);
 const q=Math.round(line*4)/4;const fullThreshold=Math.abs(q*2-Math.round(q*2))<1e-8?q:Math.ceil(q*2)/2;
 console.log("DIRECT_FIVEDOLLAR_FINAL",JSON.stringify({fixtureId:String(x.fixtureId),market:x.market,line:x.line,
 apiHttp:r.status,apiSuccess:j?.success,providerStatus:d.status,providerStatusCode:d.status_code??d.statusCode,
 providerMinute:d.minute??null,providerGoals:d.goals,providerCorners:d.corners,
 fullWinNow:Number.isFinite(total)&&Number.isFinite(fullThreshold)?total>fullThreshold:null,
 ledgerStatus:x.status,ledgerResult:x.result,ledgerSource:x.settlementSource,ledgerMirrorStatus:x.mirrorStatus,
 ledgerFinalGoals:x.finalScore,ledgerFinalCorners:x.finalCorners,ledgerSettledAt:x.settledAt}));
 }catch(e){console.log("DIRECT_PROVIDER_ERROR",JSON.stringify({fixtureId:String(x.fixtureId),message:String(e?.message||e)}));}
}
console.log("DIRECT_AUDIT_DONE",JSON.stringify({missingEarlyCount:missing.length,at:new Date().toISOString()}));
