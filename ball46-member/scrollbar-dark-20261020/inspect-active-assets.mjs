import assert from 'node:assert/strict';
import {existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const SCRIPT='ball46-member-production',HOST='https://member.ball46.com';
const ROOT='/tmp/ball46-member-live-tree/ball46-member/public',OUT='audit/member-scrollbar-production-preflight';
const hash=x=>createHash('sha256').update(x).digest('hex');
const cf=async path=>{
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(40000)});
  const j=await r.json();assert(r.ok&&j.success,'CLOUDFLARE_API_'+r.status+':'+JSON.stringify(j.errors).slice(0,300));return j.result;
};
function walk(root){
  return readdirSync(root,{withFileTypes:true}).flatMap(x=>{
    let path=join(root,x.name);return x.isDirectory()?walk(path):[path];
  });
}
assert(TOKEN&&ACCOUNT&&existsSync(ROOT),'AUTH_OR_SNAPSHOT_MISSING');
mkdirSync(OUT,{recursive:true});
const d=(await cf('/workers/scripts/'+SCRIPT+'/deployments?per_page=1')).deployments?.[0];
assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_100_PERCENT_SINGLE');
const original=d.versions[0].version_id;
const version=await cf('/workers/workers/'+SCRIPT+'/versions/'+original+'?include=modules');
const domains=(await cf('/workers/domains')).filter(x=>x.service===SCRIPT).map(x=>x.hostname).sort();
assert.deepEqual(domains,['member.ball46.com'],'WRONG_DOMAIN');
assert.deepEqual(version.modules.map(x=>x.name),['worker.js'],'WORKER_MODULE_DRIFT');
assert(version.bindings.some(x=>x.name==='ASSETS'&&x.type==='assets'),'ASSETS_BINDING_MISSING');
assert(version.bindings.filter(x=>x.type==='secret_text').length>=3,'PRODUCTION_SECRETS_MISSING');
const files=walk(ROOT).map(path=>({path:'/'+relative(ROOT,path).replaceAll('\\','/'),absolute:path,size:statSync(path).size})).sort((a,b)=>a.path.localeCompare(b.path));
assert(files.length>=18,'ASSET_FILE_LIST_SUSPICIOUSLY_SMALL');
const headers={'cache-control':'no-cache'};
const versionsUrls=version.urls||[];
const previewBase='https://'+original.slice(0,8)+'-ball46-member-production.mccarey-supon.workers.dev';
const checks=[];
for(let i=0;i<files.length;i+=6){
  const arr=await Promise.all(files.slice(i,i+6).map(async f=>{
    const contents=readFileSync(f.absolute),expected=hash(contents);
    const u=new URL(f.path,HOST);u.searchParams.set('_style_preflight',Date.now().toString(36));
    const r=await fetch(u,{headers,redirect:'manual',signal:AbortSignal.timeout(50000)});
    const response=Buffer.from(await r.arrayBuffer()),status=r.status,actual=hash(response);
    let previewStatus=null,previewHash=null,previewMatch=false,previewLocation=null;
    if(status!==200||actual!==expected){
      const preview=new URL(f.path,previewBase);preview.searchParams.set('_version_probe',Date.now().toString(36));
      const pr=await fetch(preview,{redirect:'manual',signal:AbortSignal.timeout(30000)});
      const pb=Buffer.from(await pr.arrayBuffer());
      previewStatus=pr.status;previewHash=hash(pb);previewMatch=previewStatus===200&&previewHash===expected;
      const location=pr.headers.get('location')||'';
      previewLocation=location.replace(/([?&](?:kid|meta|token|code|state)=)[^&]+/gi,'$1REDACTED').slice(0,170);
    }
    return {path:f.path,size:f.size,sourceSha256:expected,publicStatus:status,publicSha256:actual,match:(status===200&&actual===expected)||previewMatch,
      skippedProtected:status===302||status===403||status===307,previewStatus,previewHash,previewMatch,previewLocation,contentType:r.headers.get('content-type')};
  }));
  checks.push(...arr);
}
const summary={activeVersion:original,activeDeployment:d.id,domains,sourceFiles:files.length,okFiles:checks.filter(x=>x.match).length,
 mismatches:checks.filter(x=>!x.match&&!x.skippedProtected),protected:checks.filter(x=>x.skippedProtected),
 moduleSha256:version.modules.map(x=>({name:x.name,sha:hash(Buffer.from(x.content_base64,'base64'))})),
 bindingTypes:version.bindings.map(x=>({name:x.name,type:x.type})),
 assetConfig:version.assets?.config,versionUrls:versionsUrls,
 previewBase,
 checkedAt:new Date().toISOString(),checks};
writeFileSync(OUT+'/preflight.json',JSON.stringify(summary,null,2));
console.log('MEMBER_SCROLLBAR_ASSET_INVENTORY',JSON.stringify({activeVersion:summary.activeVersion,activeDeployment:summary.activeDeployment,sourceFiles:summary.sourceFiles,okFiles:summary.okFiles,mismatches:summary.mismatches,protected:summary.protected,moduleSha256:summary.moduleSha256,bindingTypes:summary.bindingTypes,assetConfig:summary.assetConfig,versionUrls:summary.versionUrls,previewBase}).slice(0,18000));
assert(summary.mismatches.length===0,'UNVERIFIED_OR_CHANGED_PUBLIC_ASSET');
