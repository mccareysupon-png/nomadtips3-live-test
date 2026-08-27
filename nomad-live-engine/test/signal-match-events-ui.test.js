import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const moduleUrl=new URL('../../nomad-live/signal-match-events.js',import.meta.url);
const cssUrl=new URL('../../nomad-live/signal-match-events.css',import.meta.url);
const livePageUrl=new URL('../../nomad-live/index.html',import.meta.url);

const moduleSource=readFileSync(moduleUrl,'utf8');
const cssSource=readFileSync(cssUrl,'utf8');
const livePageSource=readFileSync(livePageUrl,'utf8');

test('signal match events module remains syntax-valid',()=>{
  assert.doesNotThrow(()=>new Function(moduleSource));
});

test('signal match events stays presentation-only and adds no source request',()=>{
  assert.match(moduleSource,/nomad341EventTimelineV1/);
  assert.match(moduleSource,/MATCH EVENTS · SINCE LOCK/);
  assert.doesNotMatch(moduleSource,/\bfetch\s*\(/);
  assert.doesNotMatch(moduleSource,/https?:\/\//i);
  assert.doesNotMatch(moduleSource,/setInterval\s*\(/);
});

test('signal match events uses explicit responsive grid placement instead of absolute positioning',()=>{
  assert.match(cssSource,/grid-column:2/);
  assert.match(cssSource,/grid-row:1/);
  assert.doesNotMatch(cssSource,/position\s*:\s*absolute/i);
});

test('live page loads signal match events after the existing event timeline',()=>{
  const timelineIndex=livePageSource.indexOf('event-timeline.js');
  const signalEventsIndex=livePageSource.indexOf('signal-match-events.js');
  assert.ok(timelineIndex>=0);
  assert.ok(signalEventsIndex>timelineIndex);
  assert.match(livePageSource,/signal-match-events\.css/);
});
