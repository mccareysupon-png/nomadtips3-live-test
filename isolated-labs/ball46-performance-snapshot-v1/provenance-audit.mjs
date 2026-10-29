/*
 Read-only HTML provenance: compare rendered apex/www/direct, path / vs /index.html,
 extract static asset module bytes from Cloudflare current exact active version.
 Never print HTML payload or secret/token. GET requests only.
*/
import {createHash} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
const hash=s=>createHash('sha256').update(s).digest('hex');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
const report={at:new Date().toISOString(),mode:'READ_ONLY',productionWrites:0,
 errors:[],origins:{},comparisons:[],diagnosis:null};
async function cf(path){
 const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('CF_READ_'+r.status);
 const j=await r.json();if(!j.success)throw Error('CF_FAILED');return j.result;
}
async function publicRead(host,path){
 const url=new URL(path,host);
 url.searchParams.set('pv1ReadOnly',String(process.env.GITHUB_RUN_ID||Date.now()));
 const resp=await fetch(url,{method:'GET',headers:{Accept:'text/html','Cache-Control':'no-cache'},signal:AbortSignal.timeout(25000)});
 if(!resp.ok)throw Error('SITE_'+resp.status);
 const body=Buffer.from(await resp.arrayBuffer()).toString('utf8');
 const marker='<script id="b46-daily-performance-runtime">';
 const start=body.indexOf(marker),end=start<0?-1:body.indexOf('</script>',start+marker.length);
 return {body,meta:{status:resp.status,finalUrl:new URL(resp.url).origin,
  bytes:Buffer.byteLength(body),hash:hash(body),contentType:resp.headers.get('content-type'),
  contentEncoding:resp.headers.get('content-encoding'),
  cacheStatus:resp.headers.get('cf-cache-status'),
  cacheControl:resp.headers.get('cache-control'),
  runtimeHash:start<0||end<0?null:hash(body.slice(start+marker.length,end)),
  titleCount:(body.match(/<title\b/ig)||[]).length}};
}
function onlyTags(s){
 const tags=[...s.matchAll(/<(?:script|style|link|meta|div|section|img|span|p)\b[^>]*>/gi)]
  .slice(0,22).map(m=>m[0].replace(/\s+/g,' ').slice(0,130));
 const ids=[...s.matchAll(/\bid=['"]([a-zA-Z0-9:_-]{1,90})['"]/g)].slice(0,20).map(m=>m[1]);
 const tokens={b46pv9:(s.match(/b46-pv9/gi)||[]).length,
  csp:(s.match(/Content-Security-Policy/gi)||[]).length,
  worker:(s.match(/workers\.dev/gi)||[]).length,
  ballot:(s.match(/prediction-vote/gi)||[]).length,
  insertedScriptCount:(s.match(/<script\b/gi)||[]).length,
  cssCount:(s.match(/<style\b/gi)||[]).length};
 return {bytes:Buffer.byteLength(s),sha256:hash(s),tags,ids,tokens};
}
function listScripts(content){
 const entries=[];
 for(const match of content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   const attrs=match[1]||'',body=match[2]||'';
   const id=attrs.match(/\bid=["']([a-zA-Z0-9:_-]+)["']/)?.[1]||null;
   const src=attrs.match(/\bsrc=["']([^"']{1,240})["']/)?.[1]||null;
   entries.push({id,src,bytes:Buffer.byteLength(body),hash:hash(body),
     key:id?'ID:'+id:src?'SRC:'+src:'HASH:'+hash(body)});
 }
 return entries;
}
function unmatchedScripts(left,right){
 const a=listScripts(left),b=listScripts(right);
 const remaining=new Map();
 for(const item of b)remaining.set(item.key,(remaining.get(item.key)||0)+1);
 const missing=[];
 for(const item of a){const count=remaining.get(item.key)||0;if(count)remaining.set(item.key,count-1);
 else missing.push(item)}
 return {scriptCountLeft:a.length,scriptCountRight:b.length,extraInLeft:missing.slice(0,14),
   rightOnly:unmatchedOneWay(b,a).slice(0,14)};
}
function unmatchedOneWay(a,b){
 const remaining=new Map();
 for(const item of b)remaining.set(item.key,(remaining.get(item.key)||0)+1);
 const missing=[];
 for(const item of a){const count=remaining.get(item.key)||0;if(count)remaining.set(item.key,count-1);
 else missing.push(item)}
 return missing;
}
function compare(name,left,right){
 let a=0;const lim=Math.min(left.length,right.length);
 while(a<lim&&left[a]===right[a])a++;
 let b=0;while(b<lim-a&&left[left.length-b-1]===right[right.length-b-1])b++;
 let commonStart=left.slice(0,a),commonEnd=b?left.slice(-b):'';
 const l=left.slice(a,left.length-b),r=right.slice(a,right.length-b);
 report.comparisons.push({pair:name,identical:left===right,prefixChars:a,suffixChars:b,
  commonStartHash:hash(commonStart),commonEndHash:hash(commonEnd),
  leftDifference:onlyTags(l),rightDifference:onlyTags(r),
  scripts:unmatchedScripts(left,right)});
}
let exit=0;
try{
 if(!account||!token)throw Error('AUTH_MISSING');
 const dep=await cf('/scripts/ball46-production/deployments?per_page=1');
 const versions=dep?.deployments?.[0]?.versions||[];
 if(versions.length!==1||Number(versions[0].percentage)!==100)throw Error('ACTIVE_MIXED');
 report.version=versions[0].version_id;
 const version=await cf('/workers/ball46-production/versions/'+report.version+'?include=modules');
 const index=version.modules?.find(x=>x.name==='assets/index.html');
 if(!index?.content_base64)throw Error('INDEX_MODULE_NOT_PRESENT');
 const module=Buffer.from(index.content_base64,'base64').toString('utf8');
 report.moduleIndex={size:Buffer.byteLength(module),hash:hash(module)};
 const inputs=[['apex','https://ball46.com'],['www','https://www.ball46.com'],
  ['direct','https://ball46-production.mccarey-supon.workers.dev']];
 const readings=await Promise.all(inputs.flatMap(([name,host])=>['/','/index.html'].map(async p=>{
  const val=await publicRead(host,p);return {label:name+(p==='/'?'-root':'-index'),...val};
 })));
 for(const r of readings)report.origins[r.label]=r.meta;
 const get=id=>readings.find(x=>x.label===id).body;
 compare('www-index vs direct-index',get('www-index'),get('direct-index'));
 compare('www-root vs direct-root',get('www-root'),get('direct-root'));
 compare('apex-index vs www-index',get('apex-index'),get('www-index'));
 compare('www-root vs www-index',get('www-root'),get('www-index'));
 compare('version-module vs direct-index',module,get('direct-index'));
 compare('version-module vs www-index',module,get('www-index'));
 report.versionAfter=(await cf('/scripts/ball46-production/deployments?per_page=1')).deployments?.[0]?.versions?.[0]?.version_id;
 if(report.version!==report.versionAfter)throw Error('PRODUCTION_CHANGED_DURING_READ');
 report.diagnosis={samePerformanceRuntime:report.origins['www-index'].runtimeHash===report.origins['direct-index'].runtimeHash,
  sameRenderedIndex:report.origins['www-index'].hash===report.origins['direct-index'].hash,
  sameModuleAsDirect:report.moduleIndex.hash===report.origins['direct-index'].hash,
  sameModuleAsWww:report.moduleIndex.hash===report.origins['www-index'].hash,
  note:'Differences shown as tag names/IDs and hashes, not source HTML. No deploy.'};
}catch(e){report.errors.push(String(e.message).slice(0,230));exit=1}
finally{
 await mkdir('reports',{recursive:true});
 await writeFile('reports/ball46-performance-html-provenance.json',JSON.stringify(report,null,2));
 console.log('B46_PROVENANCE='+JSON.stringify(report));
 process.exitCode=exit;
}