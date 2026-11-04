import assert from'node:assert/strict';import{readFile,writeFile}from'node:fs/promises';import{execFileSync}from'node:child_process';import{parse}from'acorn';
import{ROOT,DIR,PRIVATE,W,TAG,ASSET,NEW_QUERY,MODULE,sha,canon,writes,init,cf,active,version,modules,config,get,health,patchHTML,publicInventory,checkPublic,preview,traffic,converge,json}from'./release-ops.mjs';
const phase=process.argv[2];assert(['stage','activate','restore'].includes(phase));await init();const report={phase,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,at:new Date().toISOString(),worker:W,writes};let switched=false,prior;
try{
if(phase==='stage'){
const prepared=JSON.parse(await readFile(ROOT+'/audit/inspection.json')),tests=JSON.parse(await readFile(ROOT+'/audit/unit-tests.json')),browser=JSON.parse(await readFile(ROOT+'/audit/browser-tests.json')),comparison=JSON.parse(await readFile(ROOT+'/audit/request-comparison.json')),build=JSON.parse(await readFile(ROOT+'/audit/build.json'));
assert(tests.ok&&tests.passed===22&&browser.ok&&browser.results.length===2&&comparison.ok&&comparison.increased.length===0,'EXISTING_TEST_PROOF_REQUIRED');
const script=await readFile(ROOT+'/stage/dashboard-after.js','utf8');assert.equal(sha(script),build.afterSha);assert.equal(build.beforeSha,prepared.dashboard.sha);assert.equal(build.afterSha,'fd6202e8154f7ee6dd3c1b1bd589ef64e2580781cbb70bdadd8d6a68e2c82d50');
report.before=await active();report.base=report.before.version;const base=await version(report.base);await writeFile(PRIVATE+'/base-version.json',JSON.stringify(base));report.baseModules=modules(base);report.configBefore=await config();
for(const w of['nomadtips3-5usd-hub-343','nomadtips3-engine-343','nomadtips3-full-market-343-ball46'])assert.equal(report.configBefore.services[w],prepared.workers[w].version,'PROTECTED_SOURCE_CHANGED:'+w);
report.healthBefore=await health();
const htmlR=await get('https://ball46.com','/'),assetR=await get('https://ball46.com',new URL(prepared.dashboard.url).pathname+new URL(prepared.dashboard.url).search);assert.equal(htmlR.status,200);assert.equal(assetR.sha,build.beforeSha,'CURRENT_DASHBOARD_SOURCE_CHANGED');
const html=htmlR.body.toString(),changedHTML=patchHTML(html);report.publicBefore=await publicInventory(html);
report.expected=report.publicBefore.map(p=>{const pathname=new URL(p.path,'https://ball46.com').pathname;return['/','/index.html'].includes(pathname)?{...p,sha:sha(changedHTML)}:p});report.expected.push({path:ASSET+'?v='+NEW_QUERY,status:200,sha:build.afterSha});
const source=Buffer.from(base.modules.find(m=>m.name===base.main_module).content_base64,'base64').toString();assert(!source.includes('__b46Screen5Previous'));assert(!base.modules.some(m=>m.name===MODULE));
const nodes=parse(source,{sourceType:'module',ecmaVersion:'latest'}).body.filter(n=>n.type==='ExportDefaultDeclaration');assert.equal(nodes.length,1);const n=nodes[0];assert.equal(n.declaration.type,'ObjectExpression');const prefix=source.slice(0,n.start),original=source.slice(n.start,n.declaration.start);assert.equal(original.trim(),'export default');
const renamed=prefix+'const __b46Screen5Previous='+source.slice(n.declaration.start);assert.equal(renamed.slice(0,prefix.length)+original+renamed.slice(prefix.length+'const __b46Screen5Previous='.length),source,'SOURCE_REVERSAL_FAILED');
const htmlPatch=patchHTML.toString().replace('function patchHTML','function __b46Screen5HTML').replaceAll('assert.equal(count,1,','__b46Screen5Equal(count,1,');
const suffix='\nfunction __b46Screen5Equal(a,b){if(a!==b)throw Error("SCREEN5_HTML_DRIFT")}\n'+htmlPatch+'\nexport default{...__b46Screen5Previous,async fetch(request,env,ctx){const u=new URL(request.url);if(u.pathname==='+JSON.stringify(ASSET)+'&&u.searchParams.get("v")==='+JSON.stringify(NEW_QUERY)+'&&["GET","HEAD"].includes(request.method))return new Response(request.method==="HEAD"?null:__b46Screen5Script,{headers:{"content-type":"application/javascript; charset=utf-8","cache-control":"public, max-age=31536000, immutable","x-content-type-options":"nosniff","x-ball46-screen-refresh":"5s-cache-only"}});const r=await __b46Screen5Previous.fetch(request,env,ctx);if(request.method!=="GET"||!["/","/index.html"].includes(u.pathname)||!r.ok||!(r.headers.get("content-type")||"").includes("text/html"))return r;const headers=new Headers(r.headers);headers.delete("etag");headers.delete("content-length");headers.set("cache-control","no-store");return new Response(__b46Screen5HTML(await r.text()),{status:r.status,statusText:r.statusText,headers})}};\n';
const changed='import __b46Screen5Script from "./'+MODULE+'";\n'+renamed+suffix;parse(changed,{sourceType:'module',ecmaVersion:'latest'});await writeFile(PRIVATE+'/candidate-runtime.mjs',changed);execFileSync(process.execPath,['--check',PRIVATE+'/candidate-runtime.mjs']);
const extra={name:MODULE,content_type:'text/plain',content_base64:Buffer.from(script).toString('base64')},expected=[...base.modules.map(m=>m.name===base.main_module?{...m,content_base64:Buffer.from(changed).toString('base64')}:m),extra];
await writeFile(PRIVATE+'/expected-modules.json',JSON.stringify(expected));
report.boundary={originalMainSha:sha(source),candidateMainSha:sha(changed),originalSourceReversible:true,preservedModules:base.modules.length-1,addedModule:MODULE,changedPublicAsset:ASSET,originalAssetSha:build.beforeSha,candidateAssetSha:build.afterSha,htmlChange:'Only shared dashboard script cache-busting query',engineSourceUnchanged:true,hubSourceUnchanged:true,fullMarketSourceUnchanged:true,ownerSettingWrites:0};
const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:b.type,version_id:'latest'}:b),keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':TAG,'workers/message':'Owner-approved 5s cached score display; preserve Engine and provider cadence'}};
for(const k of['usage_model','logpush','limits','observability','placement'])if(report.configBefore.settings[k]!=null)metadata[k]=report.configBefore.settings[k];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const m of expected)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
assert.equal((await active()).version,report.base);assert.equal(canon(await config()),canon(report.configBefore));
const result=await cf('/workers/scripts/'+W+'/versions',form);report.candidate=result.id;await json('candidate.json',report);
const v=await version(report.candidate);assert.equal(v.annotations?.['workers/tag'],TAG);assert.deepEqual(modules(v),modules({modules:expected}));assert.equal(canon(v.bindings),canon(base.bindings));for(const k of['assets','compatibility_date','compatibility_flags'])assert.equal(canon(v[k]),canon(base[k]),'VERSION_CONFIG_CHANGED:'+k);
await checkPublic(preview(report.candidate),report.expected);assert.equal(canon(await config()),canon(report.configBefore));assert.equal((await active()).version,report.base);
report.candidateVerified=true;report.ok=true;await json('candidate.json',report);
}else{
prior=JSON.parse(await readFile(DIR+'/candidate.json'));assert(prior.ok&&prior.candidateVerified);report.base=prior.base;report.candidate=prior.candidate;
assert.equal((await active()).version,phase==='restore'?prior.candidate:prior.base);assert.equal(canon(await config()),canon(prior.configBefore),'CONFIG_DRIFT');
if(phase==='restore'){report.deployment=await traffic(prior.base,prior.candidate,'Restore immediate baseline after screen refresh validation failure');await converge(prior.base,prior.publicBefore);report.restored=true;}
else{
const proof=JSON.parse(await readFile(DIR+'/candidate-browser.json'));assert(proof.ok&&proof.candidate===prior.candidate&&proof.scriptSha===prior.boundary.candidateAssetSha&&proof.results.length===2&&proof.results.every(x=>x.ok),'CANDIDATE_BROWSER_REQUIRED');
await checkPublic('https://ball46.com',prior.publicBefore);await checkPublic(preview(prior.candidate),prior.expected);report.healthBefore=await health();
report.deployment=await traffic(prior.candidate,prior.base,'Activate owner-approved 5s cached live display only');switched=true;report.activated=true;await json('activation.json',report);
await converge(prior.candidate,prior.expected);for(const host of['https://ball46.com','https://www.ball46.com'])await checkPublic(host,prior.expected);
report.healthAfter=await health();assert.equal(report.healthAfter.ownerConfiguredSeconds,report.healthBefore.ownerConfiguredSeconds,'OWNER_BULK_SETTING_CHANGED');assert.equal(canon(await config()),canon(prior.configBefore),'CONFIG_AFTER_CHANGED');
report.ok=true;await json('activation.json',report);
}report.ok=true;
}
report.active=await active();report.finishedAt=new Date().toISOString();await json(phase==='stage'?'candidate.json':phase==='activate'?'activation.json':'rollback.json',report);console.log(JSON.stringify({phase,ok:report.ok,base:report.base,candidate:report.candidate,active:report.active,publicAssets:report.expected?.length??prior?.expected.length,sourceBoundary:report.boundary}));
}catch(e){report.ok=false;report.error=e.stack;if(switched)try{if((await active()).version===prior.candidate){await traffic(prior.base,prior.candidate,'Automatic restore after screen refresh verification failure');await converge(prior.base,prior.publicBefore);report.restored=true;}}catch(f){report.restoreError=f.message;}
await json(phase==='stage'?'candidate-failure.json':phase==='activate'?'activation-failure.json':'rollback-failure.json',report);console.error(e.stack);process.exitCode=1;}


