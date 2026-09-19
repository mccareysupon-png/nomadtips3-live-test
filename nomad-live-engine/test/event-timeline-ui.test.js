import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const timelineUrl=new URL('../../nomad-live/event-timeline.js',import.meta.url);
const livePageUrl=new URL('../../nomad-live/index.html',import.meta.url);

const timelineSource=readFileSync(timelineUrl,'utf8');
const livePageSource=readFileSync(livePageUrl,'utf8');

test('event timeline JavaScript remains syntax-valid',()=>{
  assert.doesNotThrow(()=>new Function(timelineSource));
});

test('event timeline stays presentation-only and does not add a source URL',()=>{
  assert.match(timelineSource,/const WINDOW_MINUTES = 10;/);
  assert.match(timelineSource,/const nativeFetch = window\.fetch\.bind\(window\);/);
  assert.doesNotMatch(timelineSource,/https?:\/\//i);
  assert.doesNotMatch(timelineSource,/setInterval\s*\(/);
});

test('event timeline consumes raw 5USD events from feed and retains stats fallback',()=>{
  assert.match(timelineSource,/Array\.isArray\(match\?\.events\)/);
  assert.match(timelineSource,/yellow_card/);
  assert.match(timelineSource,/red_card/);
  assert.match(timelineSource,/missed_penalty/);
  assert.match(timelineSource,/substitution/);
  assert.match(timelineSource,/snapshotEvents\(match/);
  assert.match(timelineSource,/goalEvents\(match, store\)/);
});

test('live page loads event timeline after match flow',()=>{
  const flowIndex=livePageSource.indexOf('match-flow.js');
  const timelineIndex=livePageSource.indexOf('event-timeline.js');
  assert.ok(flowIndex>=0);
  assert.ok(timelineIndex>flowIndex);
  assert.match(livePageSource,/event-timeline\.css/);
});