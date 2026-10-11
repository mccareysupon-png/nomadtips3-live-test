const root="https://www.ball46.com";
const api=["/api/engine/health","/api/engine/ledger-health","/api/engine/statistics?paged=1","/api/engine/statistics?view=summary","/api/engine/board","/api/engine/signals"];
for(const path of api){
 const url=root+path+(path.includes("?")?"&":"?")+"incident="+Date.now(), t=Date.now();
 try{const r=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(20000)});const j=await r.json().catch(()=>null);
 console.log("INCIDENT_API",JSON.stringify({path,http:r.status,elapsedMs:Date.now()-t,ok:j?.ok,version:j?.version,error:j?.error,
 ledgerTotal:j?.ledgerTotal,total:j?.total,pending:j?.pending,settledTotal:j?.settledTotal,
 rows:Array.isArray(j?.rows)?j.rows.length:null,signals:Array.isArray(j?.signals)?j.signals.length:null,
 fixtures:Array.isArray(j?.fixtures)?j.fixtures.length:null,
 keys:j?Object.keys(j).slice(0,28):[],firstRows:(j?.rows||[]).slice(0,2).map(x=>({status:x.status,result:x.result,market:x.market}))}));
 }catch(e){console.log("INCIDENT_API_ERROR",JSON.stringify({path,elapsedMs:Date.now()-t,error:String(e?.message||e)}));}
}
for(const path of ["/","/index.html","/statistics.html"]){
 try{const r=await fetch(root+path+"?incident="+Date.now(),{cache:"no-store",signal:AbortSignal.timeout(20000)});const html=await r.text();
 console.log("INCIDENT_UI",JSON.stringify({path,http:r.status,bytes:html.length,title:html.match(/<title[^>]*>([^<]*)/)?.[1],
 containsStats:html.includes("STATISTICS"),containsAPI:html.includes("/api/engine/statistics"),hasBody:html.includes("<body")}));
 }catch(e){console.log("INCIDENT_UI_ERROR",JSON.stringify({path,error:String(e?.message||e)}))}
}
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN;
const rr=await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/workers/scripts/nomadtips3-engine-343/deployments`,
 {headers:{Authorization:`Bearer ${tok}`},signal:AbortSignal.timeout(25000)});const dd=await rr.json();
console.log("INCIDENT_ACTIVE_VERSION",JSON.stringify({http:rr.status,deployments:dd?.result?.deployments?.slice(0,4).map(x=>({at:x.created_on,versions:x.versions}))}));
