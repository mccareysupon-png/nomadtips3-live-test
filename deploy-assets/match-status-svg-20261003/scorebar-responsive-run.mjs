import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,directOrigin,sha,canonical,publicFile,literals} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler,verifyPublishedModules} from './rail.mjs';
import {verifyConfiguration,verifyVersionConfiguration} from './statistics-config.mjs';
import {patch,beforeHash} from './patch-scorebar.mjs';
import {verify} from './verify-scorebar.mjs';
import {unit} from './scorebar-unit.mjs';
const name='dashboard-v2-stage3.js';
const report={scope:'Only renderWorkspaceScorebar presentation and its local scoped style/resize helper; existing component, data fetchers, navigation and Production rail retained',commit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID};
let base=null,candidate=null;
const save=()=>writeFileSync('audit/scorebar-responsive-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const engineVersion=async()=>canonical((await api('/scripts/nomadtips3-engine-343/deployments')).deployments[0].versions);
try{
 assert.equal(process.env.GITHUB_REF_NAME,'safe/ball46-scorebar-responsive-20261004');
 const current=await inspect();base=current.restore.version;report.baseVersion=base;
 const settings=await api(`/scripts/${script}/settings`),crons=await schedules(),engineBefore=await engineVersion();
 const before=(await publicFile('/'+name,'javascript')).toString('utf8');
 assert.equal(sha(before),beforeHash,'ACTIVE_TARGET_SOURCE_MOVED_STOP');
 const index=(await publicFile('/index.html','html')).toString();
 assert(index.includes('dashboard-v2-stage3.js?v=343-scorebar-details-20260929a'),'ACTIVE_ASSET_REFERENCE_CHANGED_STOP');
 assert(index.includes('data-workspace-scorebar-slot'),'ACTIVE_COMPONENT_CHANGED_STOP');
 const after=patch(before);new Function(after);
 assert.equal(after,readFileSync('dashboard-v2-stage3.js','utf8'),'REVIEWED_PATCH_BYTES_DIFFER_STOP');
 // If the active Worker embeds this exact presentation asset, update only that literal.
 const embedded=[...literals(current.source)].filter(([,entry])=>entry.value===before);
 assert(embedded.length<=1,'AMBIGUOUS_EMBEDDED_PRESENTATION_ASSET_STOP');
 let nextSource=current.source;
 if(embedded.length){const [literal,entry]=embedded[0];assert(/SCOREBAR|DASHBOARD|STAGE3/i.test(literal),'UNEXPECTED_TARGET_LITERAL_STOP');nextSource=current.source.slice(0,entry.start)+JSON.stringify(after)+current.source.slice(entry.end);report.embeddedPresentationLiteral=literal}
 report.asset={name,before:sha(before),after:sha(after)};
 writeFileSync('audit/before-'+name,before);writeFileSync('audit/after-'+name,after);
 report.unit=await unit(after);
 report.pre=await verify({patched:after,directory:'audit/pre',watchMs:65000});save();
 const staged=await stageCurrentRail(current.version,settings,crons,nextSource);
 assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',name))),beforeHash,'STAGED_TARGET_NOT_LATEST_STOP');
 writeFileSync(resolve(staged.runtime,'assets',name),after);
 const changed=Object.entries(staged.hashes).filter(([p,h])=>sha(readFileSync(resolve(staged.runtime,'assets',p)))!==h).map(([p])=>p);
 assert.deepEqual(changed,[name],'UNRELATED_ASSET_CHANGED_STOP');report.filesDeployed=changed;
 wrangler(staged,true);await verifyRailBase(staged);
 assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_STOP');
 assert.equal(canonical(await api(`/scripts/${script}/settings`)),canonical(settings),'SETTINGS_MOVED_STOP');
 assert.equal(await engineVersion(),engineBefore,'ENGINE_MOVED_STOP');save();
 wrangler(staged);
 for(let i=0;i<25;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1200)}
 assert(candidate,'NEW_VERSION_MISSING');report.candidateVersion=candidate;save();
 let published=false;
 for(let i=0;i<25;i++){if(sha(await publicFile('/'+name))===sha(after)){published=true;break}await delay(1500)}
 assert(published,'NEW_TARGET_ASSET_NOT_PUBLIC');
 const expected={...staged.hashes,[name]:sha(after)};
 for(const [p,h] of Object.entries(expected))assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,'UNRELATED_ASSET_CHANGED:'+p);
 report.configuration=verifyConfiguration(settings,await api(`/scripts/${script}/settings`));
 const version=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,version);
 verifyPublishedModules(version,current.version,nextSource,Object.fromEntries(Object.entries(expected).map(([p,h])=>['/'+p,h])));
 assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_STOP');assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED_STOP');
 report.post=await verify({directory:'audit/post',watchMs:65000});
 assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFICATION');assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_DURING_VERIFICATION');
 assert.equal(sha(await publicFile('/'+name)),sha(after),'TARGET_CHANGED_DURING_VERIFICATION');
 report.status='DEPLOYED';report.version=candidate;report.engineUnchanged=true;report.unrelatedAssetsUnchanged=true;save();
 console.log('FINAL_REPORT='+JSON.stringify({status:report.status,asset:report.asset,filesDeployed:report.filesDeployed,embeddedPresentationLiteral:report.embeddedPresentationLiteral,commit:report.commit,version:report.version,viewports:report.post.viewports.map(v=>({label:v.label,width:v.viewport,count:v.cells.length,settled:v.settled,waiting:v.waiting,ratio:v.ratio,cardWidth:v.cells[0]?.width})),checks:{unit:'PASS',whiteStatus:'PASS',transparentWrapper:'PASS',borderGlow:'PASS',noHorizontalScroll:'PASS',navigation:report.post.navigation,stability:report.post.stability,engineUnchanged:true,unrelatedAssetsUnchanged:true}}));
}catch(e){
 report.status='STOPPED';report.error=e.message;
 if(base&&candidate&&await activeVersion()===candidate){
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback scorebar presentation verification failure'}})});
  assert.equal(await activeVersion(),base);report.rollback=base;
 }
 save();console.error(e.stack);console.log('STOPPED_REPORT='+JSON.stringify({error:report.error,rollback:report.rollback,baseVersion:base}));process.exitCode=1;
}
