import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!account||!token) throw new Error('CLOUDFLARE_AUTH_MISSING');
const OUT='audit/engine-sqlite-readonly';
mkdirSync(OUT,{recursive:true});
const root=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const headers={Authorization:`Bearer ${token}`,Accept:'application/json'};
const sha=b=>createHash('sha256').update(b).digest('hex');

async function cf(path){
  const r=await fetch(root+path,{headers,signal:AbortSignal.timeout(60000)});
  const text=await r.text();
  let json=null;try{json=JSON.parse(text)}catch{}
  return {ok:r.ok&&json?.success===true,status:r.status,json,text:text.slice(0,2000)};
}
async function publicJson(path){
  const u=new URL(path,'https://www.ball46.com');u.searchParams.set('engineAudit',`${process.env.GITHUB_RUN_ID||'local'}-${Date.now()}`);
  const r=await fetch(u,{headers:{'Cache-Control':'no-cache','User-Agent':'Ball46-Engine-SQLite-ReadOnly/1.0'},signal:AbortSignal.timeout(45000)});
  const text=await r.text();let json=null;try{json=JSON.parse(text)}catch{}
  return {status:r.status,okHttp:r.ok,json,body:json?undefined:text.slice(0,2000)};
}
function scan(text){
  const needles=['sqlite','insert into','update ','delete from','create table','prepare(','batch(','exec(','json.stringify','snapshot','history','fixture','signal','statistic','board','d1'];
  const lower=text.toLowerCase(),hits=[];
  for(const needle of needles){
    let pos=0,count=0;
    while((pos=lower.indexOf(needle,pos))>=0&&count<20){
      hits.push({needle,pos,context:text.slice(Math.max(0,pos-220),Math.min(text.length,pos+needle.length+320)).replace(/\s+/g,' ')});
      pos+=needle.length;count++;
    }
  }
  return hits;
}

const report={checkedAt:new Date().toISOString(),mode:'READ_ONLY',health:{},workers:[]};
for(const p of ['/api/engine/health','/api/engine/board','/api/engine/signals','/api/engine/statistics']) report.health[p]=await publicJson(p);

const candidates=['nomadtips3-engine-343','nomadtips3-engine-343-production'];
for(const name of candidates){
  const row={name};
  const dep=await cf(`/workers/scripts/${encodeURIComponent(name)}/deployments?per_page=3`);
  row.deployments={ok:dep.ok,status:dep.status,error:dep.ok?null:(dep.json?.errors||dep.text)};
  if(!dep.ok){report.workers.push(row);continue;}
  const versions=dep.json?.result?.deployments?.[0]?.versions||[];
  row.activeVersions=versions;
  if(versions.length!==1||Number(versions[0]?.percentage)!==100){row.error='ACTIVE_VERSION_NOT_SINGLE_100';report.workers.push(row);continue;}
  const vid=versions[0].version_id;row.versionId=vid;
  const ver=await cf(`/workers/workers/${encodeURIComponent(name)}/versions/${encodeURIComponent(vid)}?include=modules`);
  row.versionFetch={ok:ver.ok,status:ver.status,error:ver.ok?null:(ver.json?.errors||ver.text)};
  if(!ver.ok){report.workers.push(row);continue;}
  const v=ver.json.result||{};
  row.mainModule=v.main_module||null;
  row.compatibilityDate=v.compatibility_date||null;
  row.bindings=(v.bindings||[]).map(b=>({name:b.name,type:b.type,service:b.service,environment:b.environment,database_name:b.database_name,database_id:b.database_id,namespace_id:b.namespace_id}));
  row.modules=[];
  for(const m of v.modules||[]){
    const bytes=Buffer.from(m.content_base64||'','base64');
    const safe=String(m.name||'module').replace(/[^a-zA-Z0-9_.-]+/g,'_');
    const meta={name:m.name,type:m.content_type,size:bytes.length,sha:sha(bytes)};
    if(/^text|javascript|ecmascript|application\/javascript/i.test(String(m.content_type||''))||/\.(m?js|cjs|txt|json)$/i.test(String(m.name||''))){
      const text=bytes.toString('utf8');
      writeFileSync(`${OUT}/${name}-${safe}`,text);
      const hits=scan(text);meta.scanHits=hits.length;writeFileSync(`${OUT}/${name}-${safe}.scan.json`,JSON.stringify(hits,null,2));
    }
    row.modules.push(meta);
  }
  report.workers.push(row);
}
writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({health:Object.fromEntries(Object.entries(report.health).map(([k,v])=>[k,{status:v.status,ok:v.json?.ok,lastError:v.json?.lastError,version:v.json?.version,fixtures:v.json?.fixtures?.length,rows:v.json?.rows?.length}])),workers:report.workers},null,2));