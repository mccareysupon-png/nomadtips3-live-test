import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const scriptUrl=new URL('../../nomad-live/event-flow-341.js',import.meta.url);
const styleUrl=new URL('../../nomad-live/event-flow-341.css',import.meta.url);
const livePageUrl=new URL('../../nomad-live/index.html',import.meta.url);
const runtimeUrl=new URL('../../nomad-live/runtime.js',import.meta.url);

const script=readFileSync(scriptUrl,'utf8');
const style=readFileSync(styleUrl,'utf8');
const livePage=readFileSync(livePageUrl,'utf8');
const runtime=readFileSync(runtimeUrl,'utf8');

test('3.41 Event Flow renderer remains syntax-valid and isolated from detector runtime',()=>{
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(runtime,/fiveusd-event-flow|NOMAD_EVENT_FLOW_341|event-flow-341/);
});

test('Event Flow reads only the 3.41 storage endpoint and never calls 5USD directly',()=>{
  assert.match(script,/\/fiveusd-event-flow\?fixtureId=/);
  assert.match(script,/window\.NOMAD_RUNTIME\?\.fiveUsdBase\|\|window\.NOMAD_RUNTIME\?\.engineBase/);
  assert.doesNotMatch(script,/api\.5dollarfootballapi\.com/i);
  assert.match(script,/storage เท่านั้น ไม่เพิ่ม 5USD request/);
});

test('Event Flow chart contract is one-row 0-100 vertical scale with 0-minute origin',()=>{
  assert.match(script,/\[0,25,50,75,100\]/);
  assert.match(script,/for\(let minute=0;minute<=xMax;minute\+=15\)/);
  assert.match(script,/yMin|0–100%|0-100/i);
  assert.match(script,/independent|วัดอิสระ/i);
  assert.match(style,/\.nomad-event-flow-card/);
  assert.match(style,/\.nomad-flow-svg\{[^}]*height:/s);
});

test('Event Flow mounts only inside expanded match cards and refreshes from storage every 3 seconds',()=>{
  assert.match(script,/if\(!row\?\.open\) return;/);
  assert.match(script,/const REFRESH_MS=3_000;/);
  assert.match(script,/detail\.prepend\(card\)/);
  assert.match(script,/attributeFilter:\['open'\]/);
});

test('3.41 live page loads Event Flow CSS and JS without changing core runtime asset',()=>{
  assert.match(livePage,/event-flow-341\.css\?v=20260913-5usd-flow-v1/);
  assert.match(livePage,/event-flow-341\.js\?v=20260913-5usd-flow-v1/);
  const flowScript=livePage.indexOf('event-flow-341.js');
  const runtimeScript=livePage.indexOf('runtime.js');
  assert.ok(flowScript>=0);
  assert.ok(runtimeScript>flowScript);
});
