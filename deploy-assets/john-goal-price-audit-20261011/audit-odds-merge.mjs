const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN,root=`https://api.cloudflare.com/client/v4/accounts/${acc}/workers`;
async function get(p){const r=await fetch(root+p,{headers:{Authorization:"Bearer "+tok},signal:AbortSignal.timeout(24000)});const j=await r.json();if(!r.ok||!j?.success)throw Error("CF "+r.status);return j.result;}
for(const name of ["nomadtips3-full-market-343-ball46","nomadtips3-engine-343"]){
 const d=await get(`/scripts/${name}/deployments`),id=d.deployments[0].versions.find(x=>Number(x.percentage)===100).version_id;
 const v=await get(`/workers/${name}/versions/${id}?include=modules`),m=v.modules.find(x=>x.name===v.main_module),lines=Buffer.from(m.content_base64,"base64").toString("utf8").split("\n");
 const patterns=name.includes("full-market")?["function mergeFullOdds(","function sanitizeProviderPayload(","function bookmaker","function buildBody(","buildBody(fixtureId","var CACHE","STALE_CACHE_MS","async load(fixtureId)"]:["function offersFor(","function pickBestPriced(","function priceFor(","function consensusProviderLine("];
 console.log("JOHN_ODDS_ACTIVE",JSON.stringify({name,id,lines:lines.length}));
 for(const p of patterns){const idx=lines.findIndex(x=>x.includes(p));if(idx<0){console.log("JOHN_ODDS_MISSING",p);continue;}let after=p.includes("mergeFullOdds")?90:p.includes("sanitizeProviderPayload")?70:p.includes("offersFor")?50:p.includes("consensus")?27:35;
 const code=lines.slice(Math.max(0,idx-2),Math.min(lines.length,idx+after)).map((l,i)=>`${Math.max(0,idx-2)+i+1}: `+(/FIVEDOLLAR_API_KEY|authorization|Authorization/.test(l)?"[credentials line redacted]":l)).join("\n");
 console.log("JOHN_ODDS_CODE",JSON.stringify({name,pattern:p,start:idx+1,code:code.slice(0,12500)}));}
}
