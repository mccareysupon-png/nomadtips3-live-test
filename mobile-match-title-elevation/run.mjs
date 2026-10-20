
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from 'acorn';
import {chromium} from 'playwright';
fs.mkdirSync('audit',{recursive:true});
const root='https://api.cloudflare.com/client/v4/accounts/'+process.env.CLOUDFLARE_ACCOUNT_ID+'/workers',worker='ball46-production';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const canonical=o=>JSON.stringify(o,(k,v)=>k==='annotations'?undefined:v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
async function api(path,options={}){const r=await fetch(root+path,{...options,headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,...options.headers},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success,JSON.stringify(j.errors));return j.result;}
async function active(){const d=await api('/scripts/'+worker+'/deployments?per_page=1');assert.equal(d.deployments[0].versions.length,1);assert.equal(d.deployments[0].versions[0].percentage,100);return d.deployments[0].versions[0].version_id;}
async function version(id){return api('/workers/'+worker+'/versions/'+id+'?include=modules');}
async function activate(id,message){return api('/scripts/'+worker+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:id,percentage:100}],annotations:{'workers/message':message}})});}
const base=await active(),v=await version(base),source=Buffer.from(v.modules.find(m=>m.name===v.main_module).content_base64,'base64').toString('utf8');

const style="<style id=\"b46-mobile-match-title-elevation-20261020\">@media(max-width:767px){html[data-b46gn=\"1\"] #b46gn-detail .b46gn-sheetbody .b46gn-teams{border:0!important;outline:0!important;background:linear-gradient(145deg,#163c36 0%,#102c2a 65%,#0d2524 100%)!important;box-shadow:0 7px 18px rgba(0,0,0,.34),0 2px 4px rgba(0,0,0,.2),inset 0 1px 0 rgba(168,255,228,.06)!important;border-radius:12px!important;color:#edf9f5!important}}</style>";
const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'}),exp=tree.body.find(n=>n.type==='ExportDefaultDeclaration');assert(exp,'DEFAULT_EXPORT_NOT_FOUND');
const originalExport=source.slice(exp.start),anchor='return __b46InjectFooter(response);';
assert.equal(originalExport.split(anchor).length,2,'FOOTER_RESPONSE_ANCHOR_CHANGED_STOP');assert(!source.includes('b46-mobile-match-title-elevation-20261020'),'PATCH_ALREADY_PRESENT_STOP');
const helper='\nasync function __b46MatchTitleElevation20261020(response){if(!response||response.status!==200||!String(response.headers.get("content-type")||"").includes("text/html"))return response;const html=await response.text();const style='+JSON.stringify(style)+';if(!html.includes("</head>"))throw new Error("MATCH_TITLE_STYLE_HEAD_MISSING");const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");return new Response(html.replace("</head>",style+"</head>"),{status:response.status,statusText:response.statusText,headers});}\n';
const candidate=source.slice(0,exp.start)+helper+originalExport.replace(anchor,'return __b46MatchTitleElevation20261020(await __b46InjectFooter(response));');
parse(candidate,{ecmaVersion:'latest',sourceType:'module'});
const publicHtml=await (await fetch('https://ball46.com/')).text();assert(publicHtml.includes('b46gn-teams'),'REAL_CARD_COMPONENT_MISSING');
const before=publicHtml,after=publicHtml.replace('</head>',style+'</head>');
assert.equal(candidate.replace(helper,'').replace('return __b46MatchTitleElevation20261020(await __b46InjectFooter(response));',anchor),source,'SCOPE_EXCEEDED');
fs.writeFileSync('audit/production-before.js',source);fs.writeFileSync('audit/production-after.js',candidate);
const settings=await api('/scripts/'+worker+'/settings'),schedules=await api('/scripts/'+worker+'/schedules');
const report={baseVersion:base,sourceSha:hash(source),candidateSha:hash(candidate),styleSha:hash(style),scope:'Only borderless raised teal surface of the mobile match title card in Green Noir details',tests:[],deployed:false};
const save=()=>fs.writeFileSync('audit/report.json',JSON.stringify(report,null,2));save();
async function json(path){const r=await fetch('https://ball46.com'+path,{signal:AbortSignal.timeout(45000)});assert(r.ok);return r.json();}
const board=await json('/api/engine/board'),signals=await json('/api/engine/signals');

const fixture=board.fixtures.find(f=>f.boardState==='live'||f.status==='in_play');assert(fixture,'NO_REAL_FIXTURE_STOP');const fid=String(fixture.fixtureId??fixture.id);report.fixtureId=fid;
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:1000},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/engine/board*',r=>r.fulfill({json:board}));

await page.route('**/api/engine/signals*',r=>r.fulfill({json:signals}));

