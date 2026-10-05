import assert from 'node:assert/strict';
const {parse}=await import(process.env.B46_ACORN_MODULE || 'acorn');
export function nodes(source){const result=[];function walk(n){if(!n||typeof n!=='object')return;if(n.type)result.push(n);for(const [k,v]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v)}}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));return result}
export function edits(source,list){list.sort((a,b)=>b.start-a.start);let end=source.length;for(const e of list){assert(e.end<=end,'OVERLAPPING_EDITS');source=source.slice(0,e.start)+e.text+source.slice(e.end);end=e.start}nodes(source);return source}
function one(list,message){assert.equal(list.length,1,message);return list[0]}
export function functionNode(source,name){return one(nodes(source).filter(n=>n.type==='FunctionDeclaration'&&n.id?.name===name),'FUNCTION_SHAPE:'+name)}
export function patchEngine(source){
  const all=nodes(source),list=[];
  for(const name of ['STAT_LEDGER_DEFAULT_LIMIT','STAT_LEDGER_MAX_LIMIT']){
    const d=one(all.filter(n=>n.type==='VariableDeclaration'&&n.declarations.length===1&&n.declarations[0].id.name===name),'CAP_DECLARATION:'+name);
    list.push({...d,text:name==='STAT_LEDGER_DEFAULT_LIMIT'?'var STAT_LEDGER_PAGE_SIZE = 500;':''});
  }
  const latest=one(all.filter(n=>n.type==='MethodDefinition'&&n.key.name==='latestLedgerRows'),'LATEST_METHOD');
  list.push({...latest,text:`async latestLedgerRows(cursor = null) {
    const found = await this.ctx.storage.list({ prefix: STAT_LEDGER_PREFIX, reverse: true,
      limit: STAT_LEDGER_PAGE_SIZE + 1, ...(cursor ? { end: cursor } : {}) });
    const entries = [...found.entries()];
    const more = entries.length > STAT_LEDGER_PAGE_SIZE;
    const included = more ? entries.slice(0, STAT_LEDGER_PAGE_SIZE) : entries;
    return { rows: included.map(([, value]) => value),
      nextCursor: more ? included[included.length - 1][0] : null };
  }`});
  const response=one(all.filter(n=>n.type==='MethodDefinition'&&n.key.name==='statisticsLedgerResponse'),'RESPONSE_METHOD');
  let body=source.slice(response.start,response.end);
  assert(body.includes('const raw = await this.latestLedgerRows(limit);'));
  body=body.replace('statisticsLedgerResponse(limit = STAT_LEDGER_DEFAULT_LIMIT)','statisticsLedgerResponse(cursor = null, paged = false)')
    .replace('const raw = await this.latestLedgerRows(limit);',`let page = await this.latestLedgerRows(cursor);
    const raw = page.rows;
    // Legacy callers receive the complete ledger; paged callers follow every cursor.
    if (!paged) while (page.nextCursor) {
      page = await this.latestLedgerRows(page.nextCursor);
      raw.push(...page.rows);
    }`)
    .replace('returned: rows.length','returned: rows.length, nextCursor: paged ? page.nextCursor : null, hasMore: paged && !!page.nextCursor, ledgerUpdatedAt: meta.updatedAt, statisticsPagination: "CURSOR_NO_TOTAL_CAP_V1"');
  list.push({...response,text:body});
  const route=one(all.filter(n=>n.type==='IfStatement'&&source.slice(n.start,n.end).includes('return Response.json(await this.statisticsLedgerResponse(')),'STATISTICS_ROUTE');
  list.push({...route,text:`if (u.pathname === "/statistics" && request.method === "GET") {
      const cursor = u.searchParams.get("cursor");
      if (cursor !== null && (!cursor.startsWith(STAT_LEDGER_PREFIX) || cursor.length > 1024))
        return Response.json({ ok: false, error: "INVALID_STATISTICS_CURSOR" }, { status: 400 });
      if (!cursor) { await this.scanIfDue(); await this.syncStatisticsLedger(); }
      return Response.json(await this.statisticsLedgerResponse(cursor, u.searchParams.get("paged") === "1" || cursor !== null));
    }`});
  return edits(source,list);
}
export const frontFunctions={
  'singlepage-workspace-343.js':['outcome','outcomeClass','renderKpis','renderGraph','loadStatistics'],
  'longterm-performance-343.js':['outcome','stats','yScale','load'],
  'ui-sync-fixes-343-v2.js':['loadStatCountsOnce'],
  'dashboard-v2-stage3.js':['loadScorebarSettlements']
};
export function patchFrontend(source,fixed,name){
  const list=[];
  for(const fn of frontFunctions[name]){const n=functionNode(source,fn),next=functionNode(fixed,fn);list.push({...n,text:fixed.slice(next.start,next.end)})}
  const listeners={
    'singlepage-workspace-343.js':`document.addEventListener('ball46:statistics-snapshot',e=>{state.rows=e.detail.rows;state.statisticsTotal=e.detail.total;state.statsLoaded=true;state.statsLoadedAt=Date.now();renderStatNav();if(state.view==='statistics')renderStats();const st=$('[data-sp-feed-state]');if(st)st.textContent=\`Updated · \${state.rows.length} settled · \${e.detail.pending} pending\`;});\n`,
    'longterm-performance-343.js':`document.addEventListener('ball46:statistics-snapshot',e=>{rowsCache=e.detail.rows;loadedAt=Date.now();if(active())render()});\n`,
    'ui-sync-fixes-343-v2.js':`document.addEventListener('ball46:statistics-snapshot',e=>paintStatCounts(e.detail.rows,e.detail.total));\n`
  };
  if(listeners[name]){const fn=functionNode(source,name==='longterm-performance-343.js'?'refreshSoon':'init');list.push({start:fn.start,end:fn.start,text:listeners[name]})}
  return edits(source,list);
}
export function dailyPatch(html){
  const start=html.indexOf('<script id="b46-daily-performance-runtime">'),end=html.indexOf('</script>',start);
  assert(start>=0&&end>start,'DAILY_RUNTIME_NOT_FOUND');
  const scriptStart=html.indexOf('>',start)+1,source=html.slice(scriptStart,end),list=[];
  const replace=(name,text)=>list.push({...functionNode(source,name),text});
  replace('outcome',`function outcome(r){if(!window.BALL46_STATISTICS_DATA.isSettled(r))return null;const x=window.BALL46_STATISTICS_DATA.outcome(r);return x==='WIN'||x==='HALF_WIN'?'win':x==='LOSS'||x==='HALF_LOSS'?'loss':x==='PUSH'?'push':null}`);
  replace('market',`function market(r){const family=window.BALL46_MARKET_REGISTRY?.resolve?.(r)?.family;const labels={ah:'AH',ou:'O/U','1x2':'1X2',corners:'CORNERS',cards:'CARDS',btts:'BTTS',other:'OTHER'};if(family&&labels[family])return labels[family];const x=String(r?.marketLabel??r?.market??'').toLowerCase();if(/corner/.test(x))return'CORNERS';if(/card/.test(x))return'CARDS';if(/btts|both teams/.test(x))return'BTTS';if(/asian|handicap/.test(x))return'AH';if(/over|under|total|goal line/.test(x))return'O/U';if(/1x2|match result|moneyline/.test(x))return'1X2';return'OTHER'}`);
  replace('bucket',`function bucket(){return{win:0,loss:0,push:0,pending:0,winCredits:0,decided:0,markets:Object.fromEntries(['AH','O/U','1X2','CORNERS','CARDS','BTTS','OTHER'].map(m=>[m,{win:0,loss:0,push:0}]))}}`);
  replace('addSettled',`function addSettled(b,r,o){b[o]++;b.markets[market(r)][o]++;const result=window.BALL46_STATISTICS_DATA.outcome(r);if(result!=='PUSH'){b.decided++;if(result==='WIN')b.winCredits++;if(result==='HALF_WIN')b.winCredits+=.5}}`);
  replace('isPending',`function isPending(r){return String(r?.status||'').toUpperCase()==='PENDING'}`);
  replace('rate',`function rate(b){return b.decided?\`\${(b.winCredits/b.decided*100).toFixed(1).replace(/\\.0$/,'')}%\`:'—'}`);
  replace('marketHtml',`function marketHtml(b){return Object.keys(b.markets).filter(m=>['AH','O/U','1X2'].includes(m)||b.markets[m].win+b.markets[m].loss+b.markets[m].push>0).map(m=>\`<span class="b46-market"><b>\${m}</b><span>W \${b.markets[m].win} · L \${b.markets[m].loss} · P \${b.markets[m].push}</span></span>\`).join('')}`);
  replace('refresh',`async function refresh(){if(busy)return;busy=true;try{const st=await window.BALL46_STATISTICS_DATA.load();lastGood=aggregate(st.ledgerRows);render(lastGood)}catch(e){if(lastGood)render(lastGood);console.warn('B46 Daily Performance refresh skipped:',e?.message||e)}finally{busy=false}}`);
  let result=html.slice(0,scriptStart)+edits(source,list)+html.slice(end);
  for(const name of Object.keys(frontFunctions)){
    const escaped=name.replace(/\./g,'\\.');
    const re=new RegExp('(src="/?'+escaped+')(?:\\?[^"\\s]*)?"','g');
    let matches=0;result=result.replace(re,(_,prefix)=>{matches++;return prefix+'?v=statistics-no-total-cap-20261005"'});assert.equal(matches,1,'SCRIPT_URL:'+name);
  }
  return result;
}
