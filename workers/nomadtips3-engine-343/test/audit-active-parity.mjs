import fs from 'node:fs';
import {createHash} from 'node:crypto';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const name='nomadtips3-engine-343';
const out={mode:'READ_ONLY_DEPLOYMENT_PARITY_CHECK',name,at:new Date().toISOString(),
  writes:0,method:'GET',expectedPriorVersion:'9b363777-64fc-4a48-a10a-0fad822640cb'};
if(!account||!token){out.status='MISSING_READ_CREDENTIALS'}
else{
 const root='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/'+name;
 const headers={Authorization:'Bearer '+token};
 try{
  const d=await fetch(root+'/deployments',{headers,signal:AbortSignal.timeout(18000)});
  out.deploymentsHttp=d.status;
  if(d.ok){
   const j=await d.json();
   const deployments=j?.result?.deployments||[];
   const latest=deployments[0];
   out.latest={createdAt:latest?.created_on??null,
     versions:(latest?.versions||[]).map(v=>({id:v.version_id??v.id,percentage:v.percentage??null})),
     deploymentId:latest?.id??null};
   out.sameActiveVersion=out.latest.versions.some(v=>v.id===out.expectedPriorVersion&&v.percentage===100);
  }
  const s=await fetch(root,{headers,signal:AbortSignal.timeout(18000)});
  out.scriptHttp=s.status;
  if(s.ok){
   const body=await s.text();
   out.scriptBytes=body.length;
   out.scriptSha256=createHash('sha256').update(body).digest('hex');
   const markers=[
    'nomad343-engine-v5-best19-referee','bet365-rules-v2','external-final-bridge-v1',
    'BEST_OF_19_INPLAY','FINAL_DATA_UNAVAILABLE','ft_corner_over','/reconcile-final',
    'market-core','settleMarketSignal','GOALOO_POLL_ENABLED','/multisource-final'
   ];
   out.markers=Object.fromEntries(markers.map(x=>[x,body.includes(x)]));
   out.runtimeArchitectureVisible=out.markers['nomad343-engine-v5-best19-referee']&&
     out.markers['bet365-rules-v2']&&out.markers['/reconcile-final'];
   // Static markers only cannot prove exact source-commit parity.
   out.exactSourceParityCertified=false;
  }
 }catch(e){out.error=String(e?.message||e).slice(0,200)}
}
fs.writeFileSync('engine343-active-readonly-parity.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out));
