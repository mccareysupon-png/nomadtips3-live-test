import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

const dir='audit/member-statistics-v3-candidate';
mkdirSync(dir,{recursive:true});
const get=async path=>{
  const u='https://member.ball46.com/'+path+'?_compact_v3='+Date.now();
  const r=await fetch(u,{signal:AbortSignal.timeout(45000)});
  assert.equal(r.status,200,'PRODUCTION_ASSET_UNAVAILABLE:'+path);
  return Buffer.from(await r.arrayBuffer());
};
writeFileSync(dir+'/original-member.js',await get('member.js'));
writeFileSync(dir+'/original-styles.css',await get('styles.css'));
const py=spawnSync('python3',['ball46-member/statistics-compact-v3/patch_active_statistics.py',dir+'/original-member.js',dir+'/original-styles.css',dir+'/candidate-member.js',dir+'/candidate-styles.css',dir+'/patch-report.json'],{encoding:'utf8'});
assert.equal(py.status,0,py.stdout+py.stderr);
const syntax=spawnSync('node',['--check',dir+'/candidate-member.js'],{encoding:'utf8'});
assert.equal(syntax.status,0,syntax.stderr);
const originalJS=readFileSync(dir+'/original-member.js','utf8'),js=readFileSync(dir+'/candidate-member.js','utf8'),
      beforeCSS=readFileSync(dir+'/original-styles.css','utf8'),afterCSS=readFileSync(dir+'/candidate-styles.css','utf8');
assert(beforeCSS.length>200000&&js.length>75000);
const func=js.slice(js.indexOf('function renderSummary(){'),js.indexOf('\nfunction filteredRows(){',js.indexOf('function renderSummary(){')));
const oldfunc=originalJS.slice(originalJS.indexOf('function renderSummary(){'),originalJS.indexOf('\nfunction filteredRows(){',originalJS.indexOf('function renderSummary(){')));
assert(func.includes("desktop-avg-odds"),'AVG_ODDS_NOT_RESTORED');
assert(func.includes("s.halfWin"),'HALF_WINS_NOT_ADDED');
assert(func.includes("s.halfLoss"),'HALF_LOSSES_NOT_ADDED');
assert(afterCSS.startsWith(beforeCSS),'BASE_STYLES_CHANGED');
const browser=await chromium.launch({headless:true});
const shots=[],results=[];
try{
  for(const width of [390,767,768,900,1280,1920]){
    const page=await browser.newPage({viewport:{width,height:720},deviceScaleFactor:1});
    await page.setContent('<!doctype html><html><head></head><body class="page-member"><div class="shell" style="width:calc(100% - 24px);max-width:100%;margin:auto"><div id="dailySummary" class="summary"></div></div></body></html>',{waitUntil:'domcontentloaded'});
    await page.addStyleTag({content:beforeCSS});
    const check=async source=>page.evaluate((code)=>{
      const summary=document.querySelector('#dailySummary');
      summary.replaceChildren();
      const state={market:'ALL',payload:{signals:[
        {market:'AH',odds:1.85},{market:'AH',odds:2.15},{market:'AH',odds:null}
      ]}};
      const currentStats=()=>({signals:15,win:5,loss:3,push:2,halfWin:2,halfLoss:1,pending:1,live:1,winRate:61.1,pnl:4.25});
      const averageRecordedOdds=rows=>{const v=rows.map(x=>Number(x.odds)).filter((n,i)=>rows[i].odds!==null&&Number.isFinite(n)&&n>0);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
      const fmtPct=x=>x.toFixed(1)+'%';
      const fmtPnl=x=>x.toFixed(2);
      const node=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el};
      eval(code+';renderSummary();');
      const cards=[...summary.children];
      const positions=cards.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}});
      return {labels:cards.map(el=>el.querySelector('span')?.textContent),values:cards.map(el=>el.querySelector('b')?.textContent),
       positions,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
       style:cards[0]?{height:getComputedStyle(cards[0]).height,padding:getComputedStyle(cards[0]).padding}:null};
    },source);
    const old=await check(oldfunc);
    await page.addStyleTag({content:afterCSS.slice(beforeCSS.length)});
    const now=await check(func);
    if(width>=768){
      assert.deepEqual(now.labels,['SIGNALS','WIN','LOSS','PUSH','PENDING','LIVE','WIN RATE','P/L TODAY','AVG ODDS'],'9_KPI_ORDER_MISMATCH');
      assert.deepEqual(now.values,['15','7','4','2','1','1','61.1%','4.25','2.00'],'DESKTOP_ACTUAL_VALUES_INCORRECT');
      assert(now.positions.every(x=>Math.abs(x.y-now.positions[0].y)<2),'NOT_SINGLE_ROW:'+width);
      assert(now.positions.every(x=>Math.abs(x.height-60)<.2),'CARD_NOT_60_PX:'+width);
      assert(now.positions.every(x=>x.width>22),'CARD_TOO_NARROW:'+width);
      assert(now.scrollWidth<=width+2,'DESKTOP_HORIZONTAL_OVERFLOW:'+width);
    }else{
      assert.deepEqual(now.labels,old.labels,'MOBILE_CONTENT_MODIFIED:'+width);
      assert.deepEqual(now.values,old.values,'MOBILE_VALUES_MODIFIED:'+width);
      assert.deepEqual(now.positions,old.positions,'MOBILE_LAYOUT_MODIFIED:'+width);
    }
    let img=dir+'/candidate-'+width+'.png';
    await page.screenshot({path:img});
    shots.push(img);
    results.push({width,labels:now.labels,values:now.values,rowCount:new Set(now.positions.map(x=>Math.round(x.y))).size,cardHeight:now.positions[0]?.height});
    await page.close();
  }
}finally{await browser.close()}
writeFileSync(dir+'/qa.json',JSON.stringify({passed:true,preProduction:true,results},null,2));
console.log('MEMBER_DESKTOP_STATISTICS_COMPACT_V3_QA_SUCCESS',JSON.stringify(results.map(x=>({width:x.width,cardCount:x.labels.length,rowCount:x.rowCount,cardHeight:x.cardHeight}))));
