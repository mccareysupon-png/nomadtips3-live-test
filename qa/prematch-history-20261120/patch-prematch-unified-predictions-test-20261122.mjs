// STAGE 4: Predictions = one physical match card, independent 1X2 and
// BTTS issued selections. 1X2 Native Live Mirror and stats are untouched.
export const B46_UNIFIED_ISSUED_PREDICTIONS_V1='B46_UNIFIED_ISSUED_PREDICTIONS_V1';
function replaceOnce(s,a,b,label){
 const n=s.split(a).length-1;if(n!==1)throw Error('B46_PREDICTIONS_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
}
export function groupPreMatchIssuedRows(rows){
 if(!Array.isArray(rows))throw Error('INVALID_ISSUED_ROWS');
 const groups=new Map();
 for(const item of rows){
  const id=Number(item?.fixture_id),market=item?.market;
  if(!Number.isSafeInteger(id)||id<=0||!['1X2','BTTS'].includes(market))
   throw Error('INVALID_PREDICTION_ID_OR_MARKET');
  const key=String(id);
  if(!groups.has(key))groups.set(key,[]);
  const list=groups.get(key);
  if(list.some(x=>x.market===market))throw Error('DUPLICATE_MARKET_FOR_MATCH_'+key);
  list.push(item);
 }
 return groups;
}
function prematchGroupedBrowserHelpers(){
  function prematchMarketLabel(item){
    if(item.market==='BTTS')return item.pick==='BTTS_YES'?'YES':
      item.pick==='BTTS_NO'?'NO':'UNKNOWN';
    return outcome(item.pick);
  }
  function prematchMarketStrip(items){
    const stack=el('div','b46pm-unified-market-stack');
    stack.setAttribute('aria-label','Issued Pre-Match selections by market');
    for(const item of items){
      const line=el('div','b46pm-unified-market-item');
      line.dataset.b46PmMarket=String(item.market);
      const status=String(item.status||'PENDING').toUpperCase();
      line.append(
        el('span','b46pm-unified-market-label',item.market==='BTTS'?'BTTS':'1X2'),
        el('strong','b46pm-unified-market-pick',prematchMarketLabel(item)),
        el('span','b46pm-unified-market-odds',
          calculated(item.price)&&Number(item.price)>1?'@ '+Number(item.price).toFixed(2):'Price unavailable'),
        el('span','b46pm-unified-market-state b46pm-unified-market-state-'+status.toLowerCase(),status)
      );
      stack.append(line);
    }
    return stack;
  }
  function prematchMarketTheme(){
    return [
      '/* BALL46 issued market groups; scoped, original 1X2 mirror untouched */',
      '.b46pm-unified-market-stack{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;min-width:0!important;max-width:100%!important;margin:12px!important;padding:0!important;box-sizing:border-box!important}',
      '.b46pm-unified-market-item{min-width:0!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:7px 10px!important;padding:12px 13px!important;border:1px solid rgba(120,145,135,.27)!important;background:rgba(120,145,135,.085)!important;border-radius:9px!important;box-sizing:border-box!important}',
      '.b46pm-unified-market-label{font-weight:800!important;font-size:12px!important;color:#54dd9a!important;white-space:nowrap!important}',
      '.b46pm-unified-market-pick{font-size:14px!important;line-height:1.45!important;overflow-wrap:anywhere!important;min-width:0!important}',
      '.b46pm-unified-market-odds{font-size:12px!important;white-space:nowrap!important;opacity:.84!important}',
      '.b46pm-unified-market-state{font-size:11px!important;font-weight:750!important;line-height:1.5!important;margin-left:auto!important;white-space:nowrap!important}',
      '.b46pm-unified-market-state-win{color:#55d898!important}.b46pm-unified-market-state-loss{color:#e67f87!important}',
      '.b46pm-unified-btts-only .b46pm-premium-summary{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:12px!important;padding:14px!important;align-items:center!important;min-width:0!important;max-width:100%!important;box-sizing:border-box!important}',
      '.b46pm-unified-btts-only .b46pm-premium-meta,.b46pm-unified-btts-only .b46pm-premium-teams,.b46pm-unified-btts-only .b46pm-premium-quick{grid-column:1/-1!important;min-width:0!important}',
      '.b46pm-unified-btts-only .b46pm-premium-teams{display:flex!important;justify-content:space-between!important;align-items:center!important;gap:12px!important}',
      '.b46pm-unified-btts-only .b46pm-premium-teams>*{min-width:0!important;overflow-wrap:anywhere!important}',
      '.b46pm-unified-btts-only .b46pm-premium-quick{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}',
      '.b46pm-unified-btts-only .b46pm-premium-quick-metric{min-width:0!important;max-width:none!important;padding:10px 12px!important;box-sizing:border-box!important}',
      '.b46pm-unified-btts-only .b46pm-premium-quick-metric small,.b46pm-unified-btts-only .b46pm-premium-quick-metric strong{white-space:normal!important;overflow-wrap:anywhere!important;min-width:0!important}',
      '@media(max-width:650px){.b46pm-unified-market-stack{grid-template-columns:minmax(0,1fr)!important;gap:8px!important;margin:8px!important}.b46pm-unified-btts-only .b46pm-premium-summary{padding:12px!important;gap:9px!important}.b46pm-unified-btts-only .b46pm-premium-quick{gap:8px!important}}'
    ].join('\n');
  }
}
export function patchPreMatchUnifiedPredictions(existingClient){
 if(typeof existingClient!=='string'||
   !existingClient.includes("if(item.market==='BTTS'){list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue}")||
   !existingClient.includes('b46pm-live-mirror-list')||
   !existingClient.includes('function premiumMatchRow(item,hub,stale){')||
   !existingClient.includes('function draw(pageOnly=false){'))
   throw Error('NOT_EXISTING_PREMATCH_LIVE_MIRROR_PREDICTIONS_CLIENT');
 let s=existingClient;
 const browser=prematchGroupedBrowserHelpers.toString();
 const helpers=browser.slice(browser.indexOf('{')+1,browser.lastIndexOf('}'));
 s=replaceOnce(s,'  function draw(pageOnly=false){',
   groupPreMatchIssuedRows.toString()+'\n'+helpers+'\n  function draw(pageOnly=false){',
   'GROUPED_ISSUED_SELECTION_HELPERS');
 s=replaceOnce(s,
   "pick.append(el('span','b46pm-premium-tiny','PREDICTION'));",
   "pick.append(el('span','b46pm-premium-tiny',item.market==='BTTS'?'BTTS · PREDICTION':'PREDICTION'));",
   'ISSUED_BTTS_MARKET_LABEL');
 s=replaceOnce(s,
   "pick.append(el('strong','',outcome(item.pick)));",
   "pick.append(el('strong','',item.market==='BTTS'?prematchMarketLabel(item):outcome(item.pick)));",
   'ISSUED_BTTS_YES_NO_VALUE');
 s=replaceOnce(s,
   '    const pageLeagueCounts=new Map();',
   '    const pageLeagueCounts=new Map(),uniqueLeagueFixtures=new Map();',
   'LEAGUE_COUNT_UNIQUE_MATCH_SETUP');
 s=replaceOnce(s,
   '      pageLeagueCounts.set(name,(pageLeagueCounts.get(name)||0)+1);',
   "      if(mode==='predictions'){\n"+
   "        if(!uniqueLeagueFixtures.has(name))uniqueLeagueFixtures.set(name,new Set());\n"+
   "        uniqueLeagueFixtures.get(name).add(String(item.fixture_id));\n"+
   "        pageLeagueCounts.set(name,uniqueLeagueFixtures.get(name).size);\n"+
   "      }else pageLeagueCounts.set(name,(pageLeagueCounts.get(name)||0)+1);",
   'LEAGUE_LABEL_COUNT_MATCHES_NOT_MARKET_RECORDS');
 s=replaceOnce(s,
   '    const displayedLeagues=new Set();let lastPredictionsLeague=null;',
   "    const displayedLeagues=new Set();let lastPredictionsLeague=null;\n"+
   "    const issuedByFixture=mode==='predictions'?groupPreMatchIssuedRows(pageRows):new Map();\n"+
   "    if(mode==='predictions'){\n"+
   "      const theme=el('style','');theme.id='b46pm-unified-market-styles';\n"+
   "      theme.textContent=prematchMarketTheme();list.append(theme);\n"+
   "    }",
   'BUILD_GROUPS_INSIDE_PREDICTIONS_ONLY');
 s=replaceOnce(s,
   "if(item.market==='BTTS'){list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue}",
   "if(item.market==='BTTS'){\n"+
   "          const picks=issuedByFixture.get(String(item.fixture_id))??[];\n"+
   "          if(picks.some(x=>x.market==='1X2'))continue;\n"+
   "          const standalone=premiumMatchRow(item,hub,!!monitor?.snapshotStale);\n"+
   "          standalone.classList.add('b46pm-unified-btts-only');\n"+
   "          standalone.dataset.b46PmUnifiedFixture=String(item.fixture_id);\n"+
   "          list.append(standalone);continue;\n"+
   "        }",
   'BTTS_ALONE_OR_SKIP_DUPLICATE');
 s=replaceOnce(s,
   '          list.append(window.B46PreMatchLiveMirror.render({...item,league:verifiedLeagueName(item,hub)},hub,!!monitor?.snapshotStale));',
   "          const nativeCard=window.B46PreMatchLiveMirror.render({...item,league:verifiedLeagueName(item,hub)},hub,!!monitor?.snapshotStale);\n"+
   "          const siblingPicks=issuedByFixture.get(String(item.fixture_id))??[];\n"+
   "          if(siblingPicks.length>1){\n"+
   "            nativeCard.append(prematchMarketStrip(siblingPicks));\n"+
   "            nativeCard.dataset.b46PmCombinedMarkets='1X2,BTTS';\n"+
   "          }\n"+
   "          nativeCard.dataset.b46PmUnifiedFixture=String(item.fixture_id);\n"+
   "          list.append(nativeCard);",
   'KEEP_NATIVE_1X2_LIVE_MIRROR_WITH_BTTS_MARKET_STACK');
 s=replaceOnce(s,
   '        list.append(premiumMatchRow(item,hub,!!monitor?.snapshotStale));continue;',
   "        const premiumCard=premiumMatchRow(item,hub,!!monitor?.snapshotStale);\n"+
   "        const siblingPicks=issuedByFixture.get(String(item.fixture_id))??[];\n"+
   "        if(siblingPicks.length>1){\n"+
   "          premiumCard.append(prematchMarketStrip(siblingPicks));\n"+
   "          premiumCard.dataset.b46PmCombinedMarkets='1X2,BTTS';\n"+
   "        }\n"+
   "        premiumCard.dataset.b46PmUnifiedFixture=String(item.fixture_id);\n"+
   "        list.append(premiumCard);continue;",
   'MATCH_GROUPS_IN_NON_MIRROR_FALLBACK');
 if(!s.includes("dataset.b46PmCombinedMarkets='1X2,BTTS'")||
   !s.includes('b46pm-unified-market-stack'))
   throw Error('BTTS_AND_1X2_COMBINED_CARD_PATCH_MISSING');
 return {code:s,scope:'EXISTING_PREMATCH_PREDICTIONS_TEST_ONLY',
  native1X2MirrorPreserved:true,statisticsUnchanged:true,
  BTTSShadowCandidatesUnchanged:true,modelAndLedgerUnchanged:true};
}
