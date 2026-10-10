import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const start=js.indexOf('function freshSignalRemainingSeconds(');
const end=js.indexOf('function newestSignalId(',start);
assert.ok(start>=0&&end>start,'Expected exact Engine-timestamp countdown helper');
const remaining=new Function('const NEW_SIGNAL_WINDOW_MS=60000;'+js.slice(start,end)+'return freshSignalRemainingSeconds;')();

test('New Signal runs precisely 60 seconds from creation, never refresh time',()=>{
  const t=Date.UTC(2026,9,10,3,45);
  assert.equal(remaining(t,t),60);
  assert.equal(remaining(t,t+1000),59);
  assert.equal(remaining(t,t+15000),45);
  assert.equal(remaining(t,t+59000),1);
  assert.equal(remaining(t,t+60000),0);
  assert.equal(remaining(t,t+120000),0);
  assert.equal(remaining(t-70000,t),0);
  assert.equal(remaining(null,t),0);
});
test('Only newest signal is highlighted, timer updates without rerender',()=>{
  assert.match(js,/String\(row\.id\)===newestSignalId\(\)/);
  assert.match(js,/if\(isLatest\)time\.append\(makeFreshSignalTag\(row\)\)/);
  assert.match(js,/LATEST SIGNAL/);
  assert.match(js,/state\.market==='ALL'\|\|row\.market===state\.market/);
  assert.match(js,/tr\.classList\.add\('is-fresh-signal'\)/);
  assert.match(js,/setInterval\(refreshFreshSignalClock,1000\)/);
  assert.match(js,/tr\.classList\.remove\('is-fresh-signal'\)/);
});
test('Price notice explicitly disclaims quote availability and alerts do not guarantee prices',()=>{
  assert.match(html,/PRICE NOTICE/);
  assert.match(html,/The displayed odds are not guaranteed/);
  assert.match(html,/The 60-second NEW SIGNAL countdown is an alert only/);
  assert.doesNotMatch(html,/[\u0E00-\u0E7F]/);
});
test('Border pulse stops with class removal and respects reduced-motion preference',()=>{
  assert.match(css,/\.signal-row\.is-fresh-signal/);
  assert.match(css,/@keyframes member-fresh-border/);
  assert.match(css,/@keyframes member-fresh-cell-border/);
  assert.match(css,/\.signal-row\.is-fresh-signal td/);
  assert.match(html,/member-alert2/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});
