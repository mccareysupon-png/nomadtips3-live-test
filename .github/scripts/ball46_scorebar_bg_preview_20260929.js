const fs=require('fs');
const https=require('https');
const {chromium}=require('playwright');
const branchRoot='ops/ball46-scorebar-bg-20260929';
const b64={};
for(const k of ['win','loss','draw','pending']) b64[k]=fs.readFileSync(`${branchRoot}/${k}.webp.b64`,'utf8').trim();
function get(url){return new Promise((resolve,reject)=>https.get(url,{headers:{'User-Agent':'Ball46-Scorebar-BG-Preview/20260929','Cache-Control':'no-cache'}},r=>{let d='';r.setEncoding('utf8');r.on('data',c=>d+=c);r.on('end',()=>r.statusCode>=200&&r.statusCode<300?resolve(d):reject(new Error(url+' '+r.statusCode)));}).on('error',reject));}
function override(){return `\n/* BALL46_SCOREBAR_BG_REPLACEMENT_20260929 — presentation only; gradients/status logic unchanged. */\n@media(min-width:761px){\n.workspace-scorebar-cell.workspace-scorebar-signal-result,.workspace-scorebar-cell.workspace-scorebar-pending{background-repeat:no-repeat!important;background-size:cover!important;background-position:right center!important}\n.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win{background-color:#103A24!important;background-image:linear-gradient(90deg,rgba(6,24,14,.62),rgba(6,24,14,.36)),url("data:image/webp;base64,${b64.win}")!important}\n.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{background-color:#3B1212!important;background-image:linear-gradient(90deg,rgba(25,5,5,.54),rgba(25,5,5,.28)),url("data:image/webp;base64,${b64.loss}")!important}\n.workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw{background-color:#2F343C!important;background-image:linear-gradient(90deg,rgba(16,20,25,.60),rgba(16,20,25,.34)),url("data:image/webp;base64,${b64.draw}")!important}\n.workspace-scorebar-cell.workspace-scorebar-pending{background-color:#132A46!important;background-image:linear-gradient(90deg,rgba(5,18,38,.54),rgba(5,18,38,.24)),url("data:image/webp;base64,${b64.pending}")!important}\n}\n`;}
(async()=>{
  const liveTune=await get('https://www.ball46.com/dashboard-v2-tune.css?bgpreview=20260929');
  if(liveTune.includes('BALL46_SCOREBAR_BG_REPLACEMENT_20260929')) throw new Error('STOP: replacement marker already live');
  const candidate=liveTune.replace(/\s+$/,'')+override();
  fs.mkdirSync('ball46-scorebar-bg-preview-20260929',{recursive:true});
  fs.writeFileSync('ball46-scorebar-bg-preview-20260929/dashboard-v2-tune.candidate.css',candidate);
  const browser=await chromium.launch({headless:true});
  const report={productionMutated:false,generatedAt:new Date().toISOString(),candidateBytes:Buffer.byteLength(candidate),views:{}};
  for(const [name,width] of [['desktop1440',1440],['desktop1920',1920],['tablet1000',1000]]){
    const ctx=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}); const page=await ctx.newPage();
    await page.route('**/dashboard-v2-tune.css*',r=>r.fulfill({status:200,contentType:'text/css; charset=utf-8',body:candidate}));
    await page.goto('https://www.ball46.com/?scorebar_bg_preview=20260929',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForSelector('[data-workspace-scorebar-slot]',{state:'attached',timeout:30000});
    await page.evaluate(()=>{
      const slot=document.querySelector('[data-workspace-scorebar-slot]'); if(!slot) throw new Error('scorebar missing');
      const card=(cls,label)=>`<div class="workspace-scorebar-cell ${cls}"><span class="workspace-scorebar-meta"><i>${label}</i><b>2–1</b></span><span class="workspace-scorebar-match">HOME · AWAY</span><span class="workspace-scorebar-pick"><strong>MARKET</strong><em>SELECTION @ 1.80</em></span><span class="workspace-scorebar-details"><span class="workspace-scorebar-detail-entry"><i>ENTRY</i><b>1–0</b></span><span class="workspace-scorebar-detail-minute">55'</span><span class="workspace-scorebar-detail-current"><i>FT</i><b>2–1</b></span></span></div>`;
      slot.innerHTML='<div class="workspace-scorebar-grid">'+card('workspace-scorebar-signal-result outcome-win','WIN')+card('workspace-scorebar-signal-result outcome-loss','LOSS')+card('workspace-scorebar-signal-result outcome-draw','DRAW')+card('workspace-scorebar-pending','PENDING')+Array(6).fill('<div class="workspace-scorebar-cell placeholder"><span>—</span></div>').join('')+'</div>';
    });
    const state=await page.evaluate(()=>[...document.querySelectorAll('[data-workspace-scorebar-slot] .workspace-scorebar-cell')].slice(0,4).map((c,i)=>{const r=c.getBoundingClientRect(),s=getComputedStyle(c);return{i,width:r.width,height:r.height,bgSize:s.backgroundSize,bgPosition:s.backgroundPosition,bgImagePrefix:s.backgroundImage.slice(0,80),scrollHeight:c.scrollHeight}}));
    const matchedRules=await page.evaluate(()=>{const out=[];for(const ss of [...document.styleSheets]){let rules;try{rules=ss.cssRules}catch{continue}for(const r of [...(rules||[])]){const text=r.cssText||'';if(text.includes('workspace-scorebar')&&text.includes('background-position'))out.push({href:ss.href||'inline',text:text.slice(0,1200)})}}return out});
    for(const c of state){if(Math.abs(c.height-118)>1.5)throw new Error(`${name}: height drift ${c.height}`);if(c.scrollHeight>c.height+2)throw new Error(`${name}: overflow card ${c.i}`);if(!c.bgImagePrefix.includes('linear-gradient'))throw new Error(`${name}: background missing ${c.i}`);}
    report.views[name]={cards:state,matchedRules};
    await page.screenshot({path:`ball46-scorebar-bg-preview-20260929/${name}.png`,fullPage:false}); await ctx.close();
  }
  await browser.close(); fs.writeFileSync('ball46-scorebar-bg-preview-20260929/report.json',JSON.stringify(report,null,2)); console.log('PREVIEW_OK',JSON.stringify(report));
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
