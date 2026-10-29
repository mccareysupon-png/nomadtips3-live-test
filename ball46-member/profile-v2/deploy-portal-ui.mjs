import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync,statSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {patch as rebuildV3,MARKER as V3_MARKER,GRADIENT_ID,STYLE} from '../member-signal-v3-20261020/theme.mjs';
import {patchOdds} from '../member-odds-topbar-20261021/patch.mjs';
import {patchPremiumTopbar,PREMIUM_CSS,SVG_AFTER,ICON_MARKER} from '../member-odds-topbar-premium-v2-20261021/premium.mjs';
import {patchOddsBorderless,CSS as BORDERLESS_CSS,MARKER as BORDERLESS_MARKER} from '../member-odds-borderless-v3-20261021/borderless.mjs';
import {patchGlass55,CSS as GLASS_CSS,MARKER as GLASS_MARKER} from '../member-odds-glass55-v4-20261021/glass55.mjs';
import {patchOpacity75,CSS as OPACITY75_CSS,MARKER as OPACITY75_MARKER} from '../member-odds-opacity75-v5-20261021/opacity75.mjs';
import {patchOpacity85,CSS as OPACITY85_CSS,MARKER as OPACITY85_MARKER} from '../member-odds-opacity85-v6-20261021/opacity85.mjs';
import {patchSolid,CSS as SOLID_CSS,MARKER as SOLID_MARKER} from '../member-odds-solid-v7-20261021/solid.mjs';
import {patchSignal1x,CSS as SIGNAL1X_CSS,MARKER as SIGNAL1X_MARKER} from '../member-eventflow-signal-flat-1x-20261021/flat.mjs';
import {join,relative,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const W='ball46-member-production',BASE='https://member.ball46.com',DIR='/tmp/ball46-member-live-tree/ball46-member/public';
const AUDIT='audit/member-profile-portal-ui-20261029';
const SCOPED='ball46-member/member-loading-20261020';
const OLD_VERSION='4770d96f-4993-4e6b-848d-3a06cb3b56ac';
const OLD_CSS_SHA='bcff14935bd652d70209fb7996fd7034ad3009d109eae8e1f89a0e9002520f40';
const hash=b=>createHash('sha256').update(b).digest('hex');
const mime=name=>({'.css':'text/css','.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.mp4':'video/mp4','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'})[extname(name)]||'application/octet-stream';
const walk=root=>readdirSync(root,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(root,x.name)):[join(root,x.name)]);
const report={task:'BALL46 MEMBER PROFILE V2',date:new Date().toISOString(),phase:'START',activated:false,safeRollbackReady:false,sourceBranch:'05c276f7f76a6226b10b45bd85ac369e53167d2f',target:W};
mkdirSync(AUDIT,{recursive:true});
const save=()=>writeFileSync(AUDIT+'/deployment-report.json',JSON.stringify(report,null,2));
const cf=async(path,body,options={})=>{
 const method=body===undefined?'GET':'POST';
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+path,{method,headers:{Authorization:'Bearer '+T,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(85000),...options});
 const txt=await r.text();let j;try{j=JSON.parse(txt)}catch{throw Error('CF_NON_JSON:'+r.status+':'+txt.slice(0,300))}
 assert(r.ok&&j.success===true,'CF_'+method+'_'+r.status+':'+JSON.stringify(j.errors||[]).slice(0,700));return j.result;
};
const active=async()=>{
 const d=(await cf('/workers/scripts/'+W+'/deployments?per_page=1')).deployments?.[0];
 assert(d?.versions?.length===1&&d.versions[0].percentage===100,'ACTIVE_NOT_SINGLE_100_PERCENT');
 return {version:d.versions[0].version_id,deployment:d.id};
};
const getVersion=version=>cf('/workers/workers/'+W+'/versions/'+version+'?include=modules');
const getPublic=async(path,host=BASE)=>{
 const u=new URL(path,host);u.searchParams.set('_scrollbardeploy',Date.now().toString(36));
 const r=await fetch(u,{redirect:'manual',headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(40000)});
 const buf=Buffer.from(await r.arrayBuffer());
 return {status:r.status,data:buf,sha:hash(buf),location:r.headers.get('location')||'',type:r.headers.get('content-type')||''};
};
const settingsOperational=x=>({...x,annotations:undefined});
const settings=async()=>{
 const [set,schedules,domains]=await Promise.all([
   cf('/workers/scripts/'+W+'/settings'),cf('/workers/scripts/'+W+'/schedules'),cf('/workers/domains')]);
 return {set,schedules,domains:domains.filter(x=>x.service===W).map(x=>x.hostname).sort()};
};
const publicInventory=async(files,host,patchedCss=null)=>{
 const bad=[],protectedList=[],ok=[];
 for(let i=0;i<files.length;i+=5){
  const batch=await Promise.all(files.slice(i,i+5).map(async f=>{
   const expected=f.path==='/styles.css'&&patchedCss?hash(patchedCss):f.sha;
   const response=await getPublic(f.path,host);
   let canonical=null;
   if([307].includes(response.status)&&f.path.endsWith('.html')){
     canonical=await getPublic(f.path.slice(0,-5),host);
   }
   return {...f,expected,actual:response.sha,status:response.status,canonical:canonical&&{status:canonical.status,sha:canonical.sha},matched:(response.status===200&&response.sha===expected)||(canonical?.status===200&&canonical.sha===expected),protected:response.status===302||response.status===303};
  }));
  for(const x of batch){if(x.matched)ok.push(x.path);else if(x.protected)protectedList.push({path:x.path,status:x.status});else bad.push({path:x.path,status:x.status,expected:x.expected,actual:x.actual,canonical:x.canonical});}
 }
 return {matches:ok.length,protected:protectedList,mismatches:bad};
};
async function uploadAssets(files){
 const manifest={},byHash=new Map();
 for(const f of files){
  const raw=f.bytes;
  const id=hash(raw.toString('base64')+extname(f.path).slice(1)).slice(0,32);
  manifest[f.path]={hash:id,size:raw.length};
  const old=byHash.get(id);if(old)assert.equal(old.raw.equals(raw),true,'UPLOAD_ID_COLLISION');
  byHash.set(id,{raw,type:mime(f.path)});
 }
 const session=await cf('/workers/scripts/'+W+'/assets-upload-session',{manifest});
 assert(session.jwt&&Array.isArray(session.buckets),'UPLOAD_SESSION_INVALID');
 let completion=session.buckets.length===0?session.jwt:null;
 const uploadHashes=session.buckets.flat();
 assert(new Set(uploadHashes).size===uploadHashes.length,'DUPLICATE_BUCKET_HASH');
 for(const bucket of session.buckets){
  const form=new FormData();
  for(const id of bucket){const x=byHash.get(id);assert(x,'CF_ASKED_UNEXPECTED_HASH');form.append(id,new Blob([x.raw.toString('base64')],{type:x.type}),id)}
  const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+A+'/workers/assets/upload?base64=true',{method:'POST',headers:{Authorization:'Bearer '+session.jwt},body:form,signal:AbortSignal.timeout(85000)});
  const j=await res.json();
  assert(res.ok&&j.success===true,'UPLOAD_ASSET_FAILED:'+res.status+':'+JSON.stringify(j.errors||[]).slice(0,600));
  if(j.result?.jwt)completion=j.result.jwt;
 }
 assert(completion,'UPLOAD_COMPLETION_JWT_MISSING');
 return {completion,files:files.length,uploaded:uploadHashes.length};
}
async function promote(version,prior,message){
 assert.equal((await active()).version,prior,'ACTIVE_DRIFT_AT_PROMOTION');
 const dep=await cf('/workers/scripts/'+W+'/deployments',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':message}});
 for(let i=0;i<24;i++){
  const curr=await active();
  if(curr.version===version)return curr.deployment||dep.id;
  assert.equal(curr.version,prior,'UNRELATED_DEPLOYMENT_DURING_PROMOTION');
  await new Promise(r=>setTimeout(r,1500));
 }
 throw Error('PROMOTION_NOT_CONFIRMED');
}
async function waitCss(sha,host=BASE,path='/styles.css'){
 for(let i=0;i<25;i++){
  const css=await getPublic(path,host);
  if(css.status===200&&css.sha===sha)return true;
  await new Promise(r=>setTimeout(r,2500));
 }
 return false;
}





function replaceOne(source,needle,replacement,label){
 assert.equal(source.split(needle).length-1,1,'SOURCE_ANCHOR_DRIFT_'+label);
 return source.replace(needle,replacement);
}
function unwindV3(live){
 const start="const __b46MemberSignalV3=svgNode('linearGradient',{id:'b46-member-eventflow-signal-v3-20261020'";
 const end='defs.append(gh,ga,__b46MemberSignalV3); svg.append(defs);';
 assert.equal(live.split(start).length-1,1,'MEMBER_V3_START_DRIFT');
 assert.equal(live.split(end).length-1,1,'MEMBER_V3_END_DRIFT');
 const i=live.indexOf(start),j=live.indexOf(end,i);
 assert(j>i&&j-i<1200,'MEMBER_V3_STRUCTURE_DRIFT');
 return live.slice(0,i)+'defs.append(gh,ga); svg.append(defs);'+live.slice(j+end.length);
}
function foldSummary(source){
 const begin=source.indexOf('function renderSummary(){'),end=source.indexOf('function filteredRows(){',begin);
 assert(begin>=0&&end>begin&&end-begin<4500,'MEMBER_SUMMARY_FUNCTION_DRIFT');
 const section=source.slice(begin,end);
 const updated=replaceOne(replaceOne(section,"['WIN',s.win,'win']","['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']",'WIN'),"['LOSS',s.loss,'loss']","['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']",'LOSS');
 return source.slice(0,begin)+updated+source.slice(end);
}
function bustHalfMemberScript(html){
 let count=0;
 const result=html.replace(/(src="\/member\.js\?[^"]+)"/,(_x,p)=>{count++;return p+'&halfFold=20261021"';});
 assert.equal(count,1,'HALF_FOLD_SCRIPT_VERSION_DRIFT');
 return result;
}


let initial=null,newVersion=null;
const SOURCE_COMMIT='fba75e2eefc97feee19cf6dff18fb2b6f09d6849';
const PORTAL='https://billing.stripe.com/p/login/4gMfZh0z0cuJ2LqevZ8AE00';
function committedFile(path){
 const result=spawnSync('git',['show',SOURCE_COMMIT+':'+path],{maxBuffer:8*1024*1024});
 assert.equal(result.status,0,'COMMITTED_PROFILE_SOURCE_MISSING '+path);
 return result.stdout;
}
async function verifyAuth(host){
 assert.equal((await getPublic('/api/member/profile',host)).status,401,'PROFILE_API_AUTH_CHANGED');
 const forged=await fetch(host+'/api/member/profile',{method:'PUT',headers:{origin:host,'content-type':'application/json','Cf-Access-Jwt-Assertion':'invalid.invalid.invalid'},body:'{}',redirect:'manual',signal:AbortSignal.timeout(30000)});
 assert.equal(forged.status,401,'FORGED_REQUEST_ACCEPTED');
}
try{
 assert(A&&T,'CF_SECRETS_MISSING');
 initial=await active();assert.equal(initial.version,OLD_VERSION,'PORTAL_UI_BASELINE_DRIFT');
 const base=await getVersion(initial.version);
 assert.equal(base.modules.length,2,'MODULE_COUNT_DRIFT');
 const moduleHashes=base.modules.map(module=>({name:module.name,sha:hash(Buffer.from(module.content_base64,'base64'))}));
 const settingsBefore=await settings();
 assert.deepEqual(settingsBefore.domains,['member.ball46.com'],'MEMBER_DOMAIN_CHANGED');
 assert.equal(base.bindings.filter(b=>b.type==='secret_text').length,3,'MEMBER_SECRET_BINDINGS_CHANGED');
 assert(base.bindings.some(b=>b.type==='assets'&&b.name==='ASSETS'),'ASSETS_BINDING_MISSING');
 assert.equal(walk(DIR).length,40,'PINNED_MEMBER_ASSETS_NOT_40');
 const currentCss=await getPublic('/styles.css'),currentJs=await getPublic('/member.js');
 const currentOddsCss=await getPublic('/member-odds-topbar.css'),currentOddsJs=await getPublic('/member-odds-topbar.js');
 assert.equal(currentCss.sha,'f685a95c6bf6cadd280e26ac092a04e89b51a1675e0fd2d8cc78ccb36b27e7df','MEMBER_CURRENT_SIGNAL_CSS_MOVED');
 assert.equal(currentJs.sha,'ef4489618ae07303a7f275b4b37fddd0f7a8cb721bf98d3216c887128c806524','MEMBER_MAIN_JS_MOVED');
 assert.equal(currentOddsCss.sha,'3a6ea0a6cd39b6c94fdc0874999c92d0468bca2c980a37d8bb4c2bc27b48443d','MEMBER_ODDS_SOLID_V7_CSS_MOVED');
 assert.equal(currentOddsJs.sha,'12265bd447751f9223860a852196bc97a576e1c70a08020343f12524698848c7','MEMBER_ODDS_V1_JS_MOVED');
 const signalFlatEnd='\n'+SIGNAL1X_CSS+'\n';
 const liveFlatCss=currentCss.data.toString('utf8');
 assert(liveFlatCss.endsWith(signalFlatEnd),'CURRENT_SIGNAL_1X_CSS_FOOTER_NOT_FOUND');
 const v3Css=liveFlatCss.slice(0,-signalFlatEnd.length);
 assert.equal(hash(v3Css),'5186dd9dfa27c36b7dced6068b15a20d04ab8f15ab771e33d61116c8725b817d','SIGNAL_V3_STYLES_NO_LONGER_MATCH');
 const footer='\n'+STYLE+'\n';
 assert(v3Css.endsWith(footer),'MEMBER_EVENTFLOW_V3_CSS_MARKER_MISSING');
 const beforeV3Css=v3Css.slice(0,-footer.length);
 assert.equal(hash(beforeV3Css),OLD_CSS_SHA,'MEMBER_V3_CSS_RECONSTRUCTION_UNSAFE');
 const oddsV1Js=currentJs.data.toString('utf8');
 const oldFmt="function fmtOdds(v){\n  const fmt=window.Ball46MemberOdds;\n  if(fmt&&typeof fmt.formatOdds==='function')return fmt.formatOdds(v);\n  const n=Number(v);return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}";
 const initialFmt="function fmtOdds(v){\n  const n=Number(v);\n  return Number.isFinite(n)?'@'+n.toFixed(2):'—';\n}";
 const hook="window.addEventListener('ball46:member-odds-format-change',()=>{if(state.payload)render();});\n";
 const oldVersionJs=replaceOne(replaceOne(oddsV1Js,oldFmt,initialFmt,'UNDO_ODDS_FMTOdds'),hook,'','UNDO_ODDS_HOOK');
 assert.equal(hash(oldVersionJs),'6f62bf55ad0edbf3f3837d4754bc2a65e13ea62dcf27fd76b5d77780a2878acf','MEMBER_ODDS_V1_UNDO_FAILED');
 const beforeHalf=replaceOne(replaceOne(oldVersionJs,"['WIN',Number(s.win||0)+Number(s.halfWin||0),'win']","['WIN',s.win,'win']",'UNDO_WIN'),"['LOSS',Number(s.loss||0)+Number(s.halfLoss||0),'loss']","['LOSS',s.loss,'loss']",'UNDO_LOSS');
 assert.equal(hash(beforeHalf),'729d3084c5934324b34ac7b07484b4807e5c855b67f0524fd82bfcc0833e0ac5','MEMBER_HALF_FOLD_UNDO_FAILED');
 const beforeV3Js=unwindV3(beforeHalf);
 assert.equal(hash(beforeV3Js),'58a580302fe247fce4c98d2fe06f185dddacb5fadd632d724e5633da026f562a','MEMBER_V3_JS_RECONSTRUCTION_FAILED');
 const loader=spawnSync('python3',[SCOPED+'/patch_member.py',DIR],{encoding:'utf8'});
 assert.equal(loader.status,0,'MEMBER_LOADER_REBUILD_ERROR '+loader.stderr+' '+loader.stdout);
 const restored=rebuildV3({html:readFileSync(DIR+'/member.html','utf8'),css:beforeV3Css,js:beforeV3Js});
 const half={html:bustHalfMemberScript(restored.html),js:foldSummary(restored.js)};
 const oddsV1=patchOdds({html:half.html,js:half.js});
 assert.equal(hash(oddsV1.html),'d31769f8a7bdd2583e0d668947157ba6a63207d37a35da7c679c2f635a8c662b','ODDS_V1_PROTECTED_HTML_DRIFT');
 assert.equal(hash(oddsV1.js),currentJs.sha,'ODDS_V1_MEMBER_JS_REBUILD_MISMATCH');
 writeFileSync(DIR+'/member.html',oddsV1.html,'utf8');
 writeFileSync(DIR+'/member.js',oddsV1.js,'utf8');
 writeFileSync(DIR+'/styles.css',restored.css,'utf8');
 const solidEnd='\n'+SOLID_CSS+'\n';
 const liveSolidCss=currentOddsCss.data.toString('utf8');
 assert(liveSolidCss.endsWith(solidEnd),'ACTIVE_ODDS_SOLID_V7_CSS_FOOTER_MISSING');
 const v6OddsCssLayer=liveSolidCss.slice(0,-solidEnd.length);
 assert.equal(hash(v6OddsCssLayer),'cd27fb17fd5941d41f234d81d8047c3fcac436dd247a3cad0792a00c8f037e7d','OPACITY85_V6_CSS_SOURCE_DRIFT');
 const opacity85End='\n'+OPACITY85_CSS+'\n';
 const liveOpacity85Css=v6OddsCssLayer;
 assert(liveOpacity85Css.endsWith(opacity85End),'ACTIVE_OPACITY85_V6_CSS_FOOTER_MISSING');
 const v5CssLayer=liveOpacity85Css.slice(0,-opacity85End.length);
 assert.equal(hash(v5CssLayer),'476df19b96343f643b483e795a87d6f4ab63632b42b22d13a21714f9cbabd11e','OPACITY75_V5_SOURCE_HASH_DRIFT');
 const opacity75End='\n'+OPACITY75_CSS+'\n';
 const liveOpacity75Css=v5CssLayer;
 assert(liveOpacity75Css.endsWith(opacity75End),'ACTIVE_OPACITY75_V5_CSS_FOOTER_MISSING');
 const v4CssLayer=liveOpacity75Css.slice(0,-opacity75End.length);
 assert.equal(hash(v4CssLayer),'b6633b6d654bcd11396b3975726ac612b32e06b8601572421d3b4045e420c833','GLASS55_V4_SOURCE_HASH_DRIFT');
 const glass55End='\n'+GLASS_CSS+'\n';
 const liveGlass55Css=v4CssLayer;
 assert(liveGlass55Css.endsWith(glass55End),'ACTIVE_GLASS55_V4_CSS_FOOTER_MISSING');
 const v3CssLayer=liveGlass55Css.slice(0,-glass55End.length);
 assert.equal(hash(v3CssLayer),'10a07147ada8f1923cdbe174c893e17d74e193ac9d4273b771819ae7d5fc6aa5','BORDERLESS_V3_SOURCE_HASH_DRIFT');
 const borderlessEnd='\n'+BORDERLESS_CSS+'\n';
 const liveBorderlessCss=v3CssLayer;
 assert(liveBorderlessCss.endsWith(borderlessEnd),'ACTIVE_BORDERLESS_V3_CSS_FOOTER_MISSING');
 const activePremiumCss=liveBorderlessCss.slice(0,-borderlessEnd.length);
 const premiumEnd='\n'+PREMIUM_CSS+'\n';
 assert(activePremiumCss.endsWith(premiumEnd),'ACTIVE_PREMIUM_V2_CSS_FOOTER_MISSING');
 const oddsV1Css=activePremiumCss.slice(0,-premiumEnd.length);
 assert.equal(hash(oddsV1Css),'97f544c20ab10ad1d44b1ecd29ea590fc41d3435e0698824ceefb21b1ce7282b','ODDS_V1_CSS_REVERSAL_FAILED');
 const currentPremiumV2=patchPremiumTopbar({html:oddsV1.html,css:oddsV1Css});
 assert.equal(hash(currentPremiumV2.css),'9df93d4b6c953705e312738afb2d9504bdb7ea1d1c396967a68d5873d7641ba3','PREMIUM_V2_CSS_REBUILD_FAILED');
 const currentBorderlessV3=patchOddsBorderless({html:currentPremiumV2.html,css:currentPremiumV2.css});
 assert.equal(hash(currentBorderlessV3.css),'10a07147ada8f1923cdbe174c893e17d74e193ac9d4273b771819ae7d5fc6aa5','MEMBER_BORDERLESS_V3_CSS_REBUILD_FAILED');
 assert(currentBorderlessV3.html.includes('member-odds-topbar.css?v=20261021-odds-borderless-v3'),'MEMBER_BORDERLESS_V3_HTML_NOT_REBUILT');
 const currentGlass55V4=patchGlass55({html:currentBorderlessV3.html,css:currentBorderlessV3.css});
 assert.equal(hash(currentGlass55V4.css),'b6633b6d654bcd11396b3975726ac612b32e06b8601572421d3b4045e420c833','MEMBER_GLASS55_V4_CSS_REBUILD_FAILED');
 assert(currentGlass55V4.html.includes('member-odds-topbar.css?v=20261021-odds-glass55-v4'),'MEMBER_GLASS55_V4_HTML_NOT_REBUILT');
 const currentOpacity75V5=patchOpacity75({html:currentGlass55V4.html,css:currentGlass55V4.css});
 assert.equal(hash(currentOpacity75V5.css),'476df19b96343f643b483e795a87d6f4ab63632b42b22d13a21714f9cbabd11e','MEMBER_OPACITY75_V5_CSS_REBUILD_FAILED');
 assert(currentOpacity75V5.html.includes('member-odds-topbar.css?v=20261021-odds-opacity75-v5'),'MEMBER_OPACITY75_V5_HTML_NOT_REBUILT');
 const currentOpacity85V6=patchOpacity85({html:currentOpacity75V5.html,css:currentOpacity75V5.css});
 assert.equal(hash(currentOpacity85V6.css),'cd27fb17fd5941d41f234d81d8047c3fcac436dd247a3cad0792a00c8f037e7d','MEMBER_OPACITY85_V6_CSS_REBUILD_FAILED');
 assert(currentOpacity85V6.html.includes('member-odds-topbar.css?v=20261021-odds-opacity85-v6'),'MEMBER_OPACITY85_V6_HTML_NOT_REBUILT');
 const currentSolidV7=patchSolid({html:currentOpacity85V6.html,css:currentOpacity85V6.css});
 assert.equal(hash(currentSolidV7.css),currentOddsCss.sha,'MEMBER_ODDS_SOLID_V7_CSS_REBUILD_FAILED');
 assert(currentSolidV7.html.includes('member-odds-topbar.css?v=20261021-odds-solid-v7'),'MEMBER_ODDS_SOLID_V7_HTML_NOT_REBUILT');
 writeFileSync(DIR+'/member.html',currentSolidV7.html,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.css',currentSolidV7.css,'utf8');
 writeFileSync(DIR+'/member-odds-topbar.js',currentOddsJs.data);
 const existing=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 assert.equal(existing.length,44,'LATEST_MEMBER_44_FILES_MISSING');
 const productionPublic=await publicInventory(existing.filter(f=>f.path!=='/member.html'),BASE,currentCss.data);
 assert.deepEqual(productionPublic.mismatches,[],'LATEST_MEMBER_PUBLIC_ASSET_DRIFT');
 assert.equal(productionPublic.matches,43,'MEMBER_43_PUBLIC_ASSET_CHECK_FAILED');
 const protectedBefore=await getPublic('/member.html');
 assert([302,303].includes(protectedBefore.status),'MEMBER_ACCESS_GATE_CHANGED');
 const healthBefore=await getPublic('/api/health');
 const fixed=patchSignal1x({html:currentSolidV7.html,css:restored.css});
 writeFileSync(DIR+'/member.html',fixed.html,'utf8');
 writeFileSync(DIR+'/styles.css',fixed.css,'utf8');
 assert.equal(fixed.html.replace('&b46SignalFlat1x20261021=1',''),currentSolidV7.html,'UNRELATED_MEMBER_HTML_CHANGE');
 assert.equal(hash(fixed.css),currentCss.sha,'LIVE_SIGNAL_1X_CSS_WOULD_CHANGE');
 assert.equal(hash(readFileSync(DIR+'/member.js')),currentJs.sha,'LIVE_MEMBER_JS_WOULD_CHANGE');
 assert(fixed.css.endsWith(SIGNAL1X_CSS+'\n')&&fixed.css.includes(SIGNAL1X_MARKER)&&fixed.css.includes(V3_MARKER),'MEMBER_SIGNAL_FLAT_1X_CSS_NOT_APPENDED');
 assert.equal(readFileSync(DIR+'/member-odds-topbar.css','utf8'),currentOddsCss.data.toString('utf8'),'ODDS_CSS_CHANGED');
 const files=walk(DIR).map(f=>{const bytes=readFileSync(f);return {path:'/'+relative(DIR,f).replaceAll('\\','/'),sha:hash(bytes),bytes};});
 const modified=['/member.html','/styles.css'];
 assert.equal(files.length,44,'PREMIUM_CANDIDATE_ASSET_COUNT_CHANGED');
 const untouched=files.filter(f=>!modified.includes(f.path));
 assert.equal(untouched.length,42,'UNTOUCHED_MEMBER_ASSET_COUNT_NOT_42');
 for(const f of untouched)assert.equal(f.sha,existing.find(x=>x.path===f.path)?.sha,'MEMBER_UNRELATED_ASSET_CHANGED_'+f.path);


 const bridge='<script src="/profile-bridge.js?v=20261029" defer id="b46-member-profile-v2-bridge"></script>\n';
 writeFileSync(DIR+'/member.html',replaceOne(readFileSync(DIR+'/member.html','utf8'),'</body>',bridge+'</body>','EXISTING_PROFILE_BRIDGE'));
 for(const name of ['profile-v2.html','profile-v2.js','profile-bridge.js'])writeFileSync(DIR+'/'+name,committedFile('ball46-member/profile-v2/public/'+name));
 const beforeFiles=walk(DIR).map(filename=>{const bytes=readFileSync(filename);return {path:'/'+relative(DIR,filename).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 assert.equal(beforeFiles.length,47,'BASELINE_ASSET_COUNT');
 const baseline=await publicInventory(beforeFiles.filter(file=>file.path!=='/member.html'),BASE);
 assert.deepEqual(baseline.mismatches,[],'BASELINE_ASSET_DRIFT');assert.equal(baseline.matches,46);
 for(const name of ['profile-v2.html','profile-v2.js'])writeFileSync(DIR+'/'+name,readFileSync('ball46-member/profile-v2/public/'+name));
 const afterFiles=walk(DIR).map(filename=>{const bytes=readFileSync(filename);return {path:'/'+relative(DIR,filename).replaceAll('\\','/'),bytes,sha:hash(bytes)};});
 const changed=afterFiles.filter(file=>file.sha!==beforeFiles.find(before=>before.path===file.path)?.sha).map(file=>file.path).sort();
 assert.deepEqual(changed,['/profile-v2.html','/profile-v2.js'],'UI_SCOPE_EXCEEDED');
 const html=readFileSync(DIR+'/profile-v2.html','utf8');
 assert(html.includes(PORTAL)&&html.includes('b46-profile-borderless-20261029')&&html.includes('Manage / Cancel subscription'),'UI_FEATURE_MISSING');
 assert(!html.includes('valenciere80')&&!html.includes('example.test'),'PRIVATE_OR_SAMPLE_DATA_IN_UI');
 const portal=await fetch(PORTAL,{redirect:'follow',signal:AbortSignal.timeout(30000)});assert(portal.ok&&new URL(portal.url).hostname==='billing.stripe.com','STRIPE_PORTAL_UNAVAILABLE');
 const uploaded=await uploadAssets(afterFiles);
 assert.equal((await active()).version,initial.version,'ACTIVE_DRIFT_BEFORE_UPLOAD');
 const payload={main_module:base.main_module,modules:base.modules,bindings:base.bindings.map(binding=>binding.type==='assets'?{name:binding.name,type:'assets'}:{name:binding.name,type:'inherit',version_id:'latest'}),assets:{jwt:uploaded.completion,config:base.assets.config},compatibility_date:base.compatibility_date,compatibility_flags:base.compatibility_flags||[],usage_model:base.usage_model,annotations:{'workers/tag':'MEMBER-PROFILE-PORTAL-UI-20261029','workers/message':'Profile borderless gradients and Stripe-hosted subscription management; preserve runtime and account records'}};
 for(const key of ['limits','placement'])if(base[key])payload[key]=base[key];
 const created=await cf('/workers/workers/'+W+'/versions?deploy=false&bindings_inherit=strict',payload);newVersion=created.id;
 assert(/^[a-f0-9-]{36}$/.test(newVersion),'CANDIDATE_ID_MISSING');
 report.before={version:initial.version,moduleHashes,assets:beforeFiles.map(file=>({path:file.path,sha:file.sha}))};report.candidate=newVersion;report.changed=changed;save();
 const candidate=await getVersion(newVersion);
 assert.deepEqual(candidate.modules.map(module=>({name:module.name,sha:hash(Buffer.from(module.content_base64,'base64'))})),moduleHashes,'RUNTIME_CHANGED');
 const bindings=value=>value.bindings.map(binding=>({name:binding.name,type:binding.type})).sort((left,right)=>left.name.localeCompare(right.name));
 assert.deepEqual(bindings(candidate),bindings(base),'BINDINGS_CHANGED');
 assert.deepEqual(candidate.assets.config,base.assets.config,'ASSET_CONFIG_CHANGED');
 const preview=candidate.urls?.find(url=>url.startsWith('https://'))||'https://'+newVersion.slice(0,8)+'-'+W+'.mccarey-supon.workers.dev';
 const visible=afterFiles.filter(file=>file.path!=='/member.html');
 const checked=await publicInventory(visible,preview);assert.deepEqual(checked.mismatches,[],'CANDIDATE_ASSETS_CHANGED');assert.equal(checked.matches,46);
 await verifyAuth(preview);
 const beforePromote=await settings();assert.deepEqual(settingsOperational(beforePromote.set),settingsOperational(settingsBefore.set),'SETTINGS_DRIFT');assert.deepEqual(beforePromote.schedules,settingsBefore.schedules);assert.deepEqual(beforePromote.domains,settingsBefore.domains);
 report.candidateVerified=true;report.safeRollbackReady=true;save();
 report.deployment=await promote(newVersion,initial.version,'Deploy Member borderless Profile UI and verified Stripe portal link');report.activated=true;save();
 const host='https://ball46-member-production.mccarey-supon.workers.dev';
 let inventory;
 for(let attempt=0;attempt<10;attempt++){inventory=await publicInventory(visible,host);if(inventory.mismatches.length===0&&inventory.matches===46)break;await new Promise(resolve=>setTimeout(resolve,1500));}
 assert.deepEqual(inventory.mismatches,[],'PRODUCTION_ASSET_MISMATCH');assert.equal(inventory.matches,46);
 await verifyAuth(host);
 const profileGate=await getPublic('/member?view=profile');assert([302,303].includes(profileGate.status),'CUSTOM_ACCESS_CHANGED');
 const currentHealth=await getPublic('/api/health');assert.equal(currentHealth.sha,healthBefore.sha);
 const afterSettings=await settings();assert.deepEqual(settingsOperational(afterSettings.set),settingsOperational(settingsBefore.set),'SETTINGS_CHANGED');assert.deepEqual(afterSettings.schedules,settingsBefore.schedules);assert.deepEqual(afterSettings.domains,settingsBefore.domains);
 assert.equal((await active()).version,newVersion,'FINAL_VERSION_DRIFT');
 const final=await getVersion(newVersion);assert.deepEqual(final.modules.map(module=>({name:module.name,sha:hash(Buffer.from(module.content_base64,'base64'))})),moduleHashes,'PRODUCTION_RUNTIME_CHANGED');
 report.success=true;report.phase='PRODUCTION_VERIFIED';report.completedAt=new Date().toISOString();save();
 console.log('PROFILE_PORTAL_UI_DEPLOY_SUCCESS',JSON.stringify({before:initial.version,after:newVersion,assetsVerified:46,unrelatedAssetsPreserved:45,runtimeUnchanged:true,portal:PORTAL}));
}catch(error){
 report.success=false;report.error=String(error.stack||error);
 if(report.activated&&newVersion){try{if((await active()).version===newVersion){await promote(initial.version,newVersion,'Rollback Profile portal UI after verification failure');report.rolledBack=true;}}catch(rollbackError){report.rollbackError=String(rollbackError);}}
 save();console.error('PROFILE_PORTAL_UI_SAFE_STOP',String(error.stack||error));process.exitCode=1;
}
