import test from 'node:test';
import assert from 'node:assert/strict';
import {groupPreMatchIssuedRows,patchPreMatchUnifiedPredictions} from './patch-prematch-unified-predictions-test-20261122.mjs';
const one=(fixture_id,pick='HOME_WIN')=>({fixture_id,market:'1X2',pick,status:'PENDING',price:1.83,kickoff:10000});
const btts=(fixture_id,pick='BTTS_YES')=>({fixture_id,market:'BTTS',pick,status:'PENDING',price:1.91,kickoff:10000});
test('one fixture can carry two distinct issued markets but counts as one physical card',()=>{
 const rows=[one(100),btts(100),one(102),btts(103)];
 const groups=groupPreMatchIssuedRows(rows);
 assert.equal(groups.size,3);
 assert.equal(groups.get('100').length,2);
 assert.deepEqual(groups.get('100').map(x=>x.market),['1X2','BTTS']);
 assert.equal(groups.get('102').length,1);
 assert.equal(groups.get('103')[0].pick,'BTTS_YES');
 assert.equal(rows.length,4,'ledger entries are independently counted');
});
test('same fixture same market duplicate MUST be rejected',()=>{
 assert.throws(()=>groupPreMatchIssuedRows([one(111),one(111)]),/DUPLICATE_MARKET/);
 assert.throws(()=>groupPreMatchIssuedRows([btts(111),btts(111)]),/DUPLICATE_MARKET/);
 assert.throws(()=>groupPreMatchIssuedRows([{...one(1),market:'AH'}]),/INVALID_PREDICTION/);
 assert.throws(()=>groupPreMatchIssuedRows([one(0)]),/INVALID_PREDICTION/);
});
test('UI refuses unknown global source, and does not modify the original 1X2 native mirror function',()=>{
 assert.throws(()=>patchPreMatchUnifiedPredictions('const market=1'),/NOT_EXISTING_PREMATCH/);
 const source=[
  "function premiumMatchRow(item,hub,stale){",
  "pick.append(el('span','b46pm-premium-tiny','PREDICTION'));",
  "pick.append(el('strong','',outcome(item.pick)));",
  "}",
  '  function draw(pageOnly=false){',
  '  const list=el("section","b46pm-live-mirror-list");',
  '    const pageLeagueCounts=new Map();',
  '    for(const item of pageRows){',
  '      const name=leagueGroupingKey(item,hubRows[item.fixture_id]??null);',
  '      pageLeagueCounts.set(name,(pageLeagueCounts.get(name)||0)+1);',
  '    }',
  '    const displayedLeagues=new Set();let lastPredictionsLeague=null;',
  '    for(const item of pageRows){',
  '      const hub=hubRows[item.fixture_id]??null;',
  "      if(mode==='predictions'){",
  "        if(item.market==='BTTS'){list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue}",
  '        if(mirrorOn){',
  '          const groupKey=leagueGroupingKey(item,hub);',
  '          if(groupKey!==lastPredictionsLeague){lastPredictionsLeague=groupKey;',
  '            displayedLeagues.add(groupKey);',
  '            list.append(window.B46PreMatchLiveMirror.leagueHeader({...item,league:verifiedLeagueName(item,hub)},pageLeagueCounts.get(groupKey)||0));',
  '          }',
  '          list.append(window.B46PreMatchLiveMirror.render({...item,league:verifiedLeagueName(item,hub)},hub,!!monitor?.snapshotStale));',
  '          continue;',
  '        }',
  '        list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue;',
  '      }',
  '    }',
  '}'
 ].join('\n');
 const r=patchPreMatchUnifiedPredictions(source);
 assert(r.code.includes('b46pm-unified-market-stack'));
 assert(r.code.includes("nativeCard.dataset.b46PmCombinedMarkets='1X2,BTTS'"));
 assert(r.code.includes('window.B46PreMatchLiveMirror.render('));
 assert(r.code.includes('uniqueLeagueFixtures.get(name).size'));
 assert(r.code.includes('b46pm-unified-btts-only'));
 assert(r.native1X2MirrorPreserved);
 assert(r.modelAndLedgerUnchanged);
});
