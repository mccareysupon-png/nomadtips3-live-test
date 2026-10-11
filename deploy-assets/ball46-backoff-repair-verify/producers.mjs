const acc=process.env.CLOUDFLARE_ACCOUNT_ID,tok=process.env.CLOUDFLARE_API_TOKEN;
const base=`https://api.cloudflare.com/client/v4/accounts/${acc}/workers`;
async function cf(p){const r=await fetch(base+p,{headers:{Authorization:`Bearer ${tok}`},signal:AbortSignal.timeout(25000)}),j=await r.json();if(!r.ok||!j?.success)throw Error("CF_"+r.status);return j.result}
const names=["nomadtips3-engine-343","nomadtips3-full-market-343-ball46","nomadtips3-5usd-hub-343","nomadtips3-343-auto-engine"];
for(const name of names){
 try{const dep=await cf(`/scripts/${name}/deployments`),active=dep.deployments?.[0]?.versions?.find(x=>Number(x.percentage)===100);if(!active)continue;
  const v=await cf(`/workers/${name}/versions/${active.version_id}?include=modules`),main=v.modules?.find(x=>x.name===v.main_module);
  const source=main?.content_base64?Buffer.from(main.content_base64,"base64").toString("utf8"):"",lines=source.split("\n");
  let results=[];
  for(const [i,s]of lines.entries()){if(/api\.5dollarfootballapi\.com|providerRequest\(|FIVEDOLLAR_API_KEY|PREWARM_MAX_PER_RUN|async scheduled\(|scheduled\(|fetch\(`https|FULL_MARKET_REQUESTS_PER_SCAN|TICK_REQUESTS_PER_SCAN/.test(s)){
    const snippet=s.replace(/authorization:[^,)]*/gi,"authorization:[REDACTED]").replace(/Bearer[^"]+/g,"Bearer [REDACTED]");
    results.push({line:i+1,text:snippet.slice(0,280)});
  }}
  const cron=await cf(`/scripts/${name}/schedules`).catch(e=>({error:String(e)}));
  console.log("AUDIT_REQUEST_PRODUCER",JSON.stringify({name,id:active.version_id,bytes:source.length,crons:cron?.schedules||cron,patterns:results.slice(0,95)}));
 }catch(e){console.log("AUDIT_REQUEST_PRODUCER_ERROR",JSON.stringify({name,error:String(e)}))}
}