// BALL46 TEST ONLY — global timeline, one fixture/one card.
// Preserve original market data, odds, settlement, source and production.
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;
 if(n!==1)throw Error('B46_CHRONO_SOURCE_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
const block=lines=>lines.join('\n');
export const B46_CHRONO_VERSION='B46_PM_GLOBAL_CHRONO_LIVE_FIRST_V1';
export function patchPredictionsChronologyClient(input){
 if(typeof input!=='string'||
    !input.includes("const mirrorOn=mode==='predictions'&&!!window.B46PreMatchLiveMirror")||
    !input.includes("function groupPreMatchIssuedRows(rows){")||
    !input.includes("const activeLedger=mode==='ou'?")||
    !input.includes("mode==='all'?'Pre-Match · Total (1X2)'"))
  throw Error('NOT_CURRENT_B46_TEST_PREDICTIONS_CLIENT');
 let s=input;
 const oldSort=block([
 "    const visible=[...rows].sort((a,b)=>{",
 "      if(mode==='predictions')return Number(a.kickoff)-Number(b.kickoff)||",
 "        Number(a.fixture_id)-Number(b.fixture_id)||String(a.market??'1X2').localeCompare(String(b.market??'1X2'));",
 "      const priority=x=>x.status==='PENDING'?(hubRows[x.fixture_id]?.phase==='LIVE'?0:1):2;",
 "      return priority(a)-priority(b)||Number(a.kickoff)-Number(b.kickoff)",
 "    });"
 ]);
 const newSort=block([
 "    // Group 1X2/BTTS/O/U by fixture first: all markets share one position.",
 "    const chronoNow=Math.floor(Date.now()/1000);",
 "    const chronoGroups=mode==='predictions'?groupPreMatchIssuedRows(rows):null;",
 "    const representative=item=>{",
 "      const selections=chronoGroups?.get(String(item.fixture_id))??[];",
 "      return selections.find(x=>x.market==='1X2')??selections[0]??item;",
 "    };",
 "    const actualKickoff=item=>{",
 "      const hub=hubRows[item.fixture_id]??null;",
 "      const revised=Number(hub?.scheduledKickoff),locked=Number(item.kickoff);",
 "      if(Number.isSafeInteger(revised)&&revised>946684800&&revised<4102444800)return revised;",
 "      if(Number.isSafeInteger(locked)&&locked>946684800&&locked<4102444800)return locked;",
 "      return null;",
 "    };",
 "    const chronoPhase=item=>{",
 "      const row=representative(item),hub=hubRows[row.fixture_id]??null;",
 "      if(String(row.status??'PENDING').toUpperCase()!=='PENDING'||hub?.phase==='FINISHED')return 3;",
 "      if(hub?.phase==='LIVE'&&!monitor?.snapshotStale)return 0;",
 "      const kickoff=actualKickoff(row);",
 "      const exceptional=exceptionalStatus.has(hub?.phase)||['NOT_IN_HUB','IDENTITY_MISMATCH'].includes(hub?.phase);",
 "      if(kickoff!==null&&kickoff>=chronoNow-300&&!exceptional)return 1;",
 "      return 2;",
 "    };",
 "    const marketRank=m=>m==='1X2'?0:m==='BTTS'?1:m==='O/U'?2:3;",
 "    const visible=[...rows].sort((a,b)=>{",
 "      if(mode==='predictions'){",
 "        const ra=representative(a),rb=representative(b);",
 "        const pa=chronoPhase(ra),pb=chronoPhase(rb);",
 "        if(pa!==pb)return pa-pb;",
 "        const ta=actualKickoff(ra),tb=actualKickoff(rb);",
 "        if(ta!==tb){",
 "          if(ta===null)return 1;",
 "          if(tb===null)return -1;",
 "          return pa===1?(ta<tb?-1:1):(ta>tb?-1:1);",
 "        }",
 "        return Number(a.fixture_id)-Number(b.fixture_id)||marketRank(a.market)-marketRank(b.market);",
 "      }",
 "      const priority=x=>x.status==='PENDING'?(hubRows[x.fixture_id]?.phase==='LIVE'?0:1):2;",
 "      return priority(a)-priority(b)||Number(a.kickoff)-Number(b.kickoff)",
 "    });"
 ]);
 s=once(s,oldSort,newSort,'LIVE_FIRST_TIME_SORT');
 s=once(s,block([
 "    // TEST-only league clustering preserves each league's original match priority.",
 "    const leagueGroups=new Map();",
 "    if(mirrorOn)for(const item of visible){",
 "      const groupKey=leagueGroupingKey(item,hubRows[item.fixture_id]??null);",
 "      if(!leagueGroups.has(groupKey))leagueGroups.set(groupKey,[]);",
 "      leagueGroups.get(groupKey).push(item);",
 "    }",
 "    const displayRows=visible; // Never regroup out of chronological order."
 ]),block([
 "    // No league clustering: league order must never override kickoff order.",
 "    const displayRows=visible;"
 ]),'REMOVE_LEAGUE_CLUSTER');
 s=once(s,block([
 "    const pageLeagueCounts=new Map(),uniqueLeagueFixtures=new Map();",
 "    for(const item of pageRows){",
 "      const name=leagueGroupingKey(item,hubRows[item.fixture_id]??null);",
 "      if(mode==='predictions'){",
 "        if(!uniqueLeagueFixtures.has(name))uniqueLeagueFixtures.set(name,new Set());",
 "        uniqueLeagueFixtures.get(name).add(String(item.fixture_id));",
 "        pageLeagueCounts.set(name,uniqueLeagueFixtures.get(name).size);",
 "      }else pageLeagueCounts.set(name,(pageLeagueCounts.get(name)||0)+1);",
 "    }",
 "    const displayedLeagues=new Set();let lastPredictionsLeague=null;",
 "    const issuedByFixture=mode==='predictions'?groupPreMatchIssuedRows(pageRows):new Map();"
 ]),block([
 "    const issuedByFixture=mode==='predictions'?chronoGroups:new Map();",
 "    const sectionNames=['LIVE NOW','UPCOMING','AWAITING UPDATE','FINISHED'];",
 "    const sectionCounts=new Map();",
 "    if(mode==='predictions')for(const group of issuedByFixture.values()){",
 "      const bucket=chronoPhase(group.find(x=>x.market==='1X2')??group[0]);",
 "      sectionCounts.set(bucket,(sectionCounts.get(bucket)||0)+1);",
 "    }",
 "    let lastSection=-1;"
 ]),'SECTIONS_INSTEAD_OF_LEAGUE_GROUP_COUNTS');
 s=once(s,
 "      theme.textContent=prematchMarketTheme();list.append(theme);",
 block([
 "      theme.textContent=prematchMarketTheme()+[",
 "        '.b46pm-chrono-section-compact{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;margin:12px 0 5px;border-top:1px solid rgba(130,150,140,.24);font-size:12px;font-weight:750;letter-spacing:.04em}',",
 "        '.b46pm-chrono-section-compact span{font-weight:600;letter-spacing:normal;opacity:.72}',",
 "        '.b46pm-chrono-section-header .b46pm-league-name{font-weight:800;letter-spacing:.04em}',",
 "        '.b46pm-chrono-inline-league{font-size:10px;line-height:1.35;font-weight:650;letter-spacing:.02em;color:inherit;opacity:.68;padding:6px 12px 2px;overflow-wrap:anywhere}',",
 "        '@media(max-width:760px){.b46pm-chrono-inline-league{display:none!important}}'",
 "      ].join('\\n');list.append(theme);"
 ]),'SECTION_STYLING');
 s=once(s,block([
 "      if(mode==='predictions'){",
 "        if(item.market==='BTTS'||item.market==='O/U'){"
 ]),block([
 "      if(mode==='predictions'){",
 "        // Do not emit a status header for rows hidden by the unified-card rule.",
 "        const picks=issuedByFixture.get(String(item.fixture_id))??[];",
 "        if(item.market!=='1X2'&&(picks.some(x=>x.market==='1X2')||picks[0]!==item))continue;",
 "        const stage=chronoPhase(item);",
 "        if(stage!==lastSection){",
 "          lastSection=stage;",
 "          const label=sectionNames[stage],count=sectionCounts.get(stage)||0;",
 "          if(mirrorOn){",
 "            const header=window.B46PreMatchLiveMirror.leagueHeader({...item,league:label},count);",
 "            header.classList.add('b46pm-chrono-section-header');",
 "            header.setAttribute('aria-label',label+' · '+count+' matches');",
 "            list.append(header);",
 "          }else{",
 "            const header=el('div','b46pm-chrono-section-compact');",
 "            header.append(el('strong','',label),el('span','',count+' matches'));",
 "            list.append(header);",
 "          }",
 "        }",
 "        if(item.market==='BTTS'||item.market==='O/U'){"
 ]),'CHRONO_SECTION_HEADER');
 s=once(s,block([
 "        if(mirrorOn){",
 "          const groupKey=leagueGroupingKey(item,hub);",
 "          if(groupKey!==lastPredictionsLeague){lastPredictionsLeague=groupKey;",
 "            displayedLeagues.add(groupKey);",
 "            list.append(window.B46PreMatchLiveMirror.leagueHeader({...item,league:verifiedLeagueName(item,hub)},pageLeagueCounts.get(groupKey)||0));",
 "          }",
 "          const nativeCard=window.B46PreMatchLiveMirror.render({...item,league:verifiedLeagueName(item,hub)},hub,!!monitor?.snapshotStale);"
 ]),block([
 "        if(mirrorOn){",
 "          // On PC, retain source-verified league identity as a compact card caption.",
 "          const league=verifiedLeagueName(item,hub);",
 "          list.append(el('div','b46pm-chrono-inline-league',league));",
 "          const nativeCard=window.B46PreMatchLiveMirror.render({...item,league},hub,!!monitor?.snapshotStale);"
 ]),'INLINE_LEAGUE_CAPTION');
 for(const needle of [
  'const chronoGroups=mode===','const chronoPhase=item=>',
  "if(hub?.phase==='LIVE'&&!monitor?.snapshotStale)return 0",
  "const sectionNames=['LIVE NOW','UPCOMING','AWAITING UPDATE','FINISHED']",
  "list.append(el('div','b46pm-chrono-inline-league',league))",
  "marketRank(a.market)-marketRank(b.market)"
 ])if(!s.includes(needle))throw Error('CHRONO_INVARIANT_MISSING_'+needle);
 if(s.includes('lastPredictionsLeague')||s.includes('pageLeagueCounts')||
    s.includes("if(mode==='predictions')return Number(a.kickoff)-Number(b.kickoff)"))
   throw Error('OLD_PREDICTIONS_LEAGUE_SORT_REMAINS');
 return {code:s,scope:'TEST_PREDICTIONS_ONLY',
  chronology:['LIVE_NEWEST','UPCOMING_NEAREST','AWAITING_UPDATE','FINISHED_NEWEST'],
  league:'INLINE_CAPTION',oneCardPerFixture:true,apiCallsAdded:0,
  otherMarketsAndStatsUnchanged:true,productionChanged:false};
}
