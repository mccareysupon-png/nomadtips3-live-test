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
  assert.match(cssV6,/\.summary-stat\.mobile-avg-odds\{\s*order:8/);
  assert.match(cssV6,/height:47px!important/);
  assert.match(cssV6,/height:45px!important/);
  assert.match(cssV6,/font-size:7\.5px!important/);
  assert.match(cssV6,/font-size:clamp\(11px,3\.2vw,14px\)!important/);
  assert.match(cssV6,/@media\(max-width:349px\)/);
  assert.match(html,/kpi8=20261019-compact8-ledger-v1/);
});
test('extra DRAW and AVG ODDS cards are not displayed on Desktop',()=>{
  assert.match(cssV6,/@media\(min-width:768px\)\{/);
  assert.match(cssV6,/\.page-member #dailySummary \.summary-stat\.mobile-draw,/);
  assert.match(cssV6,/\.page-member #dailySummary \.summary-stat\.mobile-avg-odds\{display:none!important\}/);
  assert.match(js,/function renderSummary\(\)/);
  assert.doesNotMatch(js,/row\.result\s*=/);
});

test('desktop KPI backgrounds are 30 percent translucent while text stays opaque',()=>{
  const marker='/* BALL46 MEMBER — KPI finish: PC 30% transparency / mobile soft premium elevation (2026-10-19) */';
  const end=css.slice(css.indexOf(marker));
  assert.ok(end.startsWith(marker));
  const desktop=end.slice(0,end.indexOf('/* Keep the approved V6'));
  assert.match(desktop,/@media\(min-width:768px\)/);
  for(const color of ['17,39,55','30,68,60','75,41,52','71,59,37','29,57,76']){
    assert.ok(desktop.includes('background:rgba('+color+',.70)'),color+' background must be 30% transparent');
  }
  assert.doesNotMatch(desktop,/\bopacity\s*:/);
  assert.match(html,/kpifinish=20261019-desktop30-mobile-depth-v1/);
});
test('mobile eight KPI cards gain clean soft elevation without size or color changes',()=>{
  const end=css.slice(css.indexOf('/* BALL46 MEMBER — KPI finish: PC 30% transparency / mobile soft premium elevation (2026-10-19) */'));
  const mobile=end.slice(end.indexOf('/* Keep the approved V6'));
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
