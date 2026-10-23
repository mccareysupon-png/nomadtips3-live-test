import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../../nomad-live/referee-price-flow-341.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../../nomad-live/referee-price-flow-341.css',import.meta.url),'utf8');
const livePage=readFileSync(new URL('../../nomad-live/index.html',import.meta.url),'utf8');
const runtime=readFileSync(new URL('../../nomad-live/runtime.js',import.meta.url),'utf8');
const wrapper=readFileSync(new URL('../src/index-fiveusd-shadow.js',import.meta.url),'utf8');

test('3.41 referee price-flow renderer is syntax-valid and isolated from core runtime',()=>{
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(runtime,/fiveusd-referee-flow|NOMAD_REFEREE_PRICE_FLOW_341|referee-price-flow-341/);
});

test('price flow reads storage endpoint only and never calls 5USD provider from browser',()=>{
  assert.match(script,/\/fiveusd-referee-flow\?fixtureId=/);
  assert.doesNotMatch(script,/api\.5dollarfootballapi\.com/i);
  assert.match(wrapper,/\/fiveusd-referee-flow/);
  assert.match(wrapper,/presentationOnly:true/);
});

test('expanded card places 10-book AH price flow directly after Event Flow',()=>{
  assert.match(script,/10 BOOK · AH PRICE FLOW/);
  assert.match(script,/eventFlow\.after\(card\)/);
  assert.match(script,/if\(!row\?\.open\)return;/);
  assert.match(script,/const REFRESH_MS=3_000;/);
  assert.match(style,/\.nomad-ref-flow-labels,.nomad-ref-flow-row/);
});

test('referee rows expose AH HOME AWAY MOVE PRICE FLOW AGE and fail closed to N\/A',()=>{
  for(const label of ['AH','HOME','AWAY','MOVE','PRICE FLOW','AGE']) assert.match(script,new RegExp(label));
  assert.match(script,/N\/A/);
  assert.match(script,/รอราคา/);
  assert.match(style,/\.nomad-ref-flow-row\.is-changing/);
});

test('live page loads referee price-flow CSS and JS immediately after Event Flow assets',()=>{
  assert.match(livePage,/referee-price-flow-341\.css\?v=20260913-5usd-ref-flow-v1/);
  assert.match(livePage,/referee-price-flow-341\.js\?v=20260913-5usd-ref-flow-v1/);
  const eventCss=livePage.indexOf('event-flow-341.css');
  const refereeCss=livePage.indexOf('referee-price-flow-341.css');
  const eventJs=livePage.indexOf('event-flow-341.js');
  const refereeJs=livePage.indexOf('referee-price-flow-341.js');
  assert.ok(eventCss>=0&&refereeCss>eventCss);
  assert.ok(eventJs>=0&&refereeJs>eventJs);
});
