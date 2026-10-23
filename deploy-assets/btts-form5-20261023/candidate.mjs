/* Stage an ISOLATED Cloudflare Engine343 candidate — NO DEPLOYMENT. */
import assert from'node:assert/strict';
import{mkdir,readFile,writeFile}from'node:fs/promises';
import{createHash}from'node:crypto';
import{spawnSync}from'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,w='nomadtips3-engine-343';
assert.equal(account,'62cb0db544160e6591342abd6b4f35cc');assert(token);
const root='https://api.cloudflare.com/client/v4/accounts/'+account;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function api(p,body){
 if(body!==undefined)assert.equal(p,'/workers/scripts/'+w+'/versions?bindings_inherit=strict','WRITES_MUST_BE_CANDIDATE_ONLY');
 const r=await fetch(root+p,{method:body!==undefined?'POST':'GET',headers:{authorization:'Bearer '+token},body,signal:AbortSignal.timeout(90000)});
 const j=await r.json();if(!r.ok||!j.success)throw Error('CF_'+r.status+':'+JSON.stringify(j.errors).slice(0,280));return j.result;
}
async function active(){const d=(await api('/workers/scripts/'+w+'/deployments?per_page=1')).deployments[0];assert(d.versions.length===1&&d.versions[0].percentage===100);return{id:d.versions[0].version_id,deployment:d.id};}
const path='deploy-assets/btts-form5-20261023/',out={at:new Date().toISOString(),ok:false,enabled:false};await mkdir(path+'audit',{recursive:true});
try{
 const before=await active(),v=await api('/workers/workers/'+w+'/versions/'+before.id+'?include=modules'),settings=await api('/workers/scripts/'+w+'/settings');
 const main=v.modules.find(x=>x.name===v.main_module);assert(main&&main.content_base64);
 const src=Buffer.from(main.content_base64,'base64').toString();
 const tail=/export\s*\{\s*Nomad343Engine2 as Nomad343Engine\s*,\s*index_bulk_recovery_default as default\s*\};/;
 assert(tail.test(src),'LATEST_ENGINE_EXPORT_DIFFERENT');
 assert(src.includes('async upsertLedgerRows(')&&src.includes('async statisticsLedgerResponse(')&&src.includes('var STAT_LEDGER_PREFIX = "stat:v2:row:"'),'LEDGER_API_CHANGED');
 assert(src.includes('ft_btts_yes:')&&src.includes('ft_btts_no:')&&src.includes('function settleMarketSignal('),'NATIVE_BTTS_FT_MISSING');
 const addition=[
 '/* BALL46 Form5 disabled-safe candidate, existing scan/ledger unchanged. */',
 'const __form5Engine=extendEngineWithForm5(Nomad343Engine2,{enabled:false});',
 'const __form5Entry={',
 '  ...index_bulk_recovery_default,',
 '  async fetch(request,env){',
 '    const u=new URL(request.url);',
 '    if(request.method==="GET"&&u.pathname==="/form5-health")',
 '      return cors(request,await stub(env).fetch("https://engine.internal/form5-health"));',
 '    return index_bulk_recovery_default.fetch(request,env);',
 '  },',
 '  async scheduled(event,env,ctx){',
 '    ctx.waitUntil((async()=>{',
 '      await stub(env).fetch("https://engine.internal/scan",{method:"POST"});',
 '      await stub(env).fetch("https://engine.internal/form5-cycle",{method:"POST"});',
 '    })());',
 '  }',
 '};',
 'export {__form5Engine as Nomad343Engine,__form5Entry as default};'
 ].join('\n');
 const patch='import {extendEngineWithForm5} from "./btts-form5-runtime.mjs";\n'+src.replace(tail,addition);
 assert(patch.length>src.length&&patch.includes('enabled:false'));
 const file=path+'audit/patched-engine.mjs';await writeFile(file,patch);
 const check=spawnSync('node',['--check',file],{encoding:'utf8'});assert.equal(check.status,0,'SOURCE_SYNTAX_'+check.stderr.slice(0,150));
 const binds=(v.bindings||[]).map(b=>b.type==='secret_text'?{type:'inherit',name:b.name}:b);
 const meta={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:binds,
  annotations:{'workers/tag':'B46_BTTS_FORM5_CANDIDATE_DISABLED_20261023','workers/message':'BTTS five recent matches; disabled isolated candidate; no production change'}};
 if(v.assets){meta.keep_assets=true;meta.assets={config:v.assets.config};}
 for(const k of['usage_model','observability','placement'])if(settings[k]!=null)meta[k]=settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(meta)],{type:'application/json'}));
 for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?patch:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 for(const [remote,local]of [['btts-form5-runtime.mjs','form5-runtime.mjs'],['form5.mjs','form5.mjs'],['ledger-adapter.mjs','ledger-adapter.mjs']])
  form.set(remote,new Blob([await readFile(path+local)],{type:'application/javascript+module'}),remote);
 assert.equal((await active()).id,before.id,'PRODUCTION_CHANGED_PRE_CANDIDATE');
 const candidate=(await api('/workers/scripts/'+w+'/versions?bindings_inherit=strict',form)).id;
 const cv=await api('/workers/workers/'+w+'/versions/'+candidate+'?include=modules');
 assert.equal(cv.modules.length,v.modules.length+3,'SOME_MODULES_MISSING');
 assert.equal(cv.annotations?.['workers/tag'],'B46_BTTS_FORM5_CANDIDATE_DISABLED_20261023');
 for(const b of v.bindings||[])assert(cv.bindings?.some(x=>x.name===b.name&&x.type===b.type),'BINDING_LOST_'+b.name);
 assert.equal((await active()).id,before.id,'CANDIDATE_CHANGED_LIVE_TRAFFIC');
 out.base=before;out.candidate=candidate;out.preview='https://'+candidate.slice(0,8)+'-'+w+'.mccarey-supon.workers.dev';
 out.moduleCount=cv.modules.length;out.originalSha=sha(Buffer.from(src));out.candidateSha=sha(Buffer.from(patch));
 out.bindings=cv.bindings?.map(b=>({name:b.name,type:b.type}));out.ok=true;out.trafficChanged=false;
 console.log('B46_FORM5_CANDIDATE='+JSON.stringify({ok:true,base:before,candidate,modules:cv.modules.length,bindings:out.bindings,preview:out.preview,enabled:false,productionChanged:false}));
}catch(e){out.error=String(e.stack||e);console.error('B46_FORM5_CANDIDATE_ERROR='+String(e.message||e));process.exitCode=1}
await writeFile(path+'audit/candidate.json',JSON.stringify(out,null,2));
