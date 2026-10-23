import{mkdir,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
if(!ACCOUNT||!TOKEN)throw Error('READ_ONLY_AUDIT_MISSING_CLOUDFLARE_AUTH');
const sha=b=>createHash('sha256').update(b).digest('hex');
const root='https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT;
async function cf(p){const r=await fetch(root+p,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!r.ok||j.success!==true)throw Error('CF_READ:'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,80));return j.result;}
const report={at:new Date().toISOString(),mode:'READ_ONLY_STATIC_WITHOUT_PROVIDER_REQUESTS',workers:[],health:null};
const patterns=[
 'btts','bothTeamsToScore','both_teams_to_score',
 '5usd','5USD','provider','bookmakers','bookmaker','markets','inplay','in_play',
 'api/full-market','/api/','/odds','full-market','fetch(','new URL(','pathname',
 'function normalize','function parse','function map','function extract',
 'function handle','function price','function findMarket','getFullMarket',
 'apiKey','API_KEY'
];
function sanitize(s){return s.replace(/(?:(?:api[_-]?key|secret|token|authorization|bearer|password|client_secret|access_key)\s*[:=]\s*["'\x60][^"'\x60]{3,})/gi,'[REDACTED_CREDENTIAL]')
.replace(/(https?:\/\/[^\s"'\x60]{1,200})(?:\?[^"'\x60\s]{1,250})/g,'$1?[query-removed]')
.replace(/[A-Za-z0-9_-]{85,}/g,'[LONG_VALUE_REDACTED]');}
for(const w of['nomadtips3-5usd-hub-343','nomadtips3-engine-343','ball46-production']){
 try{
  const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];const id=d.versions.find(v=>v.percentage>0)?.version_id;
  const v=await cf('/workers/workers/'+w+'/versions/'+id+'?include=modules');let mod=v.modules.find(m=>m.name===v.main_module);
  const source=Buffer.from(mod.content_base64,'base64').toString();
  const object={name:w,version:id,deployId:d.id,main:v.main_module,sha:sha(Buffer.from(source)),length:source.length,
  first:source.slice(0,2000),allMatches:[],special:{}};
  const countBy={};
  for(const term of patterns){
   let at=-1,n=0,items=[];
   const src=source.toLowerCase(),t=term.toLowerCase();
   while((at=src.indexOf(t,at+1))>=0){n++;if(items.length<7)items.push({at,context:sanitize(source.slice(Math.max(0,at-350),Math.min(source.length,at+term.length+680)))});}
   if(n){countBy[term]=n;if(['btts','bothTeamsToScore','both_teams_to_score','5usd','inplay','/api/','function normalize','function parse','function findMarket','function price','api/full-market'].includes(term)){object.allMatches.push({term,count:n,items});}}
  }
  object.counts=countBy;
  object.first=sanitize(object.first);
  if(w==='nomadtips3-5usd-hub-343'){
   for(const token of['addEventListener','async fetch(','.pathname','pathname ===','pathname.startsWith','/health','/odds','/full-market','new URL(request.url)','/fixture','getOdds','fetchProvider']){
    let at=-1,n=0;while((at=source.indexOf(token,at+1))>=0&&n++<5){object.special[token]??=[];object.special[token].push({at,context:sanitize(source.slice(Math.max(0,at-320),Math.min(source.length,at+token.length+780)))})}
   }
  }
  report.workers.push(object);
 }catch(e){report.workers.push({name:w,error:String(e.message||e)})}
}
try{const u='https://ball46.com/api/full-market/health?bttsHubStatic='+Date.now();const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(35000)});const j=await r.json();report.health={status:r.status,data:j};}catch(e){report.health={error:String(e.message||e)}}
await mkdir('audit',{recursive:true});
await writeFile('audit/source-and-routes.json',JSON.stringify(report,null,2));
console.log('BTTS_HUB_STATIC='+JSON.stringify({at:report.at,workers:report.workers.map(x=>({name:x.name,version:x.version,sha:x.sha,length:x.length,first:x.name==='nomadtips3-5usd-hub-343'?x.first:undefined,counts:x.counts,allMatches:x.allMatches?.map(y=>({term:y.term,count:y.count,items:y.items.slice(0,x.name==='nomadtips3-5usd-hub-343'?4:2)})),special:x.special})),health:report.health}).slice(0,54000));
