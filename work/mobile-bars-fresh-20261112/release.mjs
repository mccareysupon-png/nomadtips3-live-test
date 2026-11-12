import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {ROOT,DIR,PRIVATE,W,TAG,sha,canon,writes,init,cf,active,version,modules,config,get,health,publicInventory,htmlReferenceSha,inlineSha,checkPublic,preview,traffic,converge,json,ledgerSnapshot,verifyLedger} from './release-ops.mjs';
import {patchProductionHTML} from './production-patch.mjs';
await init();const phase=process.argv[2];assert(['stage','activate','finish','rollback'].includes(phase));
const report={phase,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,at:new Date().toISOString(),worker:W,writes};
async function preserve(a,b){for(const k of ['bindings','assets','compatibility_date','compatibility_flags'])assert.equal(canon(a[k]),canon(b[k]),'VERSION_CONFIG_CHANGED:'+k)}
try{if(phase==='stage'){
 const build=JSON.parse(await readFile(ROOT+'/stage/report.json')),tests=JSON.parse(await readFile(ROOT+'/qa/results.json'));assert(build.ok&&tests.ok&&tests.cases===10);
 report.before=await active();assert.deepEqual(report.before,build.active,'PRODUCTION_CHANGED_SINCE_BUILD');report.base=report.before.version;report.healthBefore=await health();
 const base=await version(report.base),cfg=await config();await writeFile(PRIVATE+'/base-version.json',JSON.stringify(base));report.configFingerprint=sha(canon(cfg));report.baseModules=modules(base);
 const main=await readFile(ROOT+'/stage/index.mjs');assert.equal(sha(main),build.source.after);assert.equal(report.baseModules.find(x=>x.name===base.main_module).sha,build.source.before);
 const root=await get('https://ball46.com','/');assert.equal(root.status,200);report.publicBefore=await publicInventory(root.body.toString());
 for(const path of ['/','/index.html']){const r=await get('https://ball46.com',path);assert.equal(r.status,200);const html=r.body.toString();assert(!html.includes('b46-favorites-20261110.js?'),'FAVORITES_NOT_AUTHORIZED_IN_THIS_RELEASE');report.publicBefore.find(x=>x.path===path).htmlProof={references:htmlReferenceSha(html),inline:inlineSha(html)};}
 report.expected=report.publicBefore.map(x=>({...x}));for(const path of ['/','/index.html']){const r=await get('https://ball46.com',path),changed=patchProductionHTML(r.body.toString());report.expected.find(x=>x.path===path).htmlProof={references:htmlReferenceSha(changed),inline:inlineSha(changed)}}report.ledgerBefore=await ledgerSnapshot();report.build=build;
 const fs=await readFile(ROOT+'/candidate/expanded-match-343.js');for(const item of report.expected)if(item.path.startsWith('/expanded-match-343.js'))item.sha=sha(fs);const newPath='/expanded-match-343.js?v=b46-mobile-bars-fresh-20261112';if(!report.expected.some(x=>x.path===newPath))report.expected.push({path:newPath,status:200,sha:sha(fs)});

 const expected=base.modules.map(m=>m.name===base.main_module?{...m,content_base64:main.toString('base64')}:m);report.expectedModules=modules({modules:expected});assert.equal(expected.length,base.modules.length);
 assert.equal(report.baseModules.filter(x=>report.expectedModules.find(y=>y.name===x.name)?.sha!==x.sha).length,1,'ONLY_ONE_MODULE_MAY_CHANGE');
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:b.type,version_id:'latest'}:b),keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':TAG,'workers/message':'Owner-approved mobile bar delegation only; all navigation, theme, APIs, services and intervals preserved'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(cfg.settings[k]!=null)metadata[k]=cfg.settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const m of expected)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.deepEqual(await active(),report.before);assert.equal(sha(canon(await config())),report.configFingerprint);const made=await cf('/workers/scripts/'+W+'/versions',form);report.candidate=made.id;await json('candidate.json',report);
 const next=await version(report.candidate);assert.deepEqual(modules(next),report.expectedModules);await preserve(next,base);await checkPublic(preview(report.candidate),report.expected);assert.deepEqual(await active(),report.before);assert.equal(sha(canon(await config())),report.configFingerprint);
 report.ok=true;report.candidateVerified=true;await json('candidate.json',report);await json('candidate-summary.json',{ok:true,base:report.base,candidate:report.candidate,modules:expected.length,newModules:0,unchangedModules:expected.length-1,paths:report.expected.length,protectedSettled:report.ledgerBefore.count});
}else{
 if(phase==='rollback'){try{await readFile(DIR+'/activation-intent.json')}catch{console.log('NO_ACTIVATION_NO_ROLLBACK_REQUIRED');process.exit(0)}}
 const p=JSON.parse(await readFile(DIR+'/candidate.json'));report.base=p.base;report.candidate=p.candidate;
 if(phase==='rollback'){
  let intent;try{intent=JSON.parse(await readFile(DIR+'/activation-intent.json'))}catch{process.exit(0)}assert(intent.run===process.env.GITHUB_RUN_ID&&intent.candidate===p.candidate);
  const now=await active();if(now.version===p.base)report.alreadyRestored=true;else{assert.equal(now.version,p.candidate,'CONCURRENT_CHANGE_NO_ROLLBACK');report.deployment=await traffic(p.base,p.candidate,'Restore immediate baseline after mobile bar delegation verification failure');await converge(p.base,p.publicBefore)}
  report.active=await active();report.ok=true;await json('rollback.json',report);process.exit(0);
 }
 assert(p.ok&&p.candidateVerified);assert.equal(sha(canon(await config())),p.configFingerprint,'CONFIG_DRIFT');
 if(phase==='activate'){
  assert.deepEqual(await active(),p.before,'CONCURRENT_DEPLOY_STOP');const old=await version(p.base),next=await version(p.candidate);assert.deepEqual(modules(old),p.baseModules);assert.deepEqual(modules(next),p.expectedModules);await preserve(next,old);assert.equal(next.annotations?.['workers/tag'],TAG);
  const ui=JSON.parse(await readFile(DIR+'/candidate-browser.json'));assert(ui.ok&&ui.candidate===p.candidate&&ui.run===process.env.GITHUB_RUN_ID&&ui.results.length===4,'PREVIEW_UI_REQUIRED');
  await checkPublic('https://ball46.com',p.publicBefore);await checkPublic(preview(p.candidate),p.expected);report.healthBefore=await health();assert.equal(report.healthBefore.ownerConfiguredSeconds,p.healthBefore.ownerConfiguredSeconds);report.ledgerBefore=await verifyLedger(p.ledgerBefore);
  await json('activation-intent.json',{candidate:p.candidate,base:p.base,run:process.env.GITHUB_RUN_ID});report.deployment=await traffic(p.candidate,p.base,'Activate owner-approved mobile bar delegation only');report.activated=true;await json('activation.json',report);
  await converge(p.candidate,p.expected);for(const host of ['https://ball46.com','https://www.ball46.com'])await checkPublic(host,p.expected);report.healthAfter=await health();assert.equal(report.healthAfter.ownerConfiguredSeconds,p.healthBefore.ownerConfiguredSeconds);report.ledgerAfter=await verifyLedger(p.ledgerBefore);assert.equal(sha(canon(await config())),p.configFingerprint);report.active=await active();report.ok=true;await json('activation.json',report);
 }else{
  const a=JSON.parse(await readFile(DIR+'/activation.json')),ui=JSON.parse(await readFile(DIR+'/production-browser.json'));assert(a.ok&&a.activated&&ui.ok&&ui.candidate===p.candidate&&ui.run===process.env.GITHUB_RUN_ID&&ui.results.length===4);assert.equal((await active()).version,p.candidate);report.health=await health();assert.equal(report.health.ownerConfiguredSeconds,p.healthBefore.ownerConfiguredSeconds);report.active=await active();report.protectedLedger=a.ledgerAfter;report.ok=true;await json('final.json',report);
 }
}console.log(JSON.stringify({phase,ok:report.ok,base:report.base,candidate:report.candidate}));
}catch(e){report.ok=false;report.error=String(e.stack);await json(phase+'-failure.json',report);console.error(e.stack);process.exitCode=1}
