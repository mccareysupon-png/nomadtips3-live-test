import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {inspect,api,script,activeVersion,getVersion,publicFile,sha,canonical} from '../daily-performance-20261005/production.mjs';
import {schedules,stageCurrentRail,verifyRailBase,wrangler} from '../daily-performance-20261005/rail.mjs';

const MEMBER='https://ball46-member-production.mccarey-supon.workers.dev';
const URL=MEMBER+'/pricing';
const PAGES=['index.html'];
const report={scope:'Navigation only: align left-rail Member icon and typography with existing menu group; preserve everything else',startedAt:new Date().toISOString()};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let original=null,candidate=null;
async function rollback(){
  if(!original)return;
  const active=await activeVersion();
  if(active===original)return;
  if(!candidate||active!==candidate)throw Error('FOREIGN_PRODUCTION_VERSION_STOP');
  await api('/scripts/'+script+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:original,percentage:100}],annotations:{'workers/message':'Rollback Member navigation-only change'}})});
  assert.equal(await activeVersion(),original,'ROLLBACK_NOT_CONFIRMED');
}
function insertMember(html,page){
  assert.equal(page,'index.html','ONLY_CURRENT_SINGLE_PAGE_ALLOWED');
  const link=/<a\b(?=[^>]*data-b46-member-entry="rail")[^>]*>[\s\S]*?<\/a>/g;
  const matches=[...html.matchAll(link)];
  assert.equal(matches.length,1,'EXPECTED_ONE_MEMBER_RAIL_LINK');
  const previous=matches[0][0];
  assert(previous.includes('class="workspace-nav-row"'),'RAIL_NAV_CLASS_MISSING');
  const memberIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;flex:none;vertical-align:middle"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20v-2a6.5 6.5 0 0 1 13 0v2"/></svg>';
  const updated='<a class="workspace-nav-row" data-b46-member-entry="rail" href="'+URL+'" style="display:flex;align-items:center;justify-content:space-between;text-decoration:none;color:inherit;font-family:inherit;font-size:inherit;font-weight:inherit;line-height:inherit"><span style="display:inline-flex;align-items:center;gap:7px">'+memberIcon+'Member</span><b aria-hidden="true">↗</b></a>';
  const changed=html.replace(previous,updated);
  assert.equal((changed.match(/data-b46-member-entry="brand"/g)||[]).length,1,'HIDDEN_BRAND_MUST_STAY');
  assert(changed.includes('display:none!important'),'HIDDEN_BRAND_STYLE_MUST_STAY');
  assert.equal((changed.match(/data-b46-member-entry="footer"/g)||[]).length,1,'FOOTER_MUST_STAY');
  assert.equal((changed.match(/data-b46-member-entry="rail"/g)||[]).length,1,'MEMBER_RAIL_COUNT');
  assert(changed.includes('width="15" height="15"'),'ICON_MISSING');
  return changed;
}
try{
  // Prevent a public entry link until both member destinations respond.
  for(const path of ['/pricing','/member']){
    const res=await fetch(MEMBER+path,{signal:AbortSignal.timeout(20000),redirect:'follow',headers:{'cache-control':'no-cache'}});
    assert(res.ok&&res.headers.get('content-type')?.includes('text/html'),'MEMBER_DESTINATION_NOT_READY:'+path+':'+res.status);
  }
  const health=await fetch(MEMBER+'/api/health',{signal:AbortSignal.timeout(20000)});
  assert(health.ok,'MEMBER_HEALTH_UNAVAILABLE');
  const hj=await health.json();assert(hj.ok===true&&hj.service==='ball46-member-production','MEMBER_HEALTH_WRONG_SERVICE');

  const current=await inspect();
  original=current.restore.version;
  const settings=await api('/scripts/'+script+'/settings'),crons=await schedules();
  const settingsSha=sha(canonical(settings));
  const workerSha=sha(Buffer.from(current.source));
  const staged=await stageCurrentRail(current.version,settings,crons,current.source);
  await verifyRailBase(staged);
  assert.equal(await activeVersion(),original,'PRODUCTION_CHANGED_DURING_STAGE');
  const changed={};
  for(const page of PAGES){
    const filename=resolve(staged.runtime,'assets',page);
    const before=readFileSync(filename,'utf8');
    const after=insertMember(before,page);
    assert.notEqual(before,after,'NO_NAV_CHANGE:'+page);
    writeFileSync(filename,after);
    changed[page]={oldSha:staged.hashes[page],newSha:sha(Buffer.from(after))};
  }
  report.beforeVersion=original;report.changes=changed;save();
  wrangler(staged,true);
  assert.equal(await activeVersion(),original,'PRODUCTION_CHANGED_BEFORE_DEPLOY');
  try{
    wrangler(staged,false);
    for(let i=0;i<25;i++){let v=await activeVersion();if(v!==original){candidate=v;break}await delay(1200)}
    assert(candidate,'DEPLOYED_VERSION_NOT_OBSERVED');
    let liveOk=false;
    for(let i=0;i<25;i++){
      assert.equal(await activeVersion(),candidate,'PRODUCTION_MOVED_DURING_VERIFY');
      try{
        let pagesOk=true;
        for(const page of PAGES){
          const live=await publicFile('/'+page,'html');
          pagesOk=pagesOk&&sha(live)===changed[page].newSha;
        }
        if(pagesOk){liveOk=true;break}
      }catch{}
      await delay(1200);
    }
    assert(liveOk,'PUBLIC_MEMBER_LINK_NOT_VERIFIED');
    for(const [page,expected] of Object.entries(staged.hashes)){
      if(PAGES.includes(page))continue;
      assert.equal(sha(await publicFile('/'+page)),expected,'UNRELATED_ASSET_CHANGED:'+page);
    }
    const version=await getVersion(candidate),main=version.modules.find(x=>x.name===version.main_module);
    assert(main,'CURRENT_MAIN_MISSING');
    assert.equal(sha(Buffer.from(Buffer.from(main.content_base64,'base64').toString('utf8'))),workerSha,'ENGINE_OR_WORKER_CHANGED');
    assert.equal(sha(canonical(await api('/scripts/'+script+'/settings'))),settingsSha,'SETTINGS_CHANGED');
    assert.equal(canonical(await schedules()),canonical(crons),'CRONS_CHANGED');
    report.result='SUCCESS';report.deployedVersion=candidate;report.completedAt=new Date().toISOString();save();
    console.log('BALL46_MEMBER_RAIL_STYLE_SUCCESS',JSON.stringify({previous:original,newVersion:candidate,link:URL,pages:PAGES}));
  }catch(e){
    report.error=String(e?.message||e);save();
    try{await rollback();report.rolledBack=true;save()}catch(rb){report.rollbackError=String(rb?.message||rb);save()}
    throw e;
  }
}catch(e){report.result='FAIL_STOPPED';report.error=String(e?.message||e);report.completedAt=new Date().toISOString();save();console.error(e.stack);process.exitCode=1}
