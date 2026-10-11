import {createHash} from "node:crypto";
const acc=process.env.CLOUDFLARE_ACCOUNT_ID,key=process.env.CLOUDFLARE_API_TOKEN;
const root=`https://api.cloudflare.com/client/v4/accounts/${acc}/workers`,name="nomadtips3-engine-343";
const read=async(path)=>{const r=await fetch(root+path,{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||j?.success!==true)throw Error("CF_READ_"+r.status);return j.result};
const d=await read(`/scripts/${name}/deployments`),id=d.deployments?.[0]?.versions?.find(v=>Number(v.percentage)===100)?.version_id;
const v=await read(`/workers/${name}/versions/${id}?include=modules`),b=v.modules.find(x=>x.name===v.main_module),s=Buffer.from(b.content_base64,"base64").toString("utf8"),lines=s.split("\n");
console.log("JOHN_SOURCE_ACTIVE",JSON.stringify({version:id,sha:createHash("sha256").update(s).digest("hex"),bytes:s.length}));
const terms=["johnQuotesByFixture","johnEligibleFixtureIds","johnCache","johnPrice","cacheSnapshot","board-cache","prewarm","CENTRAL_CACHE_READ_ONLY","function pickBestPriced(","function consensusProviderLine(","function offersFor(","function priceFor(","providerOddsFreshAt","providerOddsUpdatedAt","cacheMs","fetchedAt","refereeConsensusBooks"];
let batches=[];
for(const term of terms){const matches=lines.map((l,i)=>l.includes(term)?i:-1).filter(i=>i>=0);
 const chosen=matches.slice(0,9);
 for(const i of chosen){
  const from=Math.max(0,i-(term.includes("john")?9:3)),to=Math.min(lines.length,i+(term.includes("john")?17:term.includes("consensus")?22:8));
  const code=lines.slice(from,to).map((l,x)=>`${from+x+1}: `+(/FIVEDOLLAR_API_KEY|Authorization|authorization/i.test(l)?"[sensitive line omitted]":l)).join("\n");
  batches.push({term,line:i+1,count:matches.length,code:code.slice(0,7000)});
 }
}
for(const a of batches)console.log("JOHN_SOURCE_CONTEXT",JSON.stringify(a));
