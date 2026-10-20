import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import puppeteer from 'puppeteer-core';

const SCRIPT='ball46-production',EXPECTED='7dd29d6d-e9aa-400a-ac6f-c0d82008b8c5',ORIGIN='https://ball46.com';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
const sha=x=>createHash('sha256').update(x).digest('hex');
const report={mode:'READ_ONLY_BROWSER_AND_CLOUDFLARE_AUDIT',expectedWorkerVersion:EXPECTED,run:process.env.GITHUB_RUN_ID,startedAt:new Date().toISOString(),screens:[],api:{},errors:[]};
mkdirSync('audit',{recursive:true});
const save=()=>writeFileSync('audit/report.json',JSON.stringify(report,null,2));
async function request(url,headers={}){const r=await fetch(url,{headers:{'Cache-Control':'no-cache',...headers},signal:AbortSignal.timeout(45000)});const body=Buffer.from(await r.arrayBuffer());return {status:r.status,body,headers:r.headers};}
async function cloudflare(route){assert(ACCOUNT&&TOKEN,'MISSING_READONLY_CLOUDFLARE_CREDENTIALS');const x=await request('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+route,{Authorization:'Bearer '+TOKEN});const j=JSON.parse(x.body.toString());assert(x.status===200&&j.success,'CF_READ_ERROR');return j.result;}
function trimmed(x){return String(x||'').replace(/\s+/g,' ').slice(0,250);}
function snapOf(g){
 const r=g.getBoundingClientRect(),rect=g.querySelector('rect'),style=rect?getComputedStyle(rect):null;
 return {realLiveDom:true,minute:g.getAttribute('data-signal-minute'),side:g.getAttribute('data-annotation-side'),visible:r.width>0&&r.height>0,
  groupHtmlLength:g.outerHTML.length,rectPresent:!!rect,
  stroke:style?.stroke,strokeWidth:style?.strokeWidth,fill:style?.fill,filter:style?.filter,
  label:trimmed(g.textContent),rectGeometry:rect?{x:rect.getAttribute('x'),y:rect.getAttribute('y'),width:rect.getAttribute('width'),height:rect.getAttribute('height')}:null};
}
async function getDom(page){
 return page.evaluate(()=>{
  const tr=s=>String(s||'').replace(/\s+/g,' ').slice(0,170);
  const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const cards=[...document.querySelectorAll('svg g.b46-eventflow-signal-entry.b46-eventflow-signal-annotation')].map(g=>{
   const r=g.getBoundingClientRect(),rect=g.querySelector('rect'),style=rect?getComputedStyle(rect):null;
   return {minute:g.getAttribute('data-signal-minute'),visible:visible(g),stroke:style?.stroke,strokeWidth:style?.strokeWidth,fill:style?.fill,filter:style?.filter,
   text:tr(g.textContent),rectGeometry:rect?{width:rect.getAttribute('width'),height:rect.getAttribute('height')}:null,cardRect:{x:r.x,y:r.y,width:r.width,height:r.height}};
  });
  const rows=[...document.querySelectorAll('article.match-row,.b46gn-card,[data-fixture-id],[data-match-id]')].slice(0,100);
  const expandButtons=[...document.querySelectorAll('button,[role="button"],[aria-expanded]')].filter(visible).filter(e=>/expand|detail|more|event|flow|show/i.test(tr(e.textContent)+' '+e.getAttribute('aria-label')+' '+e.className)).slice(0,35);
  return {url:location.href,title:document.title,bodyText:tr(document.body.innerText),ready:document.readyState,rows:rows.length,
   signalCards:cards, signalMarkers:document.querySelectorAll('svg g.b46-eventflow-signal-entry').length,
   stylePresent:!!document.getElementById('b46-eventflow-signal-v3-gradient-20261020'),
   gradientDefs:!!document.querySelector('#b46-eventflow-signal-graphite-gradient-20261020'),
   loaders: [...document.querySelectorAll('[id*="loading"],[class*="loading"]')].filter(visible).slice(0,8).map(e=>({tag:e.tagName,id:e.id,className:tr(e.className),text:tr(e.textContent)})),
   matchRows:rows.slice(0,14).map(e=>({tag:e.tagName,className:tr(e.className),text:tr(e.textContent)})),
   candidateButtons:expandButtons.map(e=>({text:tr(e.textContent),label:e.getAttribute('aria-label'),className:tr(e.className)}))};
 });
}
async function inspectScreen(browser,width,theme){
 const page=await browser.newPage(),rec={width,theme,clicks:[],errors:[]};
 page.on('pageerror',e=>rec.errors.push(trimmed(String(e))));
 try{
  await page.setViewport({width,height:900,isMobile:width<768,deviceScaleFactor:1});
  await page.setCacheEnabled(false);
  await page.goto(ORIGIN+'/?ball46_real_signal_readonly='+Date.now(),{waitUntil:'domcontentloaded',timeout:65000});
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await page.waitForFunction(()=>document.querySelectorAll('article.match-row,.b46gn-card,[data-fixture-id]').length>0,{timeout:25000}).catch(()=>{});
  await new Promise(r=>setTimeout(r,3500));
  rec.initial=await getDom(page);
  // A real SVG annotation is only rendered after its live match is expanded. Click genuine match cards in memory only.
  if(!rec.initial.signalCards.some(c=>c.visible)){
   const selectors=['article.match-row','.b46gn-card','[data-fixture-id]','.match-row','button[aria-expanded="false"]'];
   for(const sel of selectors){
    const count=await page.$$eval(sel,els=>els.length).catch(()=>0);
    for(let i=0;i<Math.min(count,18);i++){
     const nodes=await page.$$(sel),node=nodes[i];if(!node)continue;
     let name=await page.evaluate(e=>String(e.innerText||e.getAttribute('aria-label')||'').replace(/\s+/g,' ').slice(0,110),node).catch(()=>'');
     try{await node.click({delay:40});}catch(e){rec.clicks.push({selector:sel,index:i,error:trimmed(e)});continue;}
     await new Promise(r=>setTimeout(r,650));
     const n=await page.evaluate(()=>[...document.querySelectorAll('svg g.b46-eventflow-signal-entry.b46-eventflow-signal-annotation')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).length);
     rec.clicks.push({selector:sel,index:i,match:trimmed(name),signalAnnotations:n});
     if(n>0)break;
    }
    const n=await page.evaluate(()=>document.querySelectorAll('svg g.b46-eventflow-signal-entry.b46-eventflow-signal-annotation').length);
    if(n>0)break;
   }
  }
  rec.final=await getDom(page);
  await page.screenshot({path:'audit/live-'+width+'-'+theme+'.png',fullPage:false});
  if(rec.final.signalCards.length){
   const target=await page.$('svg g.b46-eventflow-signal-entry.b46-eventflow-signal-annotation');
   if(target){await target.screenshot({path:'audit/live-signal-'+width+'-'+theme+'.png'}).catch(e=>rec.errors.push('SVG_CARD_CROP_FAILED '+trimmed(e)));}
  }
  rec.actualLiveSignalVerified=rec.final.signalCards.some(c=>c.visible&&c.stroke==='none'&&c.strokeWidth==='0px'&&String(c.fill).includes('b46-eventflow-signal-graphite-gradient-20261020'));
  report.screens.push(rec);save();
 }catch(e){rec.errors.push(String(e));report.errors.push('SCREEN '+width+'-'+theme+' '+String(e));report.screens.push(rec);save();}
 finally{await page.close();}
}
try{
 const deployments=await cloudflare('/workers/scripts/'+SCRIPT+'/deployments?per_page=1');
 const active=deployments.deployments?.[0];
 report.activeVersion=active?.versions?.[0]?.version_id;
 assert.equal(report.activeVersion,EXPECTED,'ACTIVE_VERSION_DRIFT_NO_UI_CLAIM');
 assert.equal(active.versions.length,1,'MULTI_VERSION_ACTIVE');
 assert.equal(Number(active.versions[0].percentage),100,'INCOMPLETE_PRODUCTION_ROLLOUT');
 for(const path of ['/','/expanded-match-343.js','/app.css','/api/engine/health','/api/engine/signals']){
  const r=await request(ORIGIN+path+'?b46_readonly='+Date.now());
  report.api[path]={status:r.status,bytes:r.body.length,sha256:sha(r.body)};
  if(path==='/')report.api[path].visualMarker=r.body.includes(Buffer.from('b46-eventflow-signal-v3-gradient-20261020'));
  if(path.startsWith('/api/')){try{const j=JSON.parse(r.body.toString());report.api[path].ok=j?.ok;report.api[path].rootKeys=Object.keys(j).slice(0,22);for(const [k,v] of Object.entries(j))if(Array.isArray(v))report.api[path].arrayCounts={...(report.api[path].arrayCounts||{}),[k]:v.length};}catch{report.api[path].validJson=false;}}
 }
 assert(report.api['/'].visualMarker,'LIVE_HTML_V3_MARKER_ABSENT');
 const browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{for(const width of [1440,390])for(const theme of ['dark','light'])await inspectScreen(browser,width,theme);}finally{await browser.close();}
 report.realSignalSeen=report.screens.some(s=>s.final?.signalCards?.some(c=>c.visible));
 report.realSignalCorrect=report.screens.filter(s=>s.final?.signalCards?.some(c=>c.visible)).every(s=>s.actualLiveSignalVerified);
 report.completedAt=new Date().toISOString();save();
 if(report.errors.length)console.log('B46_LIVE_SIGNAL_AUDIT_BROWSER_ERRORS',report.errors.length);
 console.log(report.realSignalSeen?(report.realSignalCorrect?'BALL46_REAL_SIGNAL_CARD_PASS':'BALL46_REAL_SIGNAL_CARD_VISUAL_MISMATCH'):'BALL46_REAL_SIGNAL_CARD_NOT_PRESENT_DURING_CHECK');
 console.log('BALL46_READ_ONLY_ACTIVE_VERSION',report.activeVersion);
 console.log('BALL46_READ_ONLY_AUDIT_DONE');
}catch(e){report.fatal=String(e);save();console.error('BALL46_AUDIT_STOP',String(e));process.exitCode=1;}
