const token=process.env.CLOUDFLARE_API_TOKEN,acct=process.env.CLOUDFLARE_ACCOUNT_ID;
const u='https://api.cloudflare.com/client/v4/accounts/'+acct+'/workers/scripts/ball46-production/deployments?per_page=1';
const r=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});const d=await r.json();
if(!d.success)throw Error(JSON.stringify(d.errors));
console.log('STATS_ALLTHEMES_ACTIVE_CONFIRM',JSON.stringify(d.result.deployments[0].versions));
