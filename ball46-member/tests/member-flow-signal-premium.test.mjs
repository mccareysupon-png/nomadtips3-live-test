import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const marker='/* BALL46 MEMBER — Event Flow SIGNAL raised borderless plate, single 1x glow (2026-10-20) */';
const finish=css.slice(css.indexOf(marker));

test('Event Flow SIGNAL plate is borderless with only one soft emerald bloom and one depth shadow',()=>{
  assert.ok(finish.startsWith(marker));
  const plate=finish.match(/\.page-member \.member-flow-signal-plate\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(plate);
  assert.match(plate,/stroke:none!important/);
  assert.match(plate,/stroke-width:0!important/);
  assert.match(plate,/animation:none!important/);
  assert.equal((plate.match(/drop-shadow\(/g)||[]).length,2);
  assert.equal((plate.match(/drop-shadow\(0 0 3px rgba\(67,230,162,\.20\)\)/g)||[]).length,1,'exactly one 1x emerald glow');
  assert.match(plate,/drop-shadow\(0 3px 5px rgba\(0,0,0,\.30\)\)/);
  const accent=finish.match(/\.page-member \.member-flow-signal-accent\{([\s\S]*?)\n\}/)?.[1];
  assert.ok(accent);
  assert.match(accent,/animation:none!important/);
  assert.match(accent,/filter:none!important/);
});
test('raised appearance uses same SVG signal plate geometry and 3-stop emerald gradient',()=>{
  assert.match(js,/const signalPlateGradientId='member-signal-plate-'\+fixtureId/);
  assert.match(js,/const plateGradient=svgNode\('linearGradient'/);
  assert.match(js,/defs\.append\(gh,ga,plateGradient\)/);
  assert.match(js,/style:'fill:url\(#'\+signalPlateGradientId\+'\)'/);
  for(const color of ['#236b57','#164c41','#092c28'])assert.ok(js.includes("'stop-color':'"+color+"'"));
  assert.match(js,/const tagW=clamp\(42\+entryText\.length\*4\.7,150,236\),tagH=36/);
  assert.match(js,/const plate=svgNode\('rect',\{x:tagX,y:tagY,width:tagW,height:tagH,rx:'5',ry:'5'/);
  assert.match(js,/const detailText=svgNode\('text'/);
  assert.match(js,/const oddsLabel=s\.odds==null\?'':fmtOdds\(s\.odds\)/);
});
test('Event Flow SVG assets update without changing Member data flow',()=>{
  assert.equal(html.split('&eventSignal1x=20261020-borderless-raised-v1').length,3);
  assert.match(html,/src="\/member\.js\?/);
  assert.match(html,/href="\/styles\.css\?/);
  assert.match(js,/const entryParts=\[market,\[pickLabel,lineLabel\]/);
  assert.match(js,/tag\.append\(plate,accent,label,detailText\)/);
});
