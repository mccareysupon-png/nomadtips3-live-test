import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { patchIndex, validateAsset, TOKEN } from './league-flags-patch.mjs';

test('flag registry is exactly tuned',()=>{
  const info=validateAsset();
  assert.equal(info.aliases,167);
  assert.equal(info.icons,143);
});

test('flag asset is valid browser JavaScript',()=>{
  execFileSync(process.execPath,['--check','league-flags-343.asset.js'],{stdio:'pipe'});
});

test('index patch inserts exactly one script after dashboard',()=>{
  const html='<body><script src="dashboard-v2-stage3.js?v=x" defer></script><script src="x.js" defer></script></body>';
  const out=patchIndex(html);
  assert.equal((out.match(/league-flags-343\.js/g)||[]).length,1);
  assert(out.indexOf('dashboard-v2-stage3.js')<out.indexOf('league-flags-343.js'));
  assert(out.includes(TOKEN));
});

test('index patch upgrades existing script without duplication',()=>{
  const html='<body><script src="dashboard-v2-stage3.js?v=x" defer></script><script src="league-flags-343.js?v=old" defer></script></body>';
  const out=patchIndex(html);
  assert.equal((out.match(/league-flags-343\.js/g)||[]).length,1);
  assert(out.includes(TOKEN));
  assert(!out.includes('v=old'));
});

test('menu and match surfaces are all targeted',()=>{
  const source=readFileSync('league-flags-343.asset.js','utf8');
  for(const needle of ['[data-league-filter] > span','.league-block .league-head > strong','.match-card .league-scoreboard','[data-featured-league]']) assert(source.includes(needle),needle);
});
