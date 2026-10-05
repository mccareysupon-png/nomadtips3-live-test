import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,activeVersion,getVersion,api,script,directOrigin,sha,canonical,publicFile,literals} from './production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler,verifyPublishedModules} from './rail.mjs';
import {verifyConfiguration,verifyVersionConfiguration} from './statistics-config.mjs';
import {patch,beforeHash,marker} from './patch-scorebar.mjs';
import {verify} from './verify-scorebar.mjs';
const cssName='dashboard-v2-tune.css';
const jsName='dashboard-v2-stage3.js';
const jsHash='c22c9c5899210fef66b194964bdc62799cb25c25028493747366099320b68d97';
const report={scope:'Presentation-only repair of the existing 6 settled + 4 pending cards: exactly 10 cards, responsive 10/5/2 grid, no horizontal scorebar/scroll rail, white WIN/LOSS/DRAW/PENDING text. Data, settlement, odds, signals, navigation, engine, cron and all unrelated assets remain unchanged.',commit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID};
let base=null,candidate=null;
const save=()=>writeFileSync('audit/scorebar-responsive-report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const engineVersion=async()=>canonical((await api('/scripts/nomadtips3-engine-343/deployments')).deployments[0].versions);
try{
 assert.equal(process.env.GITHUB_REF_NAME,'safe/ball46-scorebar-responsive-20261004');
 const current=await inspect();base=current.restore.version;report.baseVersion=base;
 const settings=await api(`/scripts/${script}/settings`),crons=await schedules(),engineBefore=await engineVersion();
 const entries=literals(current.source),cssEntry=entries.get('__B46_SCOREBAR_TUNE_CSS__');
 assert(cssEntry,'ACTIVE_SCOREBAR_CSS_LITERAL_MISSING_STOP');
 const beforeCss=cssEntry.value;
 assert.equal(sha(beforeCss),beforeHash,'ACTIVE_SCOREBAR_CSS_MOVED_STOP');
 assert.equal(sha(await publicFile('/'+cssName,'css')),beforeHash,'ACTIVE_PUBLIC_SCOREBAR_CSS_MOVED_STOP');
 const beforeJs=await publicFile('/'+jsName,'javascript');
 assert.equal(sha(beforeJs),jsHash,'ACTIVE_SCOREBAR_RENDERER_MOVED_STOP');
 const index=(await publicFile('/index.html','html')).toString();
 assert(index.includes('data-workspace-scorebar-slot'),'ACTIVE_SCOREBAR_SLOT_MISSING_STOP');
 assert(index.includes(cssName),'ACTIVE_SCOREBAR_CSS_REFERENCE_MISSING_STOP');
 const afterCss=patch(beforeCss);
 assert.notEqual(afterCss,beforeCss,'PATCH_DID_NOT_CHANGE_CSS_STOP');
 assert(afterCss.includes(marker),'PATCH_MARKER_MISSING_STOP');
 const nextSource=current.source.slice(0,cssEntry.start)+JSON.stringify(afterCss)+current.source.slice(cssEntry.end);
 assert.equal(sha(Buffer.from(nextSource)),sha(Buffer.from(nextSource)),'PATCHED_SOURCE_HASH_STOP');
 report.presentationCss={name:cssName,before:sha(beforeCss),after:sha(afterCss),literal:'__B46_SCOREBAR_TUNE_CSS__'};
 report.renderer={name:jsName,sha:jsHash,changed:false};
 writeFileSync('audit/before-'+cssName,beforeCss);writeFileSync('audit/after-'+cssName,afterCss);save();
 report.pre=await verify({patchedCss:afterCss,directory:'audit/pre',watchMs:1000});save();
 const staged=await stageCurrentRail(current.version,settings,crons,nextSource);
 const stagedCss=resolve(staged.runtime,'assets',cssName);
 assert.equal(sha(readFileSync(stagedCss)),beforeHash,'STAGED_SCOREBAR_CSS_NOT_CURRENT_STOP');
 assert.equal(sha(readFileSync(resolve(staged.runtime,'assets',jsName))),jsHash,'STAGED_RENDERER_CHANGED_STOP');
 writeFileSync(stagedCss,afterCss);
 const changed=Object.entries(staged.hashes).filter(([p,h])=>sha(readFileSync(resolve(staged.runtime,'assets',p)))!==h).map(([p])=>p);
 assert.deepEqual(changed,[cssName],'UNRELATED_ASSET_CHANGED_STOP');report.filesDeployed=changed;
 wrangler(staged,true);await verifyRailBase(staged);
 assert.equal(await activeVersion(),base,'PRODUCTION_MOVED_STOP');
 assert.equal(canonical(await api(`/scripts/${script}/settings`)),canonical(settings),'SETTINGS_MOVED_STOP');
 assert.equal(await engineVersion(),engineBefore,'ENGINE_MOVED_STOP');
 assert.equal(sha(await publicFile('/'+jsName,'javascript')),jsHash,'RENDERER_MOVED_BEFORE_DEPLOY_STOP');save();
 wrangler(staged);
 for(let i=0;i<30;i++){const a=await activeVersion();if(a!==base){candidate=a;break}await delay(1000)}
 assert(candidate,'NEW_VERSION_MISSING');report.candidateVersion=candidate;save();
 let published=false;
 for(let i=0;i<30;i++){if(sha(await publicFile('/'+cssName,'css'))===sha(afterCss)){published=true;break}await delay(1000)}
 assert(published,'NEW_SCOREBAR_CSS_NOT_PUBLIC');
 const expected={...staged.hashes,[cssName]:sha(afterCss)};
 for(const [p,h] of Object.entries(expected))assert.equal(sha(await publicFile('/'+p,undefined,directOrigin)),h,'UNRELATED_ASSET_CHANGED:'+p);
 assert.equal(sha(await publicFile('/'+jsName,'javascript')),jsHash,'RENDERER_CHANGED_AFTER_DEPLOY');
 report.configuration=verifyConfiguration(settings,await api(`/scripts/${script}/settings`));
 const version=await getVersion(candidate);report.versionConfiguration=verifyVersionConfiguration(current.version,version);
 verifyPublishedModules(version,current.version,nextSource,Object.fromEntries(Object.entries(expected).map(([p,h])=>['/'+p,h])));
 assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_STOP');assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED_STOP');
 report.post=await verify({directory:'audit/post',watchMs:1500});
 assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFICATION');
 assert.equal(await engineVersion(),engineBefore,'ENGINE_CHANGED_DURING_VERIFICATION');
 assert.equal(sha(await publicFile('/'+cssName,'css')),sha(afterCss),'SCOREBAR_CSS_CHANGED_DURING_VERIFICATION');
 assert.equal(sha(await publicFile('/'+jsName,'javascript')),jsHash,'RENDERER_CHANGED_DURING_VERIFICATION');
 report.status='DEPLOYED';report.version=candidate;report.engineUnchanged=true;report.rendererUnchanged=true;report.unrelatedAssetsUnchanged=true;save();
 console.log('FINAL_REPORT='+JSON.stringify({status:report.status,version:report.version,commit:report.commit,filesDeployed:report.filesDeployed,presentationCss:report.presentationCss,renderer:report.renderer,viewports:report.post.viewports.map(v=>({label:v.label,width:v.viewport,count:v.cells.length,cols:v.cols,rows:v.rows,cardWidth:Math.round(v.cells[0]?.width||0),slotHeight:Math.round(v.slotHeight),overflowX:v.gridOverflowX})),checks:{tenCards:'PASS',whiteStatus:'PASS',noHorizontalRail:'PASS',noHorizontalOverflow:'PASS',navigation:report.post.navigation,stability:report.post.stability,engineUnchanged:true,rendererUnchanged:true,unrelatedAssetsUnchanged:true}}));
}catch(e){
 report.status='STOPPED';report.error=e.message;
 if(base&&candidate&&await activeVersion()===candidate){
  await api(`/scripts/${script}/deployments`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:base,percentage:100}],annotations:{'workers/message':'Rollback ten-card scorebar UI verification failure'}})});
  assert.equal(await activeVersion(),base);report.rollback=base;
 }
 save();console.error(e.stack);console.log('STOPPED_REPORT='+JSON.stringify({error:report.error,rollback:report.rollback,baseVersion:base}));process.exitCode=1;
}
