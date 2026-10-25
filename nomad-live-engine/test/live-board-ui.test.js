import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=async path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

test('3.41 live board renders the complete feed without a six-card/UI slice cap',async()=>{
  const runtime=await read('nomad-live/runtime.js');
  assert.match(runtime,/\(d\.matches\|\|\[\]\)\.map\(matchRow\)\.join\(''\)/);
  assert.doesNotMatch(runtime,/d\.matches[^\n]{0,120}\.slice\s*\(/);
});

test('3.41 match list has no internal scrollbar, six-card cap or SHOW MORE control',async()=>{
  const [js,css]=await Promise.all([
    read('nomad-live/match-list-overflow.js'),
    read('nomad-live/match-list-overflow.css'),
  ]);
  assert.doesNotMatch(js,/\bLIMIT\s*=\s*6\b/);
  assert.doesNotMatch(js,/SHOW\s+\$?\{?\w*\}?\s*MORE/i);
  assert.match(css,/max-height\s*:\s*none\s*!important/i);
  assert.match(css,/overflow\s*:\s*visible\s*!important/i);
  assert.match(css,/match-list-overflow-controls[\s\S]*display\s*:\s*none\s*!important/i);
});

test('5USD public live feed is fail-closed to LIVE rows only',async()=>{
  const source=await read('nomad-live-engine/src/fivedollar-public-feed.js');
  assert.match(source,/fixture\.boardState!=='live'/);
  assert.match(source,/liveOnly:true/);
  assert.match(source,/waiting:0/);
  assert.doesNotMatch(source,/matches\.push\(waitingMatch/);
});
