import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {patchEngine} from './patch.mjs';

const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const engineName='nomadtips3-engine-343';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/workers`;
const publicBase='https://ball46.com/api/engine';
const directBase='https://nomadtips3-engine-343.mccarey-supon.workers.dev';
const audit='audit';
mkdirSync(audit,{recursive:true});
const save=(name,data)=>writeFileSync(`${audit}/${name}`,typeof data==='string'?data:JSON.stringify(data,null,2));
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(k,e)=>k==='annotations'?undefined:(e&&typeof e==='object'&&!Array.isArray(e)?Object.fromEntries(Object.entries(e).sort(([a],[b])=>a.localeCompare(b))):e));

async function api(path,options={}){
  assert(account&&token,'CLOUDFLARE_AUTH_MISSING');
  const response=await fetch(root+path,{...options,signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${token}`,...options.headers}});
  const json=await response.json();
  assert(response.ok&&json.success===true,`CLOUDFLARE_ERROR:${response.status}:${JSON.stringify(json.errors||[])}`);
  return json.result;
}
async function activeVersion(){
  const result=await api(`/scripts/${engineName}/deployments`);
  const versions=result.deployments?.[0]?.versions;
  assert(versions?.length===1&&Number(versions[0].percentage)===100,'ENGINE_ACTIVE_AMBIGUOUS');
  return versions[0].version_id;
}
const version=id=>api(`/workers/${engineName}/versions/${id}?include=modules`);
const settings=()=>api(`/scripts/${engineName}/settings`);
const schedules=()=>api(`/scripts/${engineName}/schedules`);
const activate=id=>api(`/scripts/${engineName}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':'Add bounded Statistics summary and cursor rows API; no UI changes','workers/commit_sha':process.env.GITHUB_SHA}})});
const bindingView=v=>canonical(v.bindings.map(b=>({...b})).sort((a,b)=>a.name.localeCompare(b.name)));
const settingsView=s=>Object.fromEntries(Object.entries(s).filter(([k])=>k!=='annotations'));

async function json(url){
  const u=new URL(url);u.searchParams.set('_',String(Date.now()));
  const r=await fetch(u,{cache:'no-store',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
  assert(r.ok,`HTTP_${r.status}:${u.pathname}`);
  const j=await r.json();assert(j?.ok===true,`NOT_OK:${u.pathname}`);return j;
}
async function legacy(base=publicBase,params={}){
  const u=new URL(base+'/statistics');for(const [k,v]of Object.entries(params))u.searchParams.set(k,String(v));return json(u);
}
function totals(j){
  return Object.fromEntries(['total','ledgerTotal','pending','unresolved','win','loss','push','halfWin','halfLoss'].map(k=>[k,j[k]]));
}
function assertTotals(a,b,label){
  for(const k of Object.keys(totals(a)))assert.equal(a[k],b[k],`${label}:${k}`);
}
function assertRowsEqual(a,b,label){
  assert.equal(a.length,b.length,`${label}:LENGTH`);
  for(let i=0;i<a.length;i++){
    assert.equal(a[i]?.id,b[i]?.id,`${label}:ID:${i}`);
    for(const k of ['status','result','createdAt','settledAt','market','selection','line','odds'])
      assert.equal(canonical(a[i]?.[k]),canonical(b[i]?.[k]),`${label}:${k}:${i}`);
  }
}

let beforeId,candidateId;
try{
  beforeId=await activeVersion();
  const before=await version(beforeId);
  const beforeSettings=await settings(),beforeSchedules=await schedules();
  save('restore-point.json',{engineName,beforeId,beforeSettings,beforeSchedules,commit:process.env.GITHUB_SHA,at:new Date().toISOString()});
  const main=before.modules.find(m=>m.name===before.main_module);assert(main,'ENGINE_MAIN_MISSING');
  const source=Buffer.from(main.content_base64,'base64').toString('utf8');
  assert(source.includes('CURSOR_NO_TOTAL_CAP_V1'),'EXPECTED_CURRENT_STATISTICS_CURSOR_VERSION_MISSING');
  const patched=patchEngine(source);
  save('engine-before.sha256',sha(source));save('engine-after.sha256',sha(patched));
  save('engine-after.js',patched);

  const baseline=await legacy(publicBase);
  assert(Number.isSafeInteger(baseline.ledgerTotal)&&baseline.ledgerTotal>=baseline.total,'BASELINE_TOTALS_INVALID');
  save('baseline-totals.json',totals(baseline));

  const metadata={
    main_module:before.main_module,
    compatibility_date:before.compatibility_date,
    compatibility_flags:beforeSettings.compatibility_flags||[],
    bindings:before.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:'inherit',version_id:'latest'}:{...b}),
    annotations:{'workers/message':'Statistics scale backend v1: summary + bounded rows, preserve legacy API','workers/commit_sha':process.env.GITHUB_SHA}
  };
  for(const key of ['logpush','observability','limits','placement','tail_consumers'])if(beforeSettings[key]!=null)metadata[key]=beforeSettings[key];

  const form=new FormData();
  form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
  for(const m of before.modules){
    const bytes=m.name===before.main_module?Buffer.from(patched):Buffer.from(m.content_base64,'base64');
    form.set(m.name,new Blob([bytes],{type:m.content_type}),m.name);
  }
  const uploaded=await api(`/scripts/${engineName}/versions?bindings_inherit=strict`,{method:'POST',body:form});
  candidateId=uploaded.id;assert(candidateId,'ENGINE_CANDIDATE_MISSING');
  const candidate=await version(candidateId);
  assert.equal(bindingView(candidate),bindingView(before),'BINDINGS_CHANGED');
  assert.equal(candidate.compatibility_date,before.compatibility_date,'COMPATIBILITY_DATE_CHANGED');
  const candidateMain=candidate.modules.find(m=>m.name===candidate.main_module);
  assert.equal(sha(Buffer.from(candidateMain.content_base64,'base64')),sha(patched),'UPLOADED_SOURCE_CHANGED');
  assert.equal(await activeVersion(),beforeId,'ENGINE_CHANGED_BEFORE_ACTIVATION');

  await activate(candidateId);
  for(let i=0;i<12;i++){if(await activeVersion()===candidateId)break;await new Promise(r=>setTimeout(r,3000))}
  assert.equal(await activeVersion(),candidateId,'CANDIDATE_NOT_ACTIVE');

  let summaryPublic,summaryDirect,rows100,legacyAfter;
  let stable=false;
  for(let attempt=1;attempt<=5&&!stable;attempt++){
    const referenceBefore=await legacy(publicBase);
    const referencePage=await legacy(publicBase,{paged:1});
    summaryPublic=await json(publicBase+'/statistics/summary');
    summaryDirect=await json(directBase+'/statistics/summary');
    rows100=await json(publicBase+'/statistics/rows?limit=100');
    legacyAfter=await legacy(publicBase);

    try{
      assert.equal(summaryPublic.statisticsSummary,'STATISTICS_SCALE_BACKEND_V1','PUBLIC_SUMMARY_REVISION');
      assert.equal(summaryDirect.statisticsSummary,'STATISTICS_SCALE_BACKEND_V1','DIRECT_SUMMARY_REVISION');
      assert.equal(summaryPublic.rows.length,0,'SUMMARY_MUST_NOT_RETURN_LEDGER_ROWS');
      assert.equal(rows100.statisticsRows,'STATISTICS_SCALE_BACKEND_V1');
      assert(rows100.returned>0&&rows100.returned<=100,'ROWS_LIMIT_FAILED');
      assert.equal(referenceBefore.ledgerUpdatedAt,legacyAfter.ledgerUpdatedAt,'LEDGER_MOVED_DURING_QA');
      assertTotals(summaryPublic,legacyAfter,'PUBLIC_SUMMARY_TOTAL');
      assertTotals(summaryDirect,legacyAfter,'DIRECT_SUMMARY_TOTAL');
      assertRowsEqual(rows100.rows,referencePage.rows.slice(0,rows100.rows.length),'FIRST_PAGE_ROWS_DIFFER');
      assert.equal(legacyAfter.statisticsPagination,'CURSOR_NO_TOTAL_CAP_V1','LEGACY_ENDPOINT_REVISION_CHANGED');
      stable=true;
    }catch(error){
      if(attempt===5)throw error;
      await new Promise(r=>setTimeout(r,1500));
    }
  }
  assert(stable,'STABLE_STATISTICS_QA_NOT_OBTAINED');

  if(rows100.nextCursor){
    const page2=await json(publicBase+'/statistics/rows?limit=100&cursor='+encodeURIComponent(rows100.nextCursor));
    const ids=new Set(rows100.rows.map(r=>String(r.id)));
    for(const row of page2.rows)assert(!ids.has(String(row.id)),'CURSOR_DUPLICATE_ID');
  }

  const currentSettings=await settings(),currentSchedules=await schedules();
  assert.equal(canonical(settingsView(currentSettings)),canonical(settingsView(beforeSettings)),'ENGINE_SETTINGS_CHANGED');
  assert.equal(canonical(currentSchedules),canonical(beforeSchedules),'ENGINE_SCHEDULES_CHANGED');

  const health=await json(publicBase+'/health');
  save('success.json',{beforeId,candidateId,totals:totals(summaryPublic),summaryBytes:Buffer.byteLength(JSON.stringify(summaryPublic)),rows100Bytes:Buffer.byteLength(JSON.stringify(rows100)),legacyBytes:Buffer.byteLength(JSON.stringify(legacyAfter)),healthVersion:health.version});
  console.log('STATISTICS_SCALE_BACKEND_SUCCESS',JSON.stringify({beforeId,candidateId,totals:totals(summaryPublic),summaryBytes:Buffer.byteLength(JSON.stringify(summaryPublic)),rows100Bytes:Buffer.byteLength(JSON.stringify(rows100)),legacyBytes:Buffer.byteLength(JSON.stringify(legacyAfter))}));
}catch(error){
  save('failure.txt',error.stack||String(error));
  console.error(error);
  if(candidateId&&beforeId&&await activeVersion()===candidateId){
    await api(`/scripts/${engineName}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:beforeId,percentage:100}],annotations:{'workers/message':'Rollback failed Statistics scale backend verification'}})});
    console.log('ENGINE_ROLLED_BACK',beforeId);
  }
  throw error;
}