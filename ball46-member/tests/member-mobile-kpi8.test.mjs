import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const marker='/* BALL46 MEMBER — Mobile V6 eight compact KPI cards from existing Ledger metrics */';
const cssV6=css.slice(css.indexOf(marker));

test('mobile eight-card summary uses existing WIN LOSS PUSH ledger counts',()=>{
  assert.ok(cssV6.startsWith(marker));
  assert.match(js,/\['SIGNALS',s\.signals,'signals'\]/);
  assert.match(js,/\['WIN',s\.win,'win'\]/);
  assert.match(js,/\['LOSS',s\.loss,'loss'\]/);
  assert.match(js,/\['DRAW',s\.push,'mobile-draw'\]/);
  assert.match(js,/\['PENDING',s\.pending,'pending'\]/);
  assert.match(js,/\['WIN RATE',fmtPct\(s\.winRate\),rateClass\]/);
  assert.match(js,/summary\.append\(pnlBox\)/);
  assert.match(js,/DRAW \/ PUSH — stake returned on settlement; not a drawn match/);
});
test('AVG ODDS uses recorded entry price without synthetic zeros or unrelated markets',()=>{
  const source=js.match(/function averageRecordedOdds\(rows\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(source,'mean helper exists');
  const mean=Function('return ('+source+')')();
  assert.equal(mean([{odds:1.75},{odds:2.25}]),2);
  assert.equal(mean([{odds:0.8},{odds:1.2}]),1);
  assert.equal(mean([{odds:null},{odds:undefined},{odds:''},{odds:'?'},{odds:0},{odds:-1}]),null);
  assert.equal(mean([{odds:1.9},{odds:null},{odds:2.1}]),2);
  assert.equal(mean([]),null);
  assert.match(js,/state\.market==='ALL'\|\|row\.market===state\.market/);
  assert.match(js,/avgOdds===null\?'—':avgOdds\.toFixed\(2\)/);
  assert.match(js,/Mean recorded entry odds for signals in the selected market; missing prices excluded/);
});
test('all eight stats have explicit 4x2 mobile placement and compact card height',()=>{
  assert.match(cssV6,/@media\(max-width:767px\)/);
  assert.match(cssV6,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
  assert.match(cssV6,/\.summary-stat\.win\{\s*order:5/);
  assert.match(cssV6,/\.summary-stat\.loss\{\s*order:6/);
  assert.match(cssV6,/\.summary-stat\.mobile-draw\{\s*order:7/);
  assert.match(cssV6,/\.summary-stat\.avg-odds\{\s*order:8/);
  assert.match(cssV6,/height:47px!important/);
  assert.match(cssV6,/height:45px!important/);
  assert.match(cssV6,/font-size:7\.5px!important/);
  assert.match(cssV6,/font-size:clamp\(11px,3\.2vw,14px\)!important/);
  assert.match(cssV6,/@media\(max-width:349px\)/);
  assert.match(html,/kpi8=20261019-compact8-ledger-v1/);
});
test('Desktop hides duplicate DRAW but displays AVG ODDS without altering mobile',()=>{
  assert.match(cssV6,/@media\(min-width:768px\)\{/);
  assert.match(cssV6,/\.page-member #dailySummary \.summary-stat\.mobile-draw\{display:none!important\}/);
  assert.doesNotMatch(cssV6,/\.summary-stat\.avg-odds\{display:none!important\}/);
  assert.match(cssV6,/\.summary-stat\.avg-odds\{\s*display:flex!important/);
  assert.match(js,/function renderSummary\(\)/);
  assert.doesNotMatch(js,/row\.result\s*=/);
});

test('desktop KPI cards have raised graphite depth and preserve outcome colors',()=>{
  const marker='/* BALL46 MEMBER — Desktop KPI Premium Soft Elevation; Mobile V6 preserved (2026-10-19) */';
  const end=css.slice(css.indexOf(marker));
  assert.ok(end.startsWith(marker));
  const desktop=end.slice(0,end.indexOf('/* Keep the approved V6'));
  assert.match(desktop,/@media\(min-width:768px\)/);
  assert.match(desktop,/\.page-member #dailySummary \.summary-stat\{\s*border:0;/);
  for(const color of ['35,65,83','43,92,76','94,51,64','88,76,45','37,77,101']){
    assert.ok(desktop.includes('linear-gradient(160deg,rgba('+color+',.45)'),color+' must preserve its outcome-color family at 55% transparency');
  }
  for(const rgb of ['35,65,83','13,35,52','43,92,76','17,56,47','94,51,64','62,31,44','88,76,45','54,45,31','37,77,101','21,52,72']){
    assert.ok(desktop.includes('rgba('+rgb+',.45)'),rgb+' gradient stop should have alpha .45');
  }
  assert.match(desktop,/0 11px 25px rgba\(0,0,0,\.25\)/);
  assert.match(desktop,/0 3px 7px rgba\(0,0,0,\.15\)/);
  assert.match(desktop,/inset 0 1px 0 rgba\(235,250,255,\.13\)/);
  assert.match(desktop,/inset 0 -1px 0 rgba\(0,8,18,\.20\)/);
  assert.doesNotMatch(desktop,/\bopacity\s*:/);
  assert.match(html,/pcdepth=20261019-premium-soft-elevation-v1/);
});
test('mobile eight KPI cards gain clean soft elevation without size or color changes',()=>{
  const end=css.slice(css.indexOf('/* BALL46 MEMBER — Desktop KPI Premium Soft Elevation; Mobile V6 preserved (2026-10-19) */'));
  const mobile=end.slice(end.indexOf('/* Keep the approved V6'),end.indexOf('/* BALL46 MEMBER — Desktop KPI height: 10% then 6% shorter; Mobile preserved (2026-10-19) */'));
  assert.match(mobile,/@media\(max-width:767px\)/);
  assert.match(mobile,/border:0!important/);
  assert.match(mobile,/0 8px 17px rgba\(0,0,0,\.24\)/);
  assert.match(mobile,/0 2px 5px rgba\(0,0,0,\.13\)/);
  assert.match(mobile,/inset 0 1px 0 rgba\(255,255,255,\.12\)/);
  assert.match(mobile,/inset 0 -1px 0 rgba\(0,0,0,\.12\)!important/);
  assert.doesNotMatch(mobile,/height:|min-height:|font-size:|background:/);
  assert.match(cssV6,/height:47px!important/);
  assert.match(cssV6,/height:45px!important/);
  assert.match(cssV6,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('desktop KPI cards are another 6 percent shorter than last release without altering mobile',()=>{
  const marker='/* BALL46 MEMBER — Desktop KPI height: 10% then 6% shorter; Mobile preserved (2026-10-19) */';
  const finish=css.slice(css.indexOf(marker),css.indexOf('/* BALL46 MEMBER — Pricing/Login V5 header parity with Signal Center (2026-10-20) */'));
  assert.ok(finish.startsWith(marker),'height override must exist');
  assert.match(finish,/@media\(min-width:768px\) and \(max-width:1559px\)\{\s*\.page-member #dailySummary \.summary-stat\{\s*height:62\.604px;\s*min-height:62\.604px;\s*padding-block:8\.46px;/);
  assert.match(finish,/@media\(min-width:1560px\)\{\s*\.page-member #dailySummary \.summary-stat\{\s*height:59\.22px;\s*min-height:59\.22px;\s*padding-block:6\.768px;/);
  assert.ok(Math.abs(62.604/66.6-.94)<1e-12);
  assert.ok(Math.abs(59.22/63-.94)<1e-12);
  assert.doesNotMatch(finish,/@media\(max-width:767px\)/);
  assert.doesNotMatch(finish,/^\s*(?:background|box-shadow|font-size|letter-spacing|width)\s*:/m);
  assert.match(html,/pcKpiHeight90=20261019-pc-kpi-90pct-v1/);
  assert.match(html,/pcKpiAlpha45Height94=20261019-alpha45-minus6-v1/);
  assert.match(cssV6,/height:47px!important/);
  assert.match(cssV6,/height:45px!important/);
});

test('production desktop KPI V7 has nine columns and a visible premium AVG ODDS card',()=>{
  const marker='/* BALL46 MEMBER — Desktop KPI V7: nine live-data summary cards, one row (2026-10-20).';
  const v7=css.slice(css.indexOf(marker));
  assert.ok(v7.startsWith(marker),'the latest desktop nine-column guard is missing');
  assert.match(v7,/@media\(min-width:768px\)/);
  assert.match(v7,/grid-template-columns:repeat\(9,minmax\(0,1fr\)\)!important/);
  assert.match(v7,/\.summary-stat\.avg-odds\{\s*display:flex!important/);
  assert.match(v7,/linear-gradient\(160deg,rgba\(30,77,100,\.45\)/);
  assert.match(v7,/\.summary-stat\.avg-odds b\{color:#a9e1fc\}/);
  assert.match(html,/kpiV7=desktop-nine-in-one-row-20261020/);
  assert.match(cssV6,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)!important/);
});

test('desktop summary never renders legacy half-result tiles and uses real odds per market',()=>{
  const summarySource=js.match(/function renderSummary\(\)\{[\s\S]*?\n\}/)?.[0];
  const oddsSource=js.match(/function averageRecordedOdds\(rows\)\{[\s\S]*?\n\}/)?.[0];
  assert.ok(summarySource&&oddsSource);
  assert.doesNotMatch(summarySource,/\['HALF WIN'|\['HALF LOSS'/);
  const averageRecordedOdds=Function('return ('+oddsSource+')')();
  const summary={children:[],replaceChildren(){this.children=[]},append(...items){this.children.push(...items)}};
  const node=(tag,cls,text)=>({
    tag,cls,text,children:[],title:'',attrs:{},
    append(...items){this.children.push(...items)},
    setAttribute(k,v){this.attrs[k]=v}
  });
  const make=(market,rows)=>{
    const state={market,payload:{signals:rows,summary:{
      ALL:{signals:7,win:3,loss:2,push:1,pending:1,live:1,winRate:60,pnl:2.31,halfWin:1,halfLoss:1,unresolved:1,void:2},
      'O/U':{signals:2,win:1,loss:1,push:0,pending:0,live:0,winRate:50,pnl:-1.25,halfWin:0,halfLoss:0,unresolved:0,void:0}
    }}};
    return Function('state','summary','node','currentStats','averageRecordedOdds','fmtPct','fmtPnl',
      summarySource+';return renderSummary;')(
        state,summary,node,()=>state.payload.summary[market],averageRecordedOdds,
        v=>v===null?'—':v.toFixed(1)+'%',
        v=>(v>0?'+':'')+Number(v||0).toFixed(2)+'u'
      );
  };
  const signals=[{market:'O/U',odds:1.8},{market:'O/U',odds:2.2},{market:'AH',odds:null}];
  make('ALL',signals)();
  const desktop=summary.children.filter(x=>!x.cls.includes('mobile-draw'));
  assert.deepEqual(desktop.map(x=>x.children[0].text),[
    'SIGNALS','WIN','LOSS','PUSH','PENDING','LIVE','WIN RATE','AVG ODDS','P/L TODAY'
  ]);
  assert.equal(desktop.length,9);
  assert.equal(desktop.find(x=>x.cls.includes('avg-odds')).children[1].text,'2.00');
  assert.match(desktop.find(x=>x.cls.includes('pending')).title,/UNRESOLVED: 1 · VOID: 2/);
  make('O/U',signals)();
  assert.equal(summary.children.find(x=>x.cls.includes('avg-odds')).children[1].text,'2.00');
  assert.equal(summary.children.find(x=>x.cls.includes('pnl-card')).children[1].text,'-1.25u');
});
