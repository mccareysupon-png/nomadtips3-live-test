import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {connectExistingUi} from './ui-patch.mjs';
const D='work/statistics-summary-shadow-20261113',R=D+'/reference/ui-proof/qa/ui-capture',B='work/statistics-member-sidebar-test-20261112',sha=b=>createHash('sha256').update(b).digest('hex');
const capture=JSON.parse(await readFile(R+'/capture.json')),html=await readFile(R+'/index.html','utf8');assert.equal(sha(html),capture.htmlSha);
async function asset(path){const row=capture.files.find(x=>new URL(x.path,'https://test.invalid').pathname===path);assert(row,'MISSING_ASSET:'+path);const b=await readFile(R+'/files/'+row.file);assert.equal(sha(b),row.sha);return {row,text:b.toString()};}
const workspace=await asset('/singlepage-workspace-343.js'),dashboard=await asset('/dashboard-v2-stage3-featured-facts-20261013a.js'),sync=await asset('/ui-sync-fixes-343-v2.js');
const patched=connectExistingUi({html,workspace:workspace.text,dashboard:dashboard.text,sync:sync.text});
const currentBanners=html.includes('id="b46-member-banners-20261112"')&&html.includes('id="b46-member-banners-runtime-20261112"');
let monitor=null,monitorPatched=null;
if(!currentBanners){monitor=await asset('/b46-monitor-20261030.js');const placement='if(prediction.previousElementSibling!==card)prediction.before(card);';assert.equal(monitor.text.split(placement).length,2,'MONITOR_PLACEMENT_SOURCE_DRIFT');monitorPatched=monitor.text.replace(placement,"if(prediction.previousElementSibling!==card&&!(prediction.previousElementSibling?.classList.contains('b46-home-member-promo')&&prediction.previousElementSibling.previousElementSibling===card))prediction.before(card);")}
// One exact text delta; preserve the rest of the live HTML response byte-for-byte.
let start=0,end=0;while(html[start]===patched.html[start]&&start<html.length)start++;
while(end<html.length-start&&html[html.length-1-end]===patched.html[patched.html.length-1-end])end++;
const before=html.slice(start,html.length-end),after=patched.html.slice(start,patched.html.length-end);assert(before&&after);assert.equal(html.split(before).length,2);assert.equal(html.replace(before,()=>after),patched.html);
let css='',script='',manifest=[],media=[],head='';
if(!currentBanners){
 css=(await readFile(B+'/member-top.css','utf8')).replace(/^@font-face[^\n]*\n/m,'').replaceAll('B46BannerInter,Inter','Inter')+'\n'+await readFile(B+'/home-member-promo.css','utf8');
 script=await readFile(B+'/member-top.js','utf8')+'\n'+await readFile(B+'/home-member-promo.js','utf8');
 manifest=JSON.parse(await readFile(B+'/production-assets/manifest.json'));
 const mapping={'/ball46-member-stadium-v4.png':'stats-stadium','/ball46-member-athlete-pointing-v5.png':'stats-pointing','/home-membership-dark-v2.png':'home-dark','/home-membership-light-v2.png':'home-light'};
 for(const m of manifest){const bytes=await readFile(B+'/production-assets/'+m.file);assert.equal(sha(bytes),m.sha);assert.equal(bytes.length,m.bytes);media.push({...m,base64:bytes.toString('base64')});}
 for(const [from,id]of Object.entries(mapping)){const to=manifest.find(m=>m.id===id).path+'?v=1';css=css.replaceAll(from,to);script=script.replaceAll(from,to);}
 assert(!/\bfetch\s*\(|XMLHttpRequest|setInterval\s*\(|\/api\//.test(script));assert(script.includes("(min-width:1024px)"));
 head='<style id="b46-member-banners-20261112">'+css+'</style><script id="b46-member-banners-runtime-20261112">'+script+'</script>';
}else{
 assert(html.includes('b46-member-home-dark-20261112.webp')&&html.includes('b46-member-stats-pointing-20261112.webp'),'CURRENT_BANNER_ASSETS_MISSING');
}
const rawFiles=[{...workspace.row,body:patched.workspace},{...dashboard.row,body:patched.dashboard},{...sync.row,body:patched.sync}];
if(!currentBanners)rawFiles.push({...monitor.row,body:monitorPatched});
const files=rawFiles.map(x=>({path:new URL(x.path,'https://test.invalid').pathname,type:'application/javascript; charset=utf-8',body:x.body,baseSha:x.sha,sha:sha(x.body)}));
const payload={baseVersion:capture.active,baseHtmlSha:capture.htmlSha,htmlDelta:{before,after},files,mediaPaths:media.map(m=>m.path),head};
await mkdir(D+'/qa/combined',{recursive:true});await writeFile(D+'/summary-release-payload.txt',JSON.stringify(payload));await writeFile(D+'/summary-media.txt',JSON.stringify(media));
await writeFile(D+'/qa/combined/build.json',JSON.stringify({ok:true,base:capture.active,baseHtmlSha:capture.htmlSha,changedAssets:files.map(({body,...x})=>x),newMedia:manifest,desktopOnly:true,currentBannersPreserved:currentBanners,engineChanges:0,providerRequests:0},null,2));
console.log('COMBINED_BUILD '+JSON.stringify({ok:true,base:capture.active,changedAssets:files.length,media:media.length,currentBannersPreserved:currentBanners}));
