import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {ROOT,DIR,PRIVATE,W,TAG,MODULE,sha,canon,writes,init,cf,active,version,modules,config,get,health,patchHTML,publicInventory,checkPublic,preview,traffic,converge,json} from './release-ops.mjs';
const phase=process.argv[2];assert(['stage','activate'].includes(phase));await init();
const report={phase,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,at:new Date().toISOString(),worker:W,writes};let switched=false,prior;
const IMAGE='/b46-member-promo-sharp-20261105.png',OLD='/b46-member-promo-20261104.jpg?v=1';
try{
if(phase==='stage'){
 report.before=await active();report.base=report.before.version;
 const base=await version(report.base);await writeFile(PRIVATE+'/base-version.json',JSON.stringify(base));
 report.baseModules=modules(base);report.configBefore=await config();report.healthBefore=await health();
 const module=base.modules.find(m=>m.name===MODULE);assert(module&&module.content_type==='text/plain','CURRENT_MEMBER_PROMO_MODULE_REQUIRED');
 const old=JSON.parse(Buffer.from(module.content_base64,'base64'));assert(old.assets?.length&&old.head?.includes(OLD),'CURRENT_APPROVED_PROMO_REQUIRED');
 assert(!old.head.includes(IMAGE),'SHARP_PROMO_ALREADY_PRESENT');
 const cssMatch=old.head.match(/<style id="b46-member-promo-release-20261104">([\s\S]*?)<\/style>/);assert(cssMatch,'KNOWN_PROMO_STYLE_REQUIRED');
 const approvedCSS=await readFile(ROOT+'/member-promo.css','utf8'),normal=s=>s.replace(/\r\n/g,'\n').trim();
 assert(normal(approvedCSS).startsWith(normal(cssMatch[1])),'APPROVED_PREVIEW_BASE_CSS_DRIFT');
 const extra=normal(approvedCSS).slice(normal(cssMatch[1]).length).trim();assert(extra.startsWith('/* V2 photograph:'),'ONLY_APPROVED_PHOTO_OVERRIDES');
 assert(!/<\/(script|style)/i.test(extra));assert(!/url\(|@import|@font-face/i.test(extra));
 assert.equal(old.head.split(OLD).length,2,'PHOTO_REFERENCE_DRIFT');
 const head=old.head.replace(cssMatch[0],'<style id="b46-member-promo-release-20261104">'+cssMatch[1]+'\n'+extra+'</style>').replace(OLD,IMAGE+'?v=1');
 const png=await readFile(ROOT+'/assets/member-football-sharp.png');assert.equal(png.length,2157335);assert.equal(sha(png),'9d657ecb96e3a1206538def98027cf80381374ab412a896c7ce47f5dafdcddef');assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),1774);assert.equal(png.readUInt32BE(20),887);
 const asset={path:IMAGE,type:'image/png',version:'1',sha:sha(png),bytes:png.length,base64:png.toString('base64')};
 const payload={...old,head,assets:[...old.assets,asset]};for(const f of payload.assets)assert.equal(sha(Buffer.from(f.base64,'base64')),f.sha);
 const contents=JSON.stringify(payload),expected=base.modules.map(m=>m.name===MODULE?{...m,content_base64:Buffer.from(contents).toString('base64')}:m);
 const htmlR=await get('https://ball46.com','/');assert.equal(htmlR.status,200);report.previousHead=old.head;
 const html=htmlR.body.toString(),newHTML=patchHTML(html,head,old.head);report.publicBefore=await publicInventory(html);
 const dashboard=await get('https://ball46.com','/dashboard-v2-stage3-featured-facts-20261013a.js?v=b46-screen-refresh-5s-20261104');assert.equal(dashboard.sha,'fd6202e8154f7ee6dd3c1b1bd589ef64e2580781cbb70bdadd8d6a68e2c82d50','5S_DISPLAY_SOURCE_CHANGED');
 report.expected=report.publicBefore.map(p=>['/','/index.html'].includes(new URL(p.path,'https://ball46.com').pathname)?{...p,sha:sha(newHTML)}:p).concat(payload.assets.map(f=>({path:f.path+'?v='+f.version,status:200,sha:f.sha})));
 report.expectedModules=modules({modules:expected});report.boundary={changedModules:[MODULE],allRuntimeModulesByteIdentical:true,previousPayloadSha:sha(Buffer.from(module.content_base64,'base64')),nextPayloadSha:sha(contents),existingPhotoPreserved:true,addedPublicImage:{...asset,base64:undefined},cssOverrides:extra,mainModuleSha:modules(base).find(m=>m.name===base.main_module).sha,existing5sDashboardSha:dashboard.sha,dataRequestsAdded:0,settingWrites:0};
 await mkdir(ROOT+'/stage',{recursive:true});await writeFile(ROOT+'/stage/assets.json',contents);
 await json('build.json',{ok:true,assets:payload.assets.map(({base64,...a})=>a),image:{width:1774,height:887,bytes:png.length,lossyReencoding:false},dataRequestsAdded:0,scriptChange:'image URL only',styleChange:extra});
 const metadata={main_module:base.main_module,compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],bindings:base.bindings.map(b=>b.type==='secret_text'?{name:b.name,type:b.type,version_id:'latest'}:b),keep_assets:true,assets:{config:base.assets.config},annotations:{'workers/tag':TAG,'workers/message':'Owner-approved sharper member photograph and image-fit styles only; preserve every runtime module'}};
 for(const k of ['usage_model','logpush','limits','observability','placement'])if(report.configBefore.settings[k]!=null)metadata[k]=report.configBefore.settings[k];
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));for(const m of expected)form.set(m.name,new Blob([Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
 assert.equal((await active()).version,report.base);assert.equal(canon(await config()),canon(report.configBefore));
 const result=await cf('/workers/scripts/'+W+'/versions',form);report.candidate=result.id;await json('candidate.json',report);
 const staged=await version(report.candidate);assert.deepEqual(modules(staged),report.expectedModules);assert.equal(canon(staged.bindings),canon(base.bindings));for(const k of ['assets','compatibility_date','compatibility_flags'])assert.equal(canon(staged[k]),canon(base[k]),'VERSION_CONFIG_CHANGED:'+k);
 await checkPublic(preview(report.candidate),report.expected);assert.equal(canon(await config()),canon(report.configBefore));assert.equal((await active()).version,report.base);report.candidateVerified=true;report.ok=true;
}else{
 prior=JSON.parse(await readFile(DIR+'/candidate.json'));assert(prior.ok&&prior.candidateVerified);report.base=prior.base;report.candidate=prior.candidate;
 assert.equal((await active()).version,prior.base);assert.equal(canon(await config()),canon(prior.configBefore),'CONFIG_DRIFT');
 const base=await version(prior.base),staged=await version(prior.candidate);assert.deepEqual(modules(base),prior.baseModules);assert.deepEqual(modules(staged),prior.expectedModules);assert.equal(staged.annotations?.['workers/tag'],TAG);
 assert.equal(canon(staged.bindings),canon(base.bindings));for(const k of ['assets','compatibility_date','compatibility_flags'])assert.equal(canon(staged[k]),canon(base[k]));
 for(const phase of ['candidate','shadow']){const p=JSON.parse(await readFile(DIR+'/'+phase+'-browser.json'));assert(p.ok&&p.candidate===prior.candidate&&p.run===process.env.GITHUB_RUN_ID&&p.results.length===4&&p.results.every(x=>x.ok),'ALL_EIGHT_PREACTIVATION_CASES_REQUIRED');}
 await checkPublic('https://ball46.com',prior.publicBefore);await checkPublic(preview(prior.candidate),prior.expected);report.healthBefore=await health();
 report.deployment=await traffic(prior.candidate,prior.base,'Activate approved sharper member photograph only');switched=true;report.activated=true;await json('activation.json',report);
 await converge(prior.candidate,prior.expected);for(const host of ['https://ball46.com','https://www.ball46.com'])await checkPublic(host,prior.expected);
 report.healthAfter=await health();assert.equal(report.healthBefore.ownerConfiguredSeconds,report.healthAfter.ownerConfiguredSeconds,'OWNER_SETTING_CHANGED');assert.equal(canon(await config()),canon(prior.configBefore),'CONFIG_AFTER_CHANGED');report.ok=true;
}
 report.active=await active();report.finishedAt=new Date().toISOString();await json(phase==='stage'?'candidate.json':'activation.json',report);console.log(JSON.stringify({phase,ok:report.ok,base:report.base,candidate:report.candidate,active:report.active}));
}catch(e){report.ok=false;report.error=e.stack;if(switched)try{if((await active()).version===prior.candidate){await traffic(prior.base,prior.candidate,'Automatic restore after sharper member photo verification failure');await converge(prior.base,prior.publicBefore);report.restored=true;}}catch(f){report.restoreError=f.message;}await json(phase+'-failure.json',report);console.error(e.stack);process.exitCode=1;}
