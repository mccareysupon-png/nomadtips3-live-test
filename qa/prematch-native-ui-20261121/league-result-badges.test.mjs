import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {prematchClientScript,prematchStyles} from './prematch-client.mjs';
import {prematchMirrorClientScript,prematchMirrorStyles} from './prematch-live-score-mirror.mjs';

test('both browser scripts and generated CSS modules parse without syntax errors',()=>{
  new Script(prematchClientScript,{filename:'prematch-client.browser.js'});
  new Script(prematchMirrorClientScript,{filename:'prematch-live-score-mirror.browser.js'});
  assert(prematchStyles.includes('.b46pm-result-badge.win'));
  assert(prematchStyles.includes('.b46pm-result-badge.loss'));
  assert(prematchMirrorStyles.includes('.b46pm-live-mirror-row'));
});

test('league names are from preexisting fixture-verified source, never guessed',()=>{
  assert(prematchClientScript.includes('const verifiedLeagueName=(item,hub)=>'));
  assert(prematchClientScript.includes('leagueNameForFixture?.(item?.fixture_id)'));
  assert(prematchMirrorClientScript.includes("const leagueNameForFixture=id=>"));
  assert(prematchMirrorClientScript.includes("sourceRow(id)?.closest('.league-block')"));
  assert(prematchMirrorClientScript.includes('leagueNameForFixture,'));
  assert(prematchClientScript.includes("'League pending verification'"));
  assert(prematchClientScript.includes("'unverified:'+String(item.fixture_id)"));
  assert(!prematchMirrorClientScript.includes("item.league||'League unavailable'"));
});

test('only authoritative settled ledger WIN or LOSS gets a colored badge',()=>{
  for(const src of [prematchClientScript,prematchMirrorClientScript]){
    assert(src.includes("status==='WIN'||status==='LOSS'?status:null"));
    assert(src.includes("el('span','b46pm-result-badge '+badge.toLowerCase(),badge)"));
  }
  assert(prematchClientScript.includes('const badge=finished?settledBadge(item):null'));
  assert(prematchMirrorClientScript.includes('const badge=ended?settledBadge(item):null'));
  assert(prematchMirrorClientScript.includes("const badge=item.status!=='PENDING'?settledBadge(item):null"));
  assert(prematchMirrorClientScript.includes("clock.textContent='FT'"));
});

test('PICKS, SETTLED and PENDING calculations are unchanged and no league API is added',()=>{
  assert(prematchClientScript.includes("const picks=period==='today'?Number(dailyBook?.selected?.total??selectedToday.length):total;"));
  assert(prematchClientScript.includes("const settledCount=period==='today'?Number(settled.total??0):Math.max(0,total-pending);"));
  assert(prematchClientScript.includes("const pendingCount=period==='today'?selectedToday.filter(x=>x.status==='PENDING').length:pending;"));
  const start=prematchClientScript.indexOf('const verifiedLeagueName=');
  const end=prematchClientScript.indexOf('function premiumMatchRow(',start);
  assert(start>=0&&end>start);
  assert(!prematchClientScript.slice(start,end).includes('fetch('));
  assert(!prematchMirrorClientScript.slice(0,prematchMirrorClientScript.indexOf('const baseTemplate=')).includes('fetch('));
});
