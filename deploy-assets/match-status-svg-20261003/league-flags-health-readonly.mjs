import { mkdirSync, writeFileSync } from 'node:fs';
const ORIGIN='https://www.ball46.com';
const OUT='audit/league-flags-readonly';
mkdirSync(OUT,{recursive:true});
const paths=['/api/engine/health','/api/full-market/health','/api/engine/statistics','/api/engine/board'];
const report={checkedAt:new Date().toISOString(),mode:'READ_ONLY',origin:ORIGIN,responses:{}};
for(const path of paths){
  try{
    const url=new URL(path,ORIGIN);url.searchParams.set('healthAudit',`${process.env.GITHUB_RUN_ID||'local'}-${Date.now()}`);
    const r=await fetch(url,{headers:{'Cache-Control':'no-cache','User-Agent':'Ball46-Health-ReadOnly-Audit/1.0'},signal:AbortSignal.timeout(45000)});
    const text=await r.text();
    let json=null;try{json=JSON.parse(text)}catch{}
    report.responses[path]={status:r.status,okHttp:r.ok,contentType:r.headers.get('content-type')||'',json,body:json?undefined:text.slice(0,2000)};
  }catch(error){report.responses[path]={error:error.message};}
}
writeFileSync(`${OUT}/health.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
