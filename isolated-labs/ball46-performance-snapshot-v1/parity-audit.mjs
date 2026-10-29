import {writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {parse} from 'acorn';
import {buildDailySnapshot,validateSummary} from './snapshot.mjs';

// Reads only site /api/engine/statistics and Cloudflare current deployment metadata.
// NEVER stores raw Ledger, calls providers directly, writes to Production or deploys.
const O='https://www.ball46.com';
const out={schema:'ball46-performance-snapshot-parity-v1',checkedAtUtc:new Date().toISOString(),
  mode:'READ_ONLY_BRANCH',productionWrites:0,providerDirectCalls:0,rawLedgerStored:false,
  checks:{},errors:[]};
const hash=s=>createHash('sha256').update(s).digest('hex');
const check=(k,pass,detail=null)=>{out.checks[k]={pass:Boolean(pass),detail};if(!pass)out.errors.push('CHECK_FAILED:'+k)};
async function get(path){
  const t=performance.now();
  const res=await fetch(O+path,{method:'GET',signal:AbortSignal.timeout(45000),
    headers:{Accept:path.includes('/api/')?'application/json':'text/html'}});
  if(!res.ok)throw Error('SITE_HTTP_'+res.status+'_'+path);
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length>65000000)throw Error('PAYLOAD_GUARD');
  return {bytes,ms:Math.round(performance.now()-t)};
}
async function active(){
  const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
  if(!account||!token)throw Error('CF_READ_CREDENTIALS_MISSING');
  const u='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/ball46-production/deployments?per_page=1';
  const r=await fetch(u,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error('CF_READ_HTTP_'+r.status);
  const d=await r.json(),v=d?.result?.deployments?.[0]?.versions||[];
  if(d.success!==true||v.length!==1||Number(v[0].percentage)!==100)throw Error('ACTIVE_VERSION_NOT_EXCLUSIVE');
  return v[0].version_id;
}
function refAggregate(runtime,rows,nowMs){
  const tz=runtime.match(/\bTZ\s*=\s*['"]([^'"]+)['"]/);
  const cut=runtime.match(/\bCUT\s*=\s*(\d+)/);
  if(tz?.[1]!=='Europe/London'||Number(cut?.[1])!==6)throw Error('PROD_LONDON_DAY_CHANGED');
  const ast=parse(runtime,{ecmaVersion:'latest',sourceType:'script'});
  // Use declarations from the CURRENT production source, rather than assuming
  // helper names from an older deployment. Never execute the full page runtime.
  const found=new Map();
  function visit(n){
    if(!n||typeof n!=='object')return;
    if(n.type==='FunctionDeclaration'&&n.id?.name){
      const name=n.id.name;
      if(!found.has(name))found.set(name,{at:n.start,code:runtime.slice(n.start,n.end)});
    }
    if(n.type==='VariableDeclarator'&&n.id?.type==='Identifier'&&
       (n.init?.type==='ArrowFunctionExpression'||n.init?.type==='FunctionExpression')){
      const name=n.id.name;
      if(!found.has(name))found.set(name,{at:n.start,code:'const '+name+'='+runtime.slice(n.init.start,n.init.end)+';'});
    }
    for(const [k,v] of Object.entries(n)){
      if(k==='start'||k==='end')continue;
      if(Array.isArray(v))v.forEach(visit);
      else if(v&&typeof v==='object')visit(v);
    }
  }
  visit(ast);
  for(const name of ['aggregate','rate','avgOdds'])if(!found.has(name))throw Error('PROD_FN_MISSING_'+name);
  const pure=[...found.values()].sort((a,b)=>a.at-b.at).map(x=>x.code).join('\n');
  class FixedDate extends Date{static now(){return nowMs}}
  const sandbox=vm.createContext({rows,Date:FixedDate,Intl,TZ:tz[1],CUT:Number(cut[1])});
  const call='\nconst val=aggregate(rows);globalThis.output={tk:val.tk,yk:val.yk,'+
    'today:{...val.today,winRate:rate(val.today),avgOdds:avgOdds(val.today)},'+
    'yesterday:{...val.yesterday,winRate:rate(val.yesterday),avgOdds:avgOdds(val.yesterday)}};';
  vm.runInContext(pure+call,sandbox,{timeout:30000});
  return {value:sandbox.output,sha256:hash(pure)};
}
function compare(snapshot,ref){
  const diffs=[];
  for(const p of ['today','yesterday']){
    for(const k of ['win','loss','push','pending','oddsSum','oddsCount','winRate','avgOdds']){
      const a=snapshot[p]?.[k],b=ref[p]?.[k];
      if(!(k==='oddsSum'?Math.abs(a-b)<0.000001:Object.is(a,b)))
        diffs.push({period:p,key:k,new:a,existing:b});
    }
    // The current production card omits market-family counters from its aggregate.
    // Compare those only when its reference explicitly exposes the same structure.
    if(ref[p]?.markets)for(const m of ['AH','O/U','1X2'])for(const k of ['win','loss','push']){
      const a=snapshot[p]?.markets?.[m]?.[k],b=ref[p]?.markets?.[m]?.[k];
      if(a!==b)diffs.push({period:p,key:m+'.'+k,new:a,existing:b});
    }
  }
  if(snapshot.londonDay.today!==ref.tk)diffs.push({key:'todayDay',new:snapshot.londonDay.today,existing:ref.tk});
  if(snapshot.londonDay.yesterday!==ref.yk)diffs.push({key:'yesterdayDay',new:snapshot.londonDay.yesterday,existing:ref.yk});
  return diffs;
}
let code=1;
try{
  out.activeBefore=await active();
  const html=await get('/index.html');
  const text=html.bytes.toString('utf8');
  const needle='<script id="b46-daily-performance-runtime">';
  const start=text.indexOf(needle),end=text.indexOf('</script>',start+needle.length);
  if(start<0||end<0)throw Error('ACTIVE_CARD_SCRIPT_MISSING');
  const runtime=text.slice(start+needle.length,end);
  out.runtime={sha256:hash(runtime),bytes:Buffer.byteLength(runtime),htmlBytes:html.bytes.length,
    refreshMs:Number(runtime.match(/\bREFRESH\s*=\s*(\d+)/)?.[1]||0),
    paged:runtime.includes('while(cursor)')};
  check('active_runtime_detected',out.runtime.paged&&out.runtime.refreshMs===10000);
  const response=await get('/api/engine/statistics');
  // Full real Ledger is parsed in memory, never committed, archived or logged.
  const payload=JSON.parse(response.bytes.toString('utf8'));
  if(payload?.ok!==true||!Array.isArray(payload.rows))throw Error('LEDGER_BAD_RESPONSE');
  const rows=payload.rows;
  out.ledger={rows:rows.length,ledgerTotal:payload.ledgerTotal,settledTotal:payload.total,
    payloadBytes:response.bytes.length,responseMs:response.ms,
    revision:payload.settlementRevision??null,updatedAt:payload.ledgerUpdatedAt??null};
  check('full_ledger',rows.length===Number(payload.ledgerTotal)&&rows.length>0);
  if(!out.checks.full_ledger.pass)throw Error('PARTIAL_LEDGER');
  const now=Date.now(),started=performance.now();
  const snapshot=buildDailySnapshot(rows,{asOfMs:now,ledgerRevision:payload.settlementRevision??null});
  validateSummary(snapshot);
  out.snapshotComputationMs=Math.round(performance.now()-started);
  const ref=refAggregate(runtime,rows,now);
  out.referenceFunctionsSha256=ref.sha256;
  const diffs=compare(snapshot,ref.value);
  out.differences=diffs.slice(0,30);
  out.parityScope={visibleCardFields:['win','loss','push','pending','oddsSum','oddsCount','winRate','avgOdds'],periods:['today','yesterday'],marketFamiliesChecked:Boolean(ref.value.today?.markets&&ref.value.yesterday?.markets)};
  check('production_ledger_parity',diffs.length===0,{differenceCount:diffs.length});
  out.snapshot=snapshot;  // aggregate values only; no individual rows or user IDs
  out.activeAfter=await active();
  check('active_unchanged',out.activeBefore===out.activeAfter);
  code=Object.values(out.checks).every(x=>x.pass)?0:1;
}catch(e){out.errors.push('ABORT:'+String(e?.message||e).slice(0,220))}
finally{
  await mkdir('reports',{recursive:true});
  await writeFile('reports/ball46-snapshot-v1-parity.json',JSON.stringify(out,null,2)+'\n');
  const summary=['# BALL46 Snapshot V1 — isolated read-only parity',
    'Active version before: '+(out.activeBefore||'unknown'),
    'Active version after: '+(out.activeAfter||'unknown'),
    'Ledger rows: '+(out.ledger?.rows??'?')+'/'+(out.ledger?.ledgerTotal??'?'),
    'Response bytes: '+(out.ledger?.payloadBytes??'?'),
    'Compute ms: '+(out.snapshotComputationMs??'?'),
    ...Object.entries(out.checks).map(([k,v])=>k+': '+(v.pass?'PASS':'FAIL')),
    'Errors: '+out.errors.join(', '),
    'No Production writes, deployments, direct 5USD requests or raw Ledger artifact.'].join('\n')+'\n';
  await writeFile('reports/ball46-snapshot-v1-summary.md',summary);
  if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,summary,{flag:'a'});
  console.log('B46_SNAPSHOT_V1_RESULT='+JSON.stringify({activeBefore:out.activeBefore,activeAfter:out.activeAfter,
    ledger:out.ledger,snapshot:out.snapshot,checks:out.checks,differences:out.differences,errors:out.errors,
    computeMs:out.snapshotComputationMs}));
  process.exitCode=code;
}