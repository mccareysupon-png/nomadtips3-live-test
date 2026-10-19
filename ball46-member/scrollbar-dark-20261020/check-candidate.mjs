import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const out='audit/member-scrollbar-visual',f='ball46-member/scrollbar-dark-20261020/sidebar-scrollbar.css';
mkdirSync(out,{recursive:true});
const publicResponse=await fetch('https://member.ball46.com/styles.css?b46_scrollbar_qa='+Date.now(),{signal:AbortSignal.timeout(25000)});
assert.equal(publicResponse.status,200,'ACTIVE_CSS_NOT_PUBLIC_200');
const before=Buffer.from(await publicResponse.arrayBuffer());
const originalHash=createHash('sha256').update(before).digest('hex');
assert(before.length>200000,'ACTIVE_CSS_NOT_RECENT');
writeFileSync(out+'/active-styles.css',before);
const patched=spawnSync('python3',['ball46-member/scrollbar-dark-20261020/patch_css.py',out+'/active-styles.css',f,out+'/candidate-styles.css'],{encoding:'utf8'});
assert.equal(patched.status,0,'PATCH_GENERATOR_FAILED:'+patched.stderr+patched.stdout);
const base=before.toString('utf8'),css=readFileSync(f,'utf8');
const cases=[],browser=await chromium.launch({headless:true});
try{
  for(const width of [390,1280,1920]){
    const page=await browser.newPage({viewport:{width,height:860},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const cards=Array.from({length:14},(_,i)=>'<button class="market-tab'+(i===0?' active':'')+'"><span class="market-tab-name">Market '+(i+1)+'</span><span>'+(i*4+10)+'%</span></button>').join('');
    const sample='<!doctype html><html><head><style>'+base+'</style></head><body class="page-member market-menu-open">'+
     '<div class="member-sidebar-layout"><aside class="member-market-sidebar"><div class="member-sidebar-heading">MARKETS</div>'+
     '<div class="toolbar"><div class="toolbar-left"><div id="marketTabs" class="market-tabs">'+cards+
     '</div></div></div></aside></div></body></html>';
    await page.setContent(sample,{waitUntil:'domcontentloaded',timeout:45000});
    const data=()=>page.locator('.member-market-sidebar').evaluate(el=>{
      const scroll=getComputedStyle(el),thumb=getComputedStyle(el,'::-webkit-scrollbar-thumb'),track=getComputedStyle(el,'::-webkit-scrollbar-track'),r=el.getBoundingClientRect();
      return {color:scroll.scrollbarColor,thumb:thumb.backgroundColor,gradient:thumb.backgroundImage,track:track.backgroundColor,
        rect:{x:r.x,y:r.y,width:r.width,height:r.height},scrollWidth:el.scrollWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,
        firstCard:{border:getComputedStyle(el.querySelector('.market-tab')).border,background:getComputedStyle(el.querySelector('.market-tab')).backgroundImage}};
    });
    const oldData=await data();
    await page.screenshot({path:out+'/before-'+width+'.png'});
    await page.addStyleTag({content:css});
    const newData=await data();
    await page.screenshot({path:out+'/after-'+width+'.png'});
    // Modern Chromium honors the standard scrollbar-color property over the
    // legacy ::-webkit-scrollbar styling, so check the actual inherited values.
    // The pseudo selectors remain present as fallback for older WebKit.
    assert.equal(newData.color,'rgb(51, 65, 85) rgb(11, 22, 32)','DARK_SCROLLBAR_STANDARD_COLORS_NOT_APPLIED');
    assert(css.includes('::-webkit-scrollbar-thumb')&&css.includes('::-webkit-scrollbar-track'),'WEBKIT_FALLBACK_MISSING');
    assert.deepEqual(newData.rect,oldData.rect,'SIDEBAR_POSITION_OR_SIZE_CHANGED');
    assert.deepEqual(newData.firstCard,oldData.firstCard,'MARKET_CARD_STYLES_CHANGED');
    assert(newData.scrollHeight>newData.clientHeight,'SCROLLBAR_TEST_NOT_SCROLLABLE');
    assert.equal(newData.color,'rgb(51, 65, 85) rgb(11, 22, 32)','SCROLLBAR_COLORS_MISMATCH');
    assert.equal(errors.length,0,'BROWSER_JS_ERROR:'+errors.join(';'));
    cases.push({width,old:oldData,next:newData});
    await page.close();
  }
}finally{await browser.close();}
writeFileSync(out+'/report.json',JSON.stringify({scope:'Only member MARKET sidebar scrollbar',productionChanged:false,liveStylesSha256:originalHash,passed:true,cases},null,2));
console.log('MEMBER_DARK_SCROLLBAR_CANDIDATE_QA_SUCCESS',JSON.stringify({liveSha256:originalHash,cases:cases.map(x=>({width:x.width,scrollbarColor:x.next.color,track:x.next.track,thumb:x.next.gradient,sidebarUnchanged:true,cardUnchanged:true}))}));
