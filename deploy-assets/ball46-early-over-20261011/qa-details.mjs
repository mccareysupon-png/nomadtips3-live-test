const base="https://www.ball46.com/api/engine/";
const get=async p=>{const r=await fetch(base+p+(p.includes("?")?"&":"?")+"qa="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||j?.ok===false)throw Error("READ_"+p+"_"+r.status);return j;};
const [board,stats]=await Promise.all([get("board"),get("statistics?paged=1")]);
const fixtures=new Map((board.fixtures||[]).map(f=>[String(f.fixtureId??f.id),f]));
const rows=Array.isArray(stats.rows)?stats.rows:[];
const relevant=["LIVE_OVER_EARLY_V1","LIVE_OVER_FINAL_CONFIRMED_V1","LIVE_OVER_REVERTED_V1"];
const records=rows.filter(x=>relevant.includes(x.settlementSource));
for(const x of records){const f=fixtures.get(String(x.fixtureId));
 const pair=d=>d&&typeof d==="object"?{home:d.home??null,away:d.away??null,halfHome:d.halfHome??null,halfAway:d.halfAway??null}:null;
 console.log("EARLY_ROW",JSON.stringify({id:String(x.id||"").slice(0,42),fixtureId:String(x.fixtureId||""),
 market:x.market,line:x.line,selection:x.selection,status:x.status,result:x.result,previousResult:x.previousResult||null,
 createdAt:x.createdAt,settledAt:x.settledAt,reconciledAt:x.reconciledAt,
 source:x.settlementSource,entryScore:pair(x.entryScore),entryCorners:pair(x.entryCorners),
 finalScore:pair(x.finalScore),finalCorners:pair(x.finalCorners),
 mirrorMinute:x.mirrorMinute,mirrorStatus:x.mirrorStatus,
 boardPresent:Boolean(f),boardState:f?.boardState||null,boardStatus:f?.status||null,
 boardMinute:f?.minute||null,boardScore:pair(f?.goals),boardCorners:pair(f?.corners)}));
}
console.log("EARLY_DETAIL_TOTAL",JSON.stringify({rowsInspected:rows.length,earlyRows:records.length,missingCurrentBoard:records.filter(x=>!fixtures.has(String(x.fixtureId))).length,updatedAt:new Date().toISOString()}));
