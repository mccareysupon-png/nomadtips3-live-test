// Restore native count/history display without changing Receiver, Engine or settlement.
// Keep the old complete-ledger verification. Expose coherent partial rows while it runs.
function replaceOnce(s,a,b){if(s.split(a).length!==2)throw Error('RESTORE_ANCHOR_'+a.slice(0,100));return s.replace(a,()=>b)}
export function restoreHistoryChart(s){
 const a="b46GraphKey=key;b46Last=Date.now();b46FailedAt=0;renderFromStats(b46GraphData,'receiver');";
 return replaceOnce(s,a,a+`
  if(!window.__B46_FAST_DETAILS_REQUESTED&&!window.__B46_HISTORY_RESTORE_QUEUED){
   window.__B46_HISTORY_RESTORE_QUEUED=true;
   requestAnimationFrame(()=>setTimeout(()=>{
    window.__B46_HISTORY_RESTORE_QUEUED=false;
    if(active()&&!window.__B46_FAST_DETAILS_REQUESTED)window.__B46_FAST_LOAD_DETAILS?.();
   },300));
  }
 `);
}
export function restoreHistoryWorkspace(s){
 const a="      rows.push(row);\n    }\n    const cursor = current.nextCursor;";
 s=replaceOnce(s,a,`      rows.push(row);
    }
    // Never publish an unverified mixed-revision page; the original signature and duplicate checks passed.
    if(window.__B46_FAST_DETAILS_REQUESTED&&document.body?.dataset.workspaceView==='statistics'&&(rows.length===first.rows.length||rows.length%2500===0||!current.nextCursor)){
      document.dispatchEvent(new CustomEvent('b46:history-restore-progress',{detail:{rows:rows.slice(),total:first.total,ledgerTotal:first.ledgerTotal,byMarket:first.byMarket}}));
    }
    const cursor = current.nextCursor;`);
 const b="function marketCounts(){const out=Object.fromEntries(MARKETS.map(m=>[m.id,0]));";
 s=replaceOnce(s,b,b+"if(!state.statsLoaded&&state.historyPreview)return state.historyPreview.counts;");
 const c="function renderStatNav(){const c=marketCounts();$$('[data-stat-market]').forEach(b=>{const id=b.dataset.statMarket;b.classList.toggle('active',state.view==='statistics'&&state.market===id);const count=b.querySelector('b');if(count)count.textContent=String(c[id]||0)})}";
 s=replaceOnce(s,c,c.replace("if(count)count.textContent=String(c[id]||0)","if(count){count.textContent=String(c[id]||0);if(!state.statsLoaded&&state.historyPreview)count.title='Settled signals · full history loading';else if(count.title==='Settled signals · full history loading')count.removeAttribute('title')}"));
 const d="function renderStats(){if(!state.statsLoaded){renderVariants();renderFilters();renderStatHeader();return}";
 s=replaceOnce(s,d,"function renderStats(){if(!state.statsLoaded){renderVariants();renderFilters();renderStatHeader();if(state.historyPreview){renderStatNav();renderTable(filteredRows());const count=$('[data-sp-record-count]');if(count)count.textContent='Partial history · '+state.rows.length.toLocaleString('en-US')+' / '+state.historyPreview.ledgerTotal.toLocaleString('en-US')+' loaded';}return}");
 const e="document.addEventListener('ball46:statistics-snapshot',e=>{state.rows=";
 s=replaceOnce(s,e,`
 // Existing endpoint's byMarket values count settled signals only. Restore those accurate
 // numbers immediately; restore the original all-ledger counts when full verification finishes.
 function b46RestoreMarketFamily(key){
  const native=window.BALL46_MARKET_REGISTRY?.definitions?.[key]?.family;
  if(['1x2','ah','ou','btts','corners','cards','other'].includes(native))return native;
  const x=String(key).toLowerCase();
  if(x.includes('corner'))return'corners';if(x.includes('card'))return'cards';if(x.includes('btts'))return'btts';
  if(/(^|_)ah(_|$)|asian|handicap/.test(x))return'ah';if(/over|under|total/.test(x))return'ou';if(/1x2|moneyline|match_result/.test(x))return'1x2';return'other';
 }
 document.addEventListener('b46:history-restore-progress',e=>{
  if(state.view!=='statistics'||state.statsLoaded)return;
  const d=e.detail;if(!d||!Array.isArray(d.rows)||!d.rows.length||!Number.isSafeInteger(d.total)||!Number.isSafeInteger(d.ledgerTotal)||d.rows.length>d.ledgerTotal||!d.byMarket||typeof d.byMarket!=='object')return;
  const counts=Object.fromEntries(MARKETS.map(m=>[m.id,0]));counts.all=d.total;
  let total=0;for(const [k,n] of Object.entries(d.byMarket)){if(!Number.isSafeInteger(n)||n<0)return;counts[b46RestoreMarketFamily(k)]+=n;total+=n}
  if(total!==d.total)return;
  if(state.historyPreview&&state.rows.length>d.rows.length)return;
  state.historyPreview={counts,ledgerTotal:d.ledgerTotal};state.rows=d.rows;state.statisticsTotal=d.ledgerTotal;
  renderStats();
  const st=$('[data-sp-feed-state]');if(st)st.textContent='Loading full history · '+d.rows.length.toLocaleString('en-US')+' of '+d.ledgerTotal.toLocaleString('en-US')+' records';
 });
 `+e);
 const f="state.statsLoaded?'Last successful data · feed unavailable':'Statistics incomplete or unavailable'";
 s=replaceOnce(s,f,"state.statsLoaded?'Last successful data · feed unavailable':state.historyPreview?'Partial history available · reopen Statistics to retry full history':'Statistics incomplete or unavailable'");
 return s;
}
