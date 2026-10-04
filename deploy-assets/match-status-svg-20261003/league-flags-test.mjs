import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchIndex, validateAsset, TOKEN } from './league-flags-patch.mjs';

test('flag registry is exactly tuned',()=>{
  const info=validateAsset();
  assert.equal(info.aliases,167);
  assert.equal(info.icons,143);
  assert.equal(info.declaredIcons,143);
  assert(info.declared.includes('sn'));
});

test('flag asset is valid browser JavaScript',()=>{
  execFileSync(process.execPath,['--check','league-flags-343.asset.js'],{stdio:'pipe'});
});

test('country-prefixed league names resolve without league.country',()=>{
  const source=readFileSync('league-flags-343.asset.js','utf8');
  const context={
    console,
    window:{},
    document:{readyState:'complete',getElementById:()=>({}),querySelectorAll:()=>[],body:{querySelectorAll:()=>[]}},
    MutationObserver:class{observe(){}},
    requestAnimationFrame:fn=>fn()
  };
  vm.createContext(context);
  vm.runInContext(source,context);
  const api=context.window.NOMAD_LEAGUE_FLAGS_343;
  assert(api);
  assert.equal(api.iconCount,143);
  assert.equal(api.aliasCount,167);
  const cases={
    'Brazil Serie A':'br',
    'Spain Segunda Division RFEF Group 4':'es',
    'Northern Ireland Championship':'gb-nir',
    'Dominican Republic Liga':'do',
    'El Salvador Apertura':'sv',
    'New Zealand Football Championship':'nz',
    'USA USL Championship':'us',
    'Senegal Premier League':'sn',
    'UEFA Nations League A':'WORLD',
    'CONCACAF Nations League':'WORLD',
    'Gulf Cup':'WORLD',
    'U20 Africa Cup of Nations Qual':'WORLD',
    'International Match':'WORLD'
  };
  for(const [label,code] of Object.entries(cases)) assert.equal(api.codeForLeagueLabel(label),code,label);
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
