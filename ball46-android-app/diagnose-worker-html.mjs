import assert from 'node:assert/strict';
const SCRIPT='ball46-production',GOOD='a9025e59-1028-4502-bcc0-6cb062a87ac4',BAD='627f9819-da0a-4a50-98d2-bf12be7ebaec';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true);return j.result}
for(const id of [GOOD,BAD]){
 const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');
 console.log('\nVERSION='+id);
 console.log('BINDINGS='+JSON.stringify(v.bindings));
 console.log('ASSETS='+JSON.stringify(v.assets));
 console.log('PLACEMENT='+JSON.stringify(v.placement));
 const m=v.modules.find(x=>x.name==='index.js');assert(m);
 const s=Buffer.from(m.content_base64,'base64').toString('utf8');
 console.log('INDEX_LEN='+s.length);
 for(const key of ['assets/index.html','index.html','ASSETS','HTMLRewriter','replace(','text()','arrayBuffer()','content-length','Content-Length']){
   let from=0,n=0;while((from=s.indexOf(key,from))>=0&&n<30){console.log('@@ '+key+' @'+from+' '+JSON.stringify(s.slice(Math.max(0,from-900),Math.min(s.length,from+2200))));from+=key.length;n++}
 }
}
