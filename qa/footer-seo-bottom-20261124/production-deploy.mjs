import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'acorn';
import {chromium} from 'playwright';
import {footerJs} from './footer-module.mjs';
import {footerCss} from './footer-style.mjs';

const SCRIPT='ball46-production', ORIGIN='https://ball46.com', DIRECT='https://ball46-production.mccarey-supon.workers.dev';
const MARK='B46_FOOTER_SEO_BOTTOM_20261124';
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
assert(account&&token,'CLOUDFLARE_WORKERS_AUTH_MISSING');
const sha=data=>createHash('sha256').update(data).digest('hex');
const canon=v=>JSON.stringify(v, (key,value)=>key==='annotations'?undefined:value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const report={marker:MARK,task:'FOOTER_ONLY',run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString()};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/release.json',JSON.stringify(report,null,2));
let previous,candidate,activated=false;
async function api(path,opts={}){
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/workers'+path,{...opts,headers:{Authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(60000)});
 const data=await res.json();
 assert(res.ok&&data.success, 'CF_API_'+res.status+'_'+path+'_'+JSON.stringify(data.errors||[]));
 return data.result;
}
async function active(){
 const d=await api('/scripts/'+SCRIPT+'/deployments?per_page=3');
 const list=d.deployments?.[0]?.versions;
 assert(list?.length===1&&Number(list[0].percentage)===100,'PRODUCTION_ACTIVE_VERSION_NOT_EXCLUSIVE');
 return list[0].version_id;
}
async function version(id){const v=await api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules');assert(v?.main_module&&v?.modules?.length,'CURRENT_VERSION_MODULES_MISSING');return v}
async function crons(){
 const d=await api('/scripts/'+SCRIPT+'/schedules');
 const list=Array.isArray(d)?d:d.schedules;
 assert(Array.isArray(list),'CRONS_NOT_READABLE');return list.map(x=>x.cron).sort()
}
async function publicAsset(path,origin=DIRECT){
 const u=new URL(path,origin);u.searchParams.set('b46FooterReleaseAudit',Date.now()+'-'+(process.env.GITHUB_RUN_ID||'run'));
 const r=await fetch(u,{headers:{'cache-control':'no-cache'},signal:AbortSignal.timeout(50000)});
 return {status:r.status,body:Buffer.from(await r.arrayBuffer())};
}
function patch(html){
 const guide=html.includes('data-b46-seo-guide="home"');
 assert(guide,'SEO_HOME_GUIDE_MISSING_FROM_CURRENT_INDEX');
 assert(html.includes('id="b46-site-footer-v1"'),'BALL46_FOOTER_MISSING_FROM_CURRENT_INDEX');
 assert(!html.includes(MARK),'ALREADY_PATCHED_STOP');
 const anchor='</head>';assert.equal(html.split(anchor).length,2,'HEAD_ANCHOR_DRIFT');
 assert(!footerJs.includes('</script'),'INLINE_JS_CLOSE_TAG');
 assert(!footerCss.includes('</style'),'INLINE_CSS_CLOSE_TAG');
 const block='\n<!-- '+MARK+' -->\n<style id="b46-footer-seo-bottom-release-style">'+footerCss+'</style>\n<script id="b46-footer-seo-bottom-release-script">'+footerJs+'</script>\n';
 const out=html.replace(anchor,block+anchor);
 assert.equal(out.replace(block,''),html,'HTML_SCOPE_VIOLATION');
 return out;
}
function config(v,settings,schedules,dir){
 assert.equal(v.main_module,'index.js','WORKER_MAIN_CHANGED');
 assert(v.compatibility_date,'COMPATIBILITY_DATE_MISSING');
 assert(Array.isArray(v.bindings)&&v.bindings.every(b=>['assets','service'].includes(b.type)),'UNSUPPORTED_BINDING_STOP');
 const assets=v.bindings.filter(b=>b.type==='assets');
 assert.equal(assets.length,1,'ASSET_BINDING_COUNT_CHANGED');
 assert(v.assets?.config?.base_path==='/','ASSET_CONFIG_CHANGED');
 const cfg={name:SCRIPT,main:'./index.js',compatibility_date:v.compatibility_date,compatibility_flags:v.compatibility_flags||[],no_bundle:true,
  services:v.bindings.filter(b=>b.type==='service').map(b=>({binding:b.name,service:b.service,...(b.environment?{environment:b.environment}:{})})),
  assets:{directory:dir,binding:assets[0].name,html_handling:v.assets.config.html_handling,not_found_handling:v.assets.config.not_found_handling,run_worker_first:v.assets.config.run_worker_first},
  triggers:{crons:schedules}};
 for(const x of ['logpush','limits','observability'])if(settings[x]!=null)cfg[x]=settings[x];
 if(settings.placement?.mode==='smart')cfg.placement=settings.placement;
 return cfg;
}
async function collect(v,source,patched,currentHtml,settings,schedules){
 const dir=resolve('runtime'),assets=resolve(dir,'assets');
 mkdirSync(assets,{recursive:true});
 const required=new Set(readFileSync(resolve('baseline-assets.txt'),'utf8').split(/\r?\n/).filter(Boolean));
 for(const m of v.modules.filter(x=>x.name!==v.main_module)){
  assert(m.name.startsWith('assets/'),'UNEXPECTED_MODULE_'+m.name);
  const name=m.name.slice('assets/'.length);
  assert(name&&!name.split('/').includes('..')&&/^[A-Za-z0-9][A-Za-z0-9./_-]*$/.test(name),'UNSAFE_ASSET_'+name);
  required.add(name);
 }
 const paths=new Set(required);
 for(const match of currentHtml.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)){
  try{const u=new URL(match[1],ORIGIN);if(u.origin===ORIGIN&&/\.(?:html|js|css|svg|png|jpe?g|webp|ico|txt|xml)$/i.test(u.pathname)&&!u.pathname.startsWith('/cdn-cgi/'))paths.add(u.pathname.slice(1))}catch{}
 }
 assert(paths.size>=75,'ASSET_INVENTORY_TOO_SMALL_'+paths.size);
 const original={};let missingOptional=0;
 const queue=[...paths].sort();
 for(let offset=0;offset<queue.length;offset+=5){
  const batch=queue.slice(offset,offset+5);
  const result=await Promise.all(batch.map(async path=>{
   const [d,c]=await Promise.all([publicAsset('/'+path,DIRECT),publicAsset('/'+path,ORIGIN)]);
   if(d.status===404&&c.status===404&&!required.has(path))return null;
   assert(d.status===200&&c.status===200,'ACTIVE_ASSET_HTTP_'+path+'_DIRECT'+d.status+'_CUSTOM'+c.status);
   assert(sha(d.body)===sha(c.body),'CUSTOM_DIRECT_ASSET_MISMATCH_'+path);
   return d.body;
  }));
  for(let i=0;i<batch.length;i++){
   const path=batch[i],bytes=result[i];if(!bytes){missingOptional++;continue}
   original[path]=sha(bytes);
   const target=resolve(assets,path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,path==='index.html'?patched:bytes);
  }
 }
 assert(original['index.html']&&Object.keys(original).length>=75,'INCOMPLETE_ASSET_BACKUP');
 writeFileSync(resolve(dir,'index.js'),source);
 writeFileSync(resolve(dir,'wrangler.jsonc'),JSON.stringify(config(v,settings,schedules,assets),null,2));
 return {dir,assets,original,missingOptional};
}
function wrangler(staged,args,filename){
 const p=spawnSync('npx',['--yes','wrangler@4.92.0',...args,'--config','wrangler.jsonc'],{cwd:staged.dir,encoding:'utf8',env:process.env,maxBuffer:16*1024*1024});
 const output=(p.stdout||'')+(p.stderr||'');
 writeFileSync('audit/'+filename+'.log',output);
 assert(p.status===0&&!p.error,'WRANGLER_'+filename+'_FAILED_'+(p.error?.message||p.status));
 return output;
}
async function browserCheck(base,expectedVersion){
 const browser=await chromium.launch({headless:true}),checks=[];
 try{
  for(const [mode,width,height] of [['desktop',1440,900],['mobile',390,844]]){
   const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
   const page=await ctx.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(base+'/?view=live&b46FooterVerify='+Date.now(),{waitUntil:'domcontentloaded',timeout:80000});
   assert(response?.ok(),'BROWSER_HTTP_'+mode+'_'+response?.status());
   await page.waitForFunction(()=>window.__b46FooterSeoBottomStats?.moved===true,null,{timeout:45000});
   const state=await page.evaluate(()=>{
    const root=document.querySelector('#b46-site-footer-v1'),inner=root?.querySelector('.b46f-inner'),block=document.querySelector('.b46-seo-guide[data-b46-seo-guide="home"]');
    const langs=[...block.querySelectorAll('nav[aria-label="Languages"] a')],res=[...block.querySelectorAll('nav[aria-label="Football resources"] a')];
    return {inside:root.contains(block),last:inner?.lastElementChild===block,
      langs:langs.map(a=>({href:a.getAttribute('href'),hl:a.getAttribute('hreflang'),line:getComputedStyle(a).textDecorationLine})),
      resources:res.map(a=>({href:a.getAttribute('href'),line:getComputedStyle(a).textDecorationLine})),
      overflow:document.documentElement.scrollWidth>innerWidth+2,script:!!document.getElementById('b46-footer-seo-bottom-release-script'),htmlMarker:document.documentElement.outerHTML.includes('B46_FOOTER_SEO_BOTTOM_20261124'),
      footerVersion:root.dataset.b46FooterVersion,
      pageLinks:document.querySelectorAll('a').length};
   });
   assert(state.inside&&state.last,'RELOCATION_FAILED_'+mode);
   assert(state.langs.length===13&&state.langs.every(x=>x.href&&x.hl&&x.line==='none'),'LANG_SEO_CHANGED_'+mode);
   assert(state.resources.length===3&&state.resources.every(x=>x.href&&x.line==='none'),'RESOURCES_CHANGED_'+mode);
   assert(!state.overflow,'PAGE_OVERFLOW_'+mode);
   assert(state.script&&state.htmlMarker,'RELEASE_TAG_MISSING_'+mode);
   assert(errors.length===0,'BROWSER_ERRORS_'+mode+':'+errors.slice(0,3).join('|'));
   checks.push({mode,passed:true,langs:state.langs.length,resources:state.resources.length,footerVersion:state.footerVersion,active:expectedVersion});
   await ctx.close();
  }
 }finally{await browser.close()}
 return checks;
}
async function rollback(){
 if(!activated)return;
 const live=await active();if(live===previous)return;
 assert.equal(live,candidate,'PRODUCTION_MOVED_DO_NOT_ROLLBACK_FOREIGN_CHANGE');
 await api('/scripts/'+SCRIPT+'/deployments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({strategy:'percentage',versions:[{version_id:previous,percentage:100}],annotations:{'workers/message':'Rollback '+MARK}})});
 assert.equal(await active(),previous,'ROLLBACK_NOT_CONFIRMED');report.rolledBack=true;save();
}
try{
 previous=await active();report.beforeVersion=previous;save();
 const v=await version(previous),main=v.modules.find(x=>x.name===v.main_module);
 assert(main?.content_base64,'CURRENT_MAIN_CONTENT_MISSING');
 const source=Buffer.from(main.content_base64,'base64').toString('utf8');
 parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const [d,c]=await Promise.all([publicAsset('/index.html',DIRECT),publicAsset('/index.html',ORIGIN)]);
 assert(d.status===200&&c.status===200,'PRODUCTION_INDEX_NOT_REACHABLE');
 const ix=v.modules.find(x=>x.name==='assets/index.html');
 const moduleHtml=ix?.content_base64?Buffer.from(ix.content_base64,'base64'):null;
 const a=d.body.toString('utf8'),b=c.body.toString('utf8');
 let diff=0;while(diff<Math.min(a.length,b.length)&&a[diff]===b[diff])diff++;
 report.sourceComparison={direct:{status:d.status,size:a.length,sha:sha(d.body)},custom:{status:c.status,size:b.length,sha:sha(c.body)},module:moduleHtml?{size:moduleHtml.length,sha:sha(moduleHtml)}:null,firstMismatch:diff,aroundDirect:a.slice(Math.max(0,diff-170),diff+280),aroundCustom:b.slice(Math.max(0,diff-170),diff+280)};save();
 console.log('B46_FOOTER_SOURCE_COMPARISON '+JSON.stringify(report.sourceComparison));
 const allModules=v.modules.map(m=>({name:m.name,size:m.content_base64?Buffer.from(m.content_base64,'base64').length:0}));
 const markers={served:{seo:a.includes('data-b46-seo-guide="home"'),footer:a.includes('id="b46-site-footer-v1"'),head:a.includes('</head>')},module:{seo:moduleHtml?.toString('utf8').includes('data-b46-seo-guide="home"'),footer:moduleHtml?.toString('utf8').includes('id="b46-site-footer-v1"'),head:moduleHtml?.toString('utf8').includes('</head>')},mainSource:{rewriter:source.includes('HTMLRewriter'),footer:source.includes('b46-site-footer-v1')}};
 const expectedFontEnd='<style>\\nbody .workspace.singlep';
 const p1=a.indexOf('<!-- B46_SEARCH_CARD_INTER_DARK_20261007 START -->'),p2=b.indexOf('<!-- B46_SEARCH_CARD_INTER_DARK_20261007 START -->');
 const e1=a.indexOf(expectedFontEnd,p1),e2=b.indexOf(expectedFontEnd,p2);
 console.log('B46_FOOTER_ACTIVE_VERSION_DIAGNOSTIC '+JSON.stringify({moduleCount:allModules.length,modules:allModules.slice(0,15),markers,fontSegment:{startDirect:p1,startCustom:p2,endDirect:e1,endCustom:e2,prefixSame:p1>=0&&p1===p2&&a.slice(0,p1)===b.slice(0,p2),suffixSame:e1>=0&&e2>=0&&a.slice(e1)===b.slice(e2)}}));
 throw new Error('DIAGNOSTIC_ONLY_BEFORE_DEPLOY');
 assert.equal(sha(d.body),sha(c.body),'CUSTOM_DIRECT_INDEX_DIFFER');
 const currentHtml=d.body.toString('utf8');
 const nextHtml=patch(currentHtml);
 report.beforeHtmlSha=sha(currentHtml);report.afterHtmlSha=sha(nextHtml);
 const settings=await api('/scripts/'+SCRIPT+'/settings'),originalSettings=canon(settings),schedules=await crons();
 const staged=await collect(v,source,nextHtml,currentHtml,settings,schedules);
 report.protectedAssetCount=Object.keys(staged.original).length;report.assetHashes=staged.original;save();
 wrangler(staged,['deploy','--dry-run'],'dry-run');
 assert.equal(await active(),previous,'PRODUCTION_CHANGED_BEFORE_DEPLOY');
 assert.equal(canon(await api('/scripts/'+SCRIPT+'/settings')),originalSettings,'SETTINGS_CHANGED_BEFORE_DEPLOY');
 const output=wrangler(staged,['deploy','--tag',MARK,'--message','Move existing SEO guide to bottom footer; responsive; no underlines'],'deploy');
 candidate=output.match(/Version ID:\s*([a-f0-9-]{36})/i)?.[1];
 assert(candidate&&candidate!==previous,'DEPLOY_VERSION_MISSING');
 activated=true;report.afterVersion=candidate;save();
 assert.equal(await active(),candidate,'DEPLOY_NOT_ACTIVE');
 const after=await version(candidate);
 assert.equal(canon(after.bindings),canon(v.bindings),'BINDINGS_CHANGED');
 assert.equal(canon(after.assets?.config),canon(v.assets?.config),'ASSET_SETTINGS_CHANGED');
 assert.equal(after.compatibility_date,v.compatibility_date,'COMPAT_DATE_CHANGED');
 assert.equal(sha(Buffer.from(after.modules.find(x=>x.name===after.main_module).content_base64,'base64')),sha(source),'WORKER_LOGIC_CHANGED');
 assert.equal(canon(await crons()),canon(schedules),'CRON_CHANGED');
 assert.equal(canon(await api('/scripts/'+SCRIPT+'/settings')),originalSettings,'SETTINGS_CHANGED');
 let propagated=false;
 for(let i=0;i<50;i++){
  const [a,b]=await Promise.all([publicAsset('/index.html',DIRECT),publicAsset('/index.html',ORIGIN)]);
  if(a.status===200&&b.status===200&&sha(a.body)===sha(nextHtml)&&sha(b.body)===sha(nextHtml)){propagated=true;break}
  await wait(1200);
 }
 assert(propagated,'PRODUCTION_INDEX_NOT_PROPAGATED');
 for(const path of ['robots.txt','sitemap.xml','statistics.html']){
  const item=await publicAsset('/'+path,ORIGIN);
  assert(item.status===200&&sha(item.body)===staged.original[path],'PROTECTED_FILE_CHANGED_'+path);
 }
 report.browser=await browserCheck(ORIGIN,candidate);
 assert.equal(await active(),candidate,'PRODUCTION_MOVED_DURING_QA');
 report.result='SUCCESS';report.finishedAt=new Date().toISOString();save();
 console.log('B46_FOOTER_SEO_BOTTOM_PRODUCTION_SUCCESS '+JSON.stringify({before:previous,after:candidate,assets:report.protectedAssetCount,browser:report.browser}));
}catch(e){
 report.result=activated?'FAILED_AFTER_ACTIVATION':'FAILED_BEFORE_ACTIVATION';report.error=String(e?.stack||e);save();
 try{await rollback()}catch(rollbackError){report.rollbackError=String(rollbackError);save()}
 console.error(e);process.exitCode=1;
}
