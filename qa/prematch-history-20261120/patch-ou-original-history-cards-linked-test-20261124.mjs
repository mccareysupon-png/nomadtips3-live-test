// TEST ONLY: attach existing public O/U Prediction History cards to original
// OU Ledger + Adaptive Research snapshots. Preserve separate analysis table.
// No backend changes, 1U remains one formula observation.
export const B46_OU_ORIGINAL_PUBLIC_HISTORY_V1='B46_OU_ORIGINAL_PUBLIC_HISTORY_V1';
function once(src,from,to,label){
 const count=src.split(from).length-1;
 if(count!==1)throw Error('B46_ORIGINAL_HISTORY_SOURCE_DRIFT_'+label+'_'+count);
 return src.replace(from,to);
}
const adapter=`
  // B46_OU_ORIGINAL_PUBLIC_HISTORY_V1:
  // Portable frontend adapter; source remains independent of presentation.
  function b46NativeOuHistoryRows(original,adaptive){
    const prior=Array.isArray(original)?original:[];
    if(!adaptive||adaptive.code!=='B46_ADAPTIVE_OU_RESEARCH_V1'||
       !Array.isArray(adaptive.records))return null; // no temporary 5-card flash
    const generated=adaptive.records.map(p=>{
      const selection=String(p.selection||'').toUpperCase();
      const line=Number(p.line);
      if(!['OVER','UNDER'].includes(selection)||!Number.isFinite(line))
        return null;
      const price=Number(p.odds);
      const settled=String(p.status||'PENDING').toUpperCase();
      const homeCount=Array.isArray(p.history_evidence)?
        p.history_evidence.filter(e=>e.team==='HOME').reduce((sum,e)=>sum+(Number(e.historyUsed)||0),0):0;
      const awayCount=Array.isArray(p.history_evidence)?
        p.history_evidence.filter(e=>e.team==='AWAY').reduce((sum,e)=>sum+(Number(e.historyUsed)||0),0):0;
      return {
        fixture_id:p.fixture_id,
        home:p.home,away:p.away,
        kickoff:Number(p.kickoff),picked_at:Number(p.picked_at),
        market:'O/U',pick:selection+'_'+line,
        price:Number.isFinite(price)?price:null,
        bookmaker:p.bookmaker,
        status:settled,hg:p.hg,ag:p.ag,
        units:p.net_units==null?null:Number(p.net_units),
        formula_id:String(p.formula_id||'—'),
        history_used:Number(p.history_used)||0,
        home_count:homeCount,away_count:awayCount,
        probability:null,edge:null,ev:null,
        source:'ADAPTIVE_RESEARCH_TEST_ONLY'
      };
    }).filter(Boolean);
    return [...prior,...generated];
  }
`;
export function patchOuOldCardsClient(client){
 if(typeof client!=='string'||!client.includes('B46_OU_SIDEBAR_HISTORY_V1')||
  !client.includes('B46_OU_ALL_ACCOUNTS_OVERVIEW_V1')||
  !client.includes('  function draw(pageOnly=false){'))throw Error('EXPECTED_TEST_PREMATCH_CLIENT_NOT_FOUND');
 if(client.includes(B46_OU_ORIGINAL_PUBLIC_HISTORY_V1))throw Error('ORIGINAL_HISTORY_ALREADY_PRESENT');
 let s=once(client,
 "  let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1",
 adapter+"  let b46PrematchLastScrollRoute=null; // B46_PREMATCH_NAV_SCROLL_V1",
 'ADAPTER_BEFORE_DRAW');
 s=once(s,
 "    const visible=[...rows].sort((a,b)=>{",
 `    const b46OuNativeRows=mode==='ou'?b46NativeOuHistoryRows(rows,b46AdaptiveData):null;
    const visible=(mode==='ou'?(b46OuNativeRows??[]):[...rows]).sort((a,b)=>{`,
 'MERGE_ADAPTIVE_WITH_EXISTING_CARDS');
 s=once(s,
 "      const priority=x=>x.status==='PENDING'?(hubRows[x.fixture_id]?.phase==='LIVE'?0:1):2;",
 `      if(mode==='ou'){
        return (Number(b.kickoff)||0)-(Number(a.kickoff)||0)||
          (Number(b.picked_at)||0)-(Number(a.picked_at)||0)||
          (Number(b.fixture_id)||0)-(Number(a.fixture_id)||0)||
          String(a.formula_id||'').localeCompare(String(b.formula_id||''));
      }
      const priority=x=>x.status==='PENDING'?(hubRows[x.fixture_id]?.phase==='LIVE'?0:1):2;`,
 'SORT_LATEST_KICKOFF_IN_PUBLIC_HISTORY');
 s=once(s,
 "    if(!visible.length)\n      list.append(el('p','b46pm-empty',\n        mode==='btts'?'No qualified BTTS predictions yet.':'No matches in this view.'));",
 `    if(mode==='ou'&&!b46OuNativeRows){
      const status=el('div','b46pm-ou-history-pending');
      if(b46AdaptiveOverviewError){
        status.append(el('p','b46pm-empty','Over/Under history temporarily unavailable.'));
        const retry=el('button','b46pm-period-btn','Retry');
        retry.type='button';
        retry.addEventListener('click',()=>{
          b46AdaptiveOverviewError=false;b46AdaptiveAt=0;draw();
        });
        status.append(retry);
      }else status.append(b46PrematchLoadingContent());
      list.append(status);
    }else if(!visible.length)
      list.append(el('p','b46pm-empty',
        mode==='btts'?'No qualified BTTS predictions yet.':'No matches in this view.'));`,
 'NO_STALE_5_CARDS_BEFORE_SNAPSHOT');
 s=once(s,
 "    const paginateStats=mode!=='predictions';\n    const pages=paginateStats?Math.max(1,Math.ceil(displayRows.length/MATCHES_PER_PAGE)):1;\n    matchPage=Math.min(Math.max(1,matchPage),pages);\n    const pageStart=(matchPage-1)*MATCHES_PER_PAGE;\n    const pageRows=paginateStats?displayRows.slice(pageStart,pageStart+MATCHES_PER_PAGE):displayRows;",
 `    const paginateStats=mode!=='predictions';
    const b46HistoryPageSize=mode==='ou'?10:MATCHES_PER_PAGE;
    const pages=paginateStats?Math.max(1,Math.ceil(displayRows.length/b46HistoryPageSize)):1;
    matchPage=Math.min(Math.max(1,matchPage),pages);
    const pageStart=(matchPage-1)*b46HistoryPageSize;
    const pageRows=paginateStats?displayRows.slice(pageStart,pageStart+b46HistoryPageSize):displayRows;`,
 'TEN_PER_PAGE_ONLY_ON_ORIGINAL_OU_HISTORY');
 s=once(s,
 "      const caption=el('span','b46pm-page-summary',(pageStart+1)+'–'+Math.min(pageStart+MATCHES_PER_PAGE,displayRows.length)+' of '+displayRows.length+' matches');",
 "      const caption=el('span','b46pm-page-summary',(pageStart+1)+'–'+Math.min(pageStart+b46HistoryPageSize,displayRows.length)+' of '+displayRows.length+' matches');",
 'PAGER_DISPLAY_COHERENCE');
 s=once(s,
 "      const match=el('article','b46pm-match'+(live?' b46pm-match-live':''));",
 "      const match=el('article','b46pm-match'+(live?' b46pm-match-live':''));\n      if(mode==='ou'&&item.formula_id)match.dataset.b46AdaptiveFormula=item.formula_id;",
 'RETAIN_ORIGINAL_CARD_DOM');
 s=once(s,
 "      const status=el('span','b46pm-state '+(live?'live':String(item.status).toLowerCase()),displayStatus);top.append(status);",
 "      const status=el('span','b46pm-state '+(live?'live':String(item.status).toLowerCase()),displayStatus);top.append(status);\n      if(mode==='ou'&&item.formula_id)top.append(el('span','b46pm-ou-formula-tag',item.formula_id+' · TEST'));",
 'VISIBLE_FORMULA_TRACE');
 s=once(s,
 "      for(const v of ['Probability '+fmtPct(Number(item.probability)),'Edge '+(item.market==='O/U'&&item.edge==null?'—':fmtPct(Number(item.edge))),'EV '+fmtPct(Number(item.ev)),'History '+item.home_count+'/'+item.away_count])details.append(el('span','',v));",
 `      const metricTexts=item.formula_id?[
        'Probability —','Edge —','EV —',
        'History '+(Number.isFinite(Number(item.history_used))?item.history_used:'—'),
        'Formula '+item.formula_id
      ]:[
        'Probability '+fmtPct(Number(item.probability)),
        'Edge '+(item.market==='O/U'&&item.edge==null?'—':fmtPct(Number(item.edge))),
        'EV '+fmtPct(Number(item.ev)),
        'History '+item.home_count+'/'+item.away_count
      ];
      for(const v of metricTexts)details.append(el('span','',v));`,
 'NO_FAKE_MODEL_PROBABILITIES_FOR_ADAPTIVE');
 s=once(s,
 "    if(paginateStats&&displayRows.length>MATCHES_PER_PAGE){",
 "    if(paginateStats&&displayRows.length>b46HistoryPageSize){",
 'PAGINATION_TRIGGER');
 return s;
}
export function patchOuOldCardsWorker(worker){
 if(typeof worker!=='string'||worker.includes(B46_OU_ORIGINAL_PUBLIC_HISTORY_V1))
  throw Error('WRONG_WORKER_OR_ALREADY_INSTALLED');
 const regex=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const match=worker.match(regex);
 if(!match)throw Error('EMBEDDED_PREMATCH_CLIENT_NOT_FOUND');
 const client=patchOuOldCardsClient(JSON.parse(match[1]));
 return {worker:once(worker,match[0],
  'var prematchClientScript = '+JSON.stringify(client)+';','EMBEDDED_CLIENT_ONLY'),client};
}