async function load(html,width,live=false){
 await page.setViewportSize({width,height:1000});await page.unroute('https://ball46.com/?matchTitleQa=1');
 if(!live)await page.route('https://ball46.com/?matchTitleQa=1',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://ball46.com/?matchTitleQa=1');
 if(width<=767){
   const card=page.locator('.b46gn-card[data-b46gn-fixture="'+fid+'"]');
   await card.waitFor({timeout:60000});await card.click();await page.locator('#b46gn-detail .b46gn-teams').waitFor({state:'visible'});
   return page.locator('#b46gn-detail .b46gn-teams').evaluate(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect(),p=getComputedStyle(el.parentElement);
     return {text:el.textContent,border:c.borderTopWidth,outline:c.outlineWidth,background:c.backgroundImage,shadow:c.boxShadow,color:c.color,radius:c.borderRadius,overflow:r.left<0||r.right>innerWidth,parentBackground:p.backgroundColor};});
 }
 await page.locator('.match-row').first().waitFor({timeout:60000});
 return page.locator('.main-board').evaluate(el=>{const c=getComputedStyle(el);return {background:c.backgroundColor,image:c.backgroundImage,shadow:c.boxShadow,color:c.color,border:c.borderTopWidth,mobileRuleApplies:matchMedia('(max-width:767px)').matches};});
}
for(const width of [320,375,390,430,1280]){
 const b=await load(before,width);
 await page.locator(width<=767?'#b46gn-detail .b46gn-sheet':'.main-board').screenshot({path:'audit/before-'+width+'.png',animations:'disabled'});
 const a=await load(after,width);
 await page.locator(width<=767?'#b46gn-detail .b46gn-sheet':'.main-board').screenshot({path:'audit/after-'+width+'.png',animations:'disabled'});
 if(width<=767){assert.equal(a.border,'0px');assert.equal(a.outline,'0px');assert(a.background.includes('linear-gradient'));assert.notEqual(a.shadow,'none');assert.equal(a.text,b.text);assert(!a.overflow);assert.equal(a.radius,'12px');}
 else assert.deepEqual(a,b,'DESKTOP_STYLE_CHANGED');
 report.tests.push({width,before:b,after:a,passed:true});save();
}
assert.equal(errors.length,0,errors.join('\n'));
assert.equal(await active(),base,'PRODUCTION_MOVED_STOP');
assert.equal(canonical(await api('/scripts/'+worker+'/settings')),canonical(settings),'SETTINGS_MOVED_STOP');
const metadata={main_module:v.main_module,compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],bindings:v.bindings,keep_assets:true,assets:{config:v.assets.config},annotations:{'workers/tag':'B46_MOBILE_MATCH_TITLE_ELEVATION_20261020','workers/message':'Borderless raised teal match title card on mobile only; preserve all current source'}};
for(const key of ['logpush','limits','observability','placement'])if(settings[key]!=null)metadata[key]=settings[key];
const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
for(const m of v.modules)form.set(m.name,new Blob([m.name===v.main_module?candidate:Buffer.from(m.content_base64,'base64')],{type:m.content_type}),m.name);
const uploaded=await api('/scripts/'+worker+'/versions',{method:'POST',body:form}),id=uploaded.id;assert(id);
report.candidateVersion=id;save();
const next=await version(id);assert.equal(next.modules.length,v.modules.length);
for(const m of v.modules){const n=next.modules.find(n=>n.name===m.name);assert(n);assert.equal(hash(Buffer.from(n.content_base64,'base64')),m.name===v.main_module?hash(candidate):hash(Buffer.from(m.content_base64,'base64')));}
for(const key of ['bindings','compatibility_date','compatibility_flags','assets'])assert.equal(canonical(v[key]),canonical(next[key]),'CONFIG_CHANGED:'+key);
assert.equal(await active(),base,'PRODUCTION_MOVED_AFTER_UPLOAD_STOP');
try{
 await activate(id,'Borderless elevated mobile match title after responsive QA');
 report.deployed=true;save();assert.equal(await active(),id);

 for(const origin of ['https://ball46.com','https://ball46-production.mccarey-supon.workers.dev']){
   let ok=false;for(let i=0;i<15;i++){const r=await fetch(origin+'/?titleVerify='+Date.now(),{headers:{'Cache-Control':'no-cache'}});if(r.ok&&(await r.text()).includes(style)){ok=true;break;}await new Promise(r=>setTimeout(r,1000));}assert(ok,'PUBLIC_STYLE_NOT_UPDATED:'+origin);
 }
 const mobileLive=await load(null,390,true);assert.equal(mobileLive.border,'0px');assert.notEqual(mobileLive.shadow,'none');assert(mobileLive.background.includes('linear-gradient'));assert(!mobileLive.overflow);
 await page.locator('#b46gn-detail .b46gn-sheet').screenshot({path:'audit/production-mobile-390.png',animations:'disabled'});
 const desktopLive=await load(null,1280,true),baselineDesktop=await load(before,1280);assert.deepEqual(desktopLive,baselineDesktop);
 assert.equal(canonical(await api('/scripts/'+worker+'/settings')),canonical(settings),'SETTINGS_CHANGED_AFTER_DEPLOY');
 assert.equal(canonical(await api('/scripts/'+worker+'/schedules')),canonical(schedules),'SCHEDULES_CHANGED_AFTER_DEPLOY');
 assert.equal(errors.length,0,errors.join('\n'));
 report.result='PASS';report.assetsRetained=true;report.settingsUnchanged=true;report.desktopUnchanged=true;report.runtimeErrors=errors;save();console.log(JSON.stringify(report,null,2));
}catch(e){
 report.error=e.message;if(await active()===id){await activate(base,'Rollback mobile match title elevation validation failure');assert.equal(await active(),base);report.rollback='confirmed';}save();throw e;
}finally{await browser.close();}
