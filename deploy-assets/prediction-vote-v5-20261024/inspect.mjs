import{mkdir,writeFile}from'node:fs/promises';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
async function cf(p){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+p,{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(60000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF '+r.status);return j.result}
const terms=['Live match outlook','LIVE PREDICTION','AWAY EDGE','possible finish','data-live-prediction','live-prediction','prediction-card','Live Prediction','form5','voting','vote'];
const output={time:new Date().toISOString(),workers:[],resources:[],api:[]};
for(const w of ['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343']){
 const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0],id=d.versions.find(x=>x.percentage===100)?.version_id;
 const v=await cf('/workers/workers/'+w+'/versions/'+id+'?include=modules');
 const src=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 const found=[];for(const term of terms){let i=-1,n=0;while((i=src.toLowerCase().indexOf(term.toLowerCase(),i+1))!==-1&&n++<3)found.push({term,at:i,around:src.slice(Math.max(0,i-400),i+1150)});}
 output.workers.push({worker:w,active:id,deployment:d.id,main:v.main_module,length:src.length,modules:v.modules.length,bindings:v.bindings.map(b=>({name:b.name,type:b.type})),found});
}
const routes=['/','/live.html','/dashboard-v2-stage3-featured-facts-20261013a.js','/signal.html','/api/engine/board','/api/hub/snapshot','/api/engine/signals'];
for(const path of routes){
 try{const r=await fetch('https://ball46.com'+path+'?predictionVoteAudit='+Date.now(),{signal:AbortSignal.timeout(60000)}),txt=await r.text(),item={path,status:r.status,length:txt.length,type:r.headers.get('content-type')};
 if(path.includes('/api/')){let j;try{j=JSON.parse(txt)}catch{}item.keys=Object.keys(j||{});item.fixtureCount=j?.fixtures?.length;item.fixtureSample=j?.fixtures?.[0]?{keys:Object.keys(j.fixtures[0]),fixtureId:j.fixtures[0].fixtureId,home:j.fixtures[0].home,away:j.fixtures[0].away,score:j.fixtures[0].score,stats:j.fixtures[0].stats,prediction:j.fixtures[0].prediction}:null;}
 else{item.found=[];for(const term of terms){let i=-1,n=0;while((i=txt.toLowerCase().indexOf(term.toLowerCase(),i+1))!==-1&&n++<4)item.found.push({term,at:i,around:txt.slice(Math.max(0,i-600),i+1500)})};item.scripts=path==='/'?[...txt.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(m=>m[1]).slice(-55):undefined;}
 output.resources.push(item);
 }catch(e){output.resources.push({path,error:String(e.message||e)})}
}
await mkdir('audit',{recursive:true});await writeFile('audit/prediction-vote-prerequisites.json',JSON.stringify(output,null,2));
console.log('B46_VOTE_PREREQ='+JSON.stringify({workers:output.workers.map(x=>({...x,found:x.found.slice(0,12).map(z=>({...z,around:z.around.slice(0,1000)}))})),resources:output.resources.map(x=>({...x,found:x.found?.slice(0,10).map(z=>({...z,around:z.around.slice(0,1100)}))}))}).slice(0,62000));
