import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const D='work/statistics-summary-shadow-20261113';
const OUT=D+'/qa/engine-candidate';
const A='62cb0db544160e6591342abd6b4f35cc';
const W='nomadtips3-engine-343';
const WEBSITE='ball46-production';
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=x=>JSON.stringify(x,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
await mkdir(OUT,{recursive:true});

const report={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,worker:W,normalTrafficToCandidate:0,providerRequestsAdded:0,ledgerWritesByCandidate:0,controlWrites:[],smoke:[]};
let baseline=null,candidate=null,zeroDeployment=null;
async function api(method,path,body){
  const write=method!=='GET';
  if(write){
    const basePath=path.split('?')[0];const allowed=basePath==='/workers/scripts/'+W+'/versions'||basePath==='/workers/scripts/'+W+'/deployments'||basePath==='/workers/workers/'+W+'/versions';
    assert(allowed,'CONTROL_WRITE_DENIED:'+method+':'+path);
    report.controlWrites.push({method,path});
  }
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{
    method,
    headers:{authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...(body&&!(body instanceof FormData)?{'content-type':'application/json'}:{})},
    body:body instanceof FormData?body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(60000)
  });
  const j=await r.json().catch(()=>({success:false,errors:[{message:'NON_JSON'}]}));
  assert(r.ok&&j.success,'CF_'+r.status+':'+JSON.stringify(j.errors));
  return j.result;
}
async function latestDeployment(worker=W){
  const x=await api('GET','/workers/scripts/'+worker+'/deployments?per_page=1');
  assert(Array.isArray(x.deployments)&&x.deployments.length,'NO_DEPLOYMENT:'+worker);
  return x.deployments[0];
}
async function getVersion(id){
  for(let i=0;i<5;i++){
    try{return await api('GET','/workers/workers/'+W+'/versions/'+id+'?include=modules')}
    catch(e){if(i===4||!String(e.message).includes('CF_404'))throw e;await new Promise(r=>setTimeout(r,1200));}
  }
}
async function restore(){
  if(!baseline)return;
  const d=await latestDeployment();
  const already=d.versions.length===1&&d.versions[0].version_id===baseline&&Number(d.versions[0].percentage)===100;
  if(already)return;
  await api('POST','/workers/scripts/'+W+'/deployments',{
    strategy:'percentage',
    versions:[{version_id:baseline,percentage:100}],
    annotations:{'workers/message':'Restore BALL46 Engine baseline after explicit 0% candidate smoke test'}
  });
  const after=await latestDeployment();
  assert(after.versions.length===1&&after.versions[0].version_id===baseline&&Number(after.versions[0].percentage)===100,'BASELINE_RESTORE_FAILED');
}
function counters(rows){
  const c={ledgerTotal:rows.length,settledTotal:0,pending:0,unresolved:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,byMarket:{}};
  for(const row of rows){
    const st=String(row.status||'').toUpperCase();
    if(st==='PENDING')c.pending++;
    else if(st==='UNRESOLVED')c.unresolved++;
    else if(st==='SETTLED'){
      c.settledTotal++;
      const r=String(row.result||'').toUpperCase();
      if(r==='WIN')c.win++; else if(r==='LOSS')c.loss++; else if(r==='PUSH')c.push++; else if(r==='HALF_WIN')c.halfWin++; else if(r==='HALF_LOSS')c.halfLoss++;
      const m=String(row.market||'unknown');c.byMarket[m]=(c.byMarket[m]||0)+1;
    }
  }
  return c;
}
const overrideHeader=id=>W+'="'+id+'"';
async function readCandidate(path){
  const r=await fetch('https://ball46-production.mccarey-supon.workers.dev'+path,{
    headers:{'cache-control':'no-store','Cloudflare-Workers-Version-Overrides':overrideHeader(candidate)},
    redirect:'error',
    signal:AbortSignal.timeout(30000)
  });
  const text=await r.text();let data;try{data=JSON.parse(text)}catch{data={ok:false,error:'NON_JSON',sample:text.slice(0,200)}}
  return {status:r.status,data,headers:Object.fromEntries(r.headers)};
}
async function fullSmoke(){
  let lastConflict=null;
  for(let attempt=1;attempt<=4;attempt++){
    const first=await readCandidate('/api/engine/statistics?'+new URLSearchParams({paged:'1',cursor:'stat:v2:row:\uffff',limit:'2000'}));
    assert.equal(first.status,200,'FIRST_HTTP_'+first.status+':'+JSON.stringify(first.data));
    assert(first.data.ok===true&&Array.isArray(first.data.rows),'FIRST_NOT_OK');
    assert.equal(first.data.statisticsPagination,'CURSOR_PINNED_GENERATION_V1');
    const generation=String(first.data.statisticsGeneration);
    assert(generation&&generation!=='undefined','GENERATION_MISSING');
    const rows=[...first.data.rows],seen=new Set(rows.map(x=>String(x.id))),cursors=new Set();
    let cursor=first.data.nextCursor||null,pages=1,conflict=false;
    while(cursor){
      assert(!cursors.has(cursor),'CURSOR_LOOP');cursors.add(cursor);
      const q=new URLSearchParams({paged:'1',cursor,limit:'2000',generation});
      const next=await readCandidate('/api/engine/statistics?'+q);
      if(next.status===409&&next.data?.error==='STATISTICS_GENERATION_CHANGED'){
        lastConflict={attempt,pages,generation,newGeneration:next.data.statisticsGeneration};
        conflict=true;break;
      }
      assert.equal(next.status,200,'PAGE_HTTP_'+next.status+':'+JSON.stringify(next.data));
      assert(next.data.ok===true&&Array.isArray(next.data.rows),'PAGE_NOT_OK');
      assert.equal(String(next.data.statisticsGeneration),generation,'GENERATION_DRIFT_ACCEPTED');
      assert(next.data.rows.length<=2000,'PAGE_LIMIT_EXCEEDED');
      for(const row of next.data.rows){const id=String(row.id);assert(!seen.has(id),'DUPLICATE_ROW:'+id);seen.add(id);rows.push(row)}
      cursor=next.data.nextCursor||null;pages++;
      assert(pages<64,'PAGE_BUDGET');
    }
    report.smoke.push({attempt,pages,rows:rows.length,generation,conflict});
    if(conflict)continue;
    const c=counters(rows),m=first.data;
    assert.equal(c.ledgerTotal,m.ledgerTotal,'LEDGER_TOTAL_MISMATCH');
    assert.equal(c.settledTotal,m.total,'SETTLED_TOTAL_MISMATCH');
    for(const k of ['pending','unresolved','win','loss','push','halfWin','halfLoss'])assert.equal(c[k],m[k],k.toUpperCase()+'_MISMATCH');
    const keys=new Set([...Object.keys(c.byMarket),...Object.keys(m.byMarket||{})]);
    for(const k of keys)assert.equal(c.byMarket[k]||0,m.byMarket?.[k]||0,'MARKET_MISMATCH:'+k);
    return {ok:true,attempt,pages,rows:rows.length,generation,counters:c};
  }
  throw new Error('REAL_DATA_GENERATION_TOO_VOLATILE:'+JSON.stringify(lastConflict));
}
try{
  const source=JSON.parse(await readFile(D+'/source/active.json'));
  const engine=source.workers.find(x=>x.worker===W),website=source.workers.find(x=>x.worker===WEBSITE);
  assert(engine&&website,'ACTIVE_SOURCE_MISSING');
  const before=await latestDeployment(),webBefore=await latestDeployment(WEBSITE);
  assert(before.versions.length===1&&Number(before.versions[0].percentage)===100,'ENGINE_SPLIT_TRAFFIC_STOP');
  assert(webBefore.versions.length===1&&Number(webBefore.versions[0].percentage)===100,'WEBSITE_SPLIT_TRAFFIC_STOP');
  baseline=before.versions[0].version_id;
  assert.equal(baseline,engine.active,'ENGINE_ACTIVE_DRIFT');
  assert.equal(webBefore.versions[0].version_id,website.active,'WEBSITE_ACTIVE_DRIFT');
  report.before={engineDeployment:before.id,engineVersion:baseline,websiteDeployment:webBefore.id,websiteVersion:website.active};

  const versions=await api('GET','/workers/scripts/'+W+'/versions?per_page=1');const latestUploaded=versions.items?.[0]?.id;report.latestUploaded=latestUploaded;
  const v=await getVersion(baseline),settings=await api('GET','/workers/scripts/'+W+'/settings'),schedules=await api('GET','/workers/scripts/'+W+'/schedules'),subdomain=await api('GET','/workers/scripts/'+W+'/subdomain');
  const currentMain=v.modules.find(m=>m.name===v.main_module);assert(currentMain,'MAIN_MODULE_MISSING');
  assert.equal(sha(Buffer.from(currentMain.content_base64,'base64')),engine.sha,'ENGINE_CAPTURE_SHA_DRIFT');
  const patched=await readFile(D+'/qa/pinned-engine-candidate.js');
  assert(patched.includes('CURSOR_PINNED_GENERATION_V1')&&patched.includes('STATISTICS_GENERATION_CHANGED'),'PINNED_PATCH_MISSING');
  report.baseMainSha=engine.sha;report.candidateMainSha=sha(patched);assert.notEqual(report.baseMainSha,report.candidateMainSha,'PATCH_NOOP');

  const nextModules=v.modules.map(m=>m.name===v.main_module?{name:m.name,content_type:m.content_type,content_base64:patched.toString('base64')}:{name:m.name,content_type:m.content_type,content_base64:m.content_base64});
  const bindings=v.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:baseline}:b);
  const body={
    deploy:false,
    main_module:v.main_module,
    compatibility_date:v.compatibility_date,
    compatibility_flags:v.compatibility_flags||[],
    bindings,
    modules:nextModules,
    annotations:{'workers/tag':'B46_STAT_PINNED_GENERATION_TEST_20261113','workers/message':'Inactive Engine candidate for pinned statistics cursor real-data smoke; explicit baseline binding inheritance; no normal traffic'}
  };
  for(const k of ['limits','placement','cache_options'])if(v[k]!=null)body[k]=v[k];
  if(v.exports)body.exports=v.exports;
  if(v.containers)body.containers=v.containers;
  const reuse=String(process.env.B46_EXISTING_ENGINE_CANDIDATE||'').trim();
  if(reuse){candidate=reuse;report.reusedCandidate=true}else{const made=await api('POST','/workers/workers/'+W+'/versions',body);candidate=made.id;report.reusedCandidate=false}
  report.candidate=candidate;
  assert(candidate&&candidate!==baseline,'CANDIDATE_VERSION_INVALID');
  const cv=await getVersion(candidate),cm=cv.modules.find(m=>m.name===cv.main_module);
  assert.equal(sha(Buffer.from(cm.content_base64,'base64')),report.candidateMainSha,'CANDIDATE_MAIN_HASH');
  assert.deepEqual(cv.modules.filter(m=>m.name!==cv.main_module).map(m=>[m.name,m.content_type,sha(Buffer.from(m.content_base64,'base64'))]).sort(),v.modules.filter(m=>m.name!==v.main_module).map(m=>[m.name,m.content_type,sha(Buffer.from(m.content_base64,'base64'))]).sort(),'NON_MAIN_MODULE_DRIFT');
  report.uploadedInactive=true;
  let d=await latestDeployment();assert(d.versions.length===1&&d.versions[0].version_id===baseline,'UPLOAD_ACTIVATED_TRAFFIC_STOP');

  zeroDeployment=await api('POST','/workers/scripts/'+W+'/deployments',{
    strategy:'percentage',
    versions:[{version_id:baseline,percentage:100},{version_id:candidate,percentage:0}],
    annotations:{'workers/message':'Temporary 0% BALL46 Engine candidate for explicit version-override smoke test only'}
  });
  d=await latestDeployment();
  const percentages=Object.fromEntries(d.versions.map(x=>[x.version_id,Number(x.percentage)]));
  assert.equal(percentages[baseline],100,'BASELINE_NOT_100');assert.equal(percentages[candidate],0,'CANDIDATE_NOT_0');
  report.zeroPercentDeployment=d.id;

  report.realData=await fullSmoke();

  await restore();
  const final=await latestDeployment(),webAfter=await latestDeployment(WEBSITE);
  assert(final.versions.length===1&&final.versions[0].version_id===baseline&&Number(final.versions[0].percentage)===100,'FINAL_ENGINE_NOT_BASELINE');
  assert.equal(webAfter.id,webBefore.id,'WEBSITE_DEPLOYMENT_CHANGED');
  assert.equal(webAfter.versions[0].version_id,website.active,'WEBSITE_VERSION_CHANGED');
  assert.equal(canon(await api('GET','/workers/scripts/'+W+'/schedules')),canon(schedules),'CRON_CHANGED');
  assert.equal(canon(await api('GET','/workers/scripts/'+W+'/subdomain')),canon(subdomain),'SUBDOMAIN_CHANGED');
  report.after={engineDeployment:final.id,engineVersion:baseline,websiteDeployment:webAfter.id,websiteVersion:webAfter.versions[0].version_id};
  report.candidateInactive=true;report.normalTrafficToCandidate=0;report.ok=true;
}catch(e){
  report.ok=false;report.error=String(e.stack||e);
  try{await restore();report.restoreAfterFailure='ok'}catch(r){report.restoreAfterFailure=String(r.stack||r)}
  process.exitCode=1;
}
await writeFile(OUT+'/real-data-candidate.json',JSON.stringify(report,null,2));
console.log('ENGINE_CANDIDATE_REAL_DATA '+JSON.stringify({ok:report.ok,error:report.error,baseline:report.before?.engineVersion,candidate:report.candidate,zeroPercentDeployment:report.zeroPercentDeployment,realData:report.realData,candidateInactive:report.candidateInactive,normalTrafficToCandidate:report.normalTrafficToCandidate,restoreAfterFailure:report.restoreAfterFailure}));
