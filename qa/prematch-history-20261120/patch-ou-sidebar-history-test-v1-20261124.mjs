// BALL46 PreMatch TEST UI only. Unified O/U sidebar WinRate +
// public-facing, frontend-only paged Adaptive research history. Never deploy backend.
export const B46_OU_SIDEBAR_HISTORY_V1='B46_OU_SIDEBAR_HISTORY_V1';
const one=(src,from,to,label)=>{
 const c=src.split(from).length-1;
 if(c!==1)throw Error('B46_OU_SIDEBAR_HISTORY_DRIFT_'+label+'_'+c);
 return src.replace(from,to);
};
const css=`#b46pm-ou-history-public{display:block;min-width:0;max-width:100%;width:100%;box-sizing:border-box;padding:15px;margin:18px 0;background:transparent;color:inherit}
#b46pm-ou-history-public .b46pm-ou-history-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 14px;margin:0 0 12px}
#b46pm-ou-history-public .b46pm-ou-history-tablewrap{width:100%;max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
#b46pm-ou-history-public table{border-collapse:collapse;width:100%;min-width:730px;font-size:12px}
#b46pm-ou-history-public th,#b46pm-ou-history-public td{padding:10px 12px;text-align:left;border-bottom:1px solid rgba(117,156,136,.24);white-space:nowrap;vertical-align:middle}
#b46pm-ou-history-public .b46pm-ou-history-match{min-width:180px;white-space:normal}
#b46pm-ou-history-public .b46pm-ou-history-pick{font-weight:650}
#b46pm-ou-history-public .b46pm-ou-history-result-win{color:#32ce80;font-weight:650}
#b46pm-ou-history-public .b46pm-ou-history-result-loss{color:#f26b75;font-weight:650}
#b46pm-ou-history-public .b46pm-ou-history-pager{display:flex;align-items:center;justify-content:flex-end;flex-wrap:wrap;gap:8px;margin-top:14px}
#b46pm-ou-history-public .b46pm-ou-history-pager button{border:1px solid rgba(116,156,135,.45);background:transparent;color:inherit;border-radius:7px;padding:7px 12px;cursor:pointer;font:600 12px system-ui,sans-serif}
#b46pm-ou-history-public .b46pm-ou-history-pager button:disabled{opacity:.38;cursor:default}
#b46pm-ou-history-public .b46pm-ou-history-pager button[aria-current="page"]{border-color:#30b971;color:#30d57a}
@media(max-width:760px){#b46pm-ou-history-public{padding:11px 2px;margin:14px 0}#b46pm-ou-history-public th,#b46pm-ou-history-public td{padding:9px}}`;
const helper=`
  // B46_OU_SIDEBAR_HISTORY_V1: data adapter uses TEST history data only.
  // Future production HTML may be carried forward independently from the research engine.
  let b46OuHistoryPage=1;
  function b46OuHistoryRecords(rows){
    const original=Array.isArray(rows)?rows:[];
    return original.filter(r=>r&&typeof r==='object')
      .slice().sort((a,b)=>
        (Number(b.kickoff)||0)-(Number(a.kickoff)||0)||
        (Number(b.picked_at)||0)-(Number(a.picked_at)||0)||
        (Number(b.fixture_id)||0)-(Number(a.fixture_id)||0)||
        String(a.formula_id||'').localeCompare(String(b.formula_id||'')));
  }
  function b46OuHistoryMount(content,reference,records){
    if(mode!=='ou'||!content?.isConnected||!reference?.isConnected)return;
    let shell=content.querySelector('#b46pm-ou-history-public');
    if(!shell){
      shell=el('section','b46pm-list');
      shell.id='b46pm-ou-history-public';
      shell.setAttribute('aria-label','Over/Under recorded prediction history');
    }
    reference.before(shell);
    const list=b46OuHistoryRecords(records);
    const pageSize=10,pages=Math.max(1,Math.ceil(list.length/pageSize));
    b46OuHistoryPage=Math.max(1,Math.min(pages,b46OuHistoryPage));
    const begin=(b46OuHistoryPage-1)*pageSize;
    const pageRows=list.slice(begin,begin+pageSize);
    shell.replaceChildren();
    const meta=el('div','b46pm-ou-history-meta');
    meta.append(
      el('strong','b46pm-stats-period-title','OVER/UNDER · PREDICTION HISTORY'),
      el('small','b46pm-stats-cutoff',list.length+' records · 10 per page · Latest kickoffs first')
    );
    shell.append(meta);
    const wrap=el('div','b46pm-ou-history-tablewrap');
    const table=el('table');
    const thead=el('thead'),head=el('tr');
    for(const title of ['KICKOFF','MATCH','FORMULA','PICK','ODDS','BOOK','RESULT','FT']){
      const th=el('th','',title);th.scope='col';head.append(th);
    }
    thead.append(head);table.append(thead);
    const body=el('tbody');
    for(const p of pageRows){
      const tr=el('tr');
      const stamp=Number(p.kickoff);
      const formatted=Number.isSafeInteger(stamp)&&stamp>946684800?
        new Date(stamp*1000).toLocaleString(undefined,{
          day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
      const price=Number(p.odds);
      const finalScore=Number.isFinite(Number(p.hg))&&p.hg!==null&&p.ag!==null?
        String(p.hg)+'-'+String(p.ag):'—';
      const status=String(p.status||'PENDING').toUpperCase();
      const cells=[
        formatted,String(p.home??'Home')+' — '+String(p.away??'Away'),
        String(p.formula_id??'—'),String(p.selection??'—')+' 2.5',
        Number.isFinite(price)&&price>=1.4?price.toFixed(2):'—',
        String(p.bookmaker??'—'),status,finalScore
      ];
      cells.forEach((value,index)=>{
        const cell=el('td',index===1?'b46pm-ou-history-match':index===3?
         'b46pm-ou-history-pick':index===6?
         (status==='WIN'?'b46pm-ou-history-result-win':status==='LOSS'?
         'b46pm-ou-history-result-loss':''):'',value);
        tr.append(cell);
      });
      body.append(tr);
    }
    if(!pageRows.length){
      const tr=el('tr'),td=el('td','','No recorded O/U predictions yet.');
      td.colSpan=8;tr.append(td);body.append(tr);
    }
    table.append(body);wrap.append(table);shell.append(wrap);
    if(pages>1){
      const nav=el('nav','b46pm-ou-history-pager');
      nav.setAttribute('aria-label','Over/Under history pages');
      const add=(label,page,disabled=false,active=false)=>{
        const button=el('button','',label);
        button.type='button';button.disabled=disabled;
        if(active)button.setAttribute('aria-current','page');
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          if(page===b46OuHistoryPage||page<1||page>pages)return;
          b46OuHistoryPage=page;
          b46OuHistoryMount(content,reference,records);
        });
        nav.append(button);
      };
      add('Previous',b46OuHistoryPage-1,b46OuHistoryPage===1);
      const first=Math.max(1,Math.min(pages-4,b46OuHistoryPage-2));
      const last=Math.min(pages,first+4);
      for(let page=first;page<=last;page++)add(String(page),page,false,page===b46OuHistoryPage);
      add('Next',b46OuHistoryPage+1,b46OuHistoryPage===pages);
      shell.append(nav);
    }
  }
`;
export function patchOuSidebarHistoryClient(client){
 if(typeof client!=='string'||!client.includes('B46_OU_ALL_ACCOUNTS_OVERVIEW_V1')||
  !client.includes('B46_OU_ALLTIME_DEFAULT_V2')||
  !client.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3')||
  !client.includes('B46_PM_CONTENT_ONLY_LOADING_V1'))throw Error('EXPECTED_PREMATCH_OVERVIEW_NOT_FOUND');
 if(client.includes(B46_OU_SIDEBAR_HISTORY_V1))throw Error('SIDEBAR_HISTORY_ALREADY_INSTALLED');
 let out=one(client,
  "    const rate=s=>s.winRate==null?'—':Number(s.winRate).toFixed(2)+'%';",
  `    const rate=s=>s.winRate==null?'—':Number(s.winRate).toFixed(2)+'%';
    const ouSnapshot=b46AdaptiveData&&ouLedger?b46OuOverviewData()?.total:null;`,
  'SIDEBAR_OVERVIEW_SOURCE');
 out=one(out,
  "r.id==='ou'?rate(ouLedger?.stats??{}):",
  "r.id==='ou'?rate(ouSnapshot??{}):",
  'REMOVE_LEGACY_OU_RATE');
 out=one(out,
  `        if(count)count.textContent=r.id==='ou-predictions'?'—':r.id==='ou'?rate(ouSnapshot??{}):r.id==='predictions'?String(predictionsStats.pending??'—'):r.id==='btts'?rate(btts):rate(oneX2);`,
  `        if(count){
          count.textContent=r.id==='ou-predictions'?'—':r.id==='ou'?rate(ouSnapshot??{}):r.id==='predictions'?String(predictionsStats.pending??'—'):r.id==='btts'?rate(btts):rate(oneX2);
          if(r.id==='ou'){
            const pct=ouSnapshot?.winRate;
            count.style.color=Number.isFinite(Number(pct))&&pct!==null?
              (Number(pct)>=50?'#2ed17a':'#f06a77'):'';
            count.dataset.b46OuOverview=ouSnapshot?'snapshot':'pending';
          }
        }`,
  'SIDEBAR_RATE_COLOR');
 out=one(out,
  "  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null,b46AdaptiveOverviewError=false;",
  "  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null,b46AdaptiveOverviewError=false;\n"+helper,
  'HISTORY_STATE_AND_UI');
 out=one(out,
  "      panel.append(mk('strong','PRICE-BACKED RESEARCH RESULTS','b46pm-stats-period-title'));\n      panel.append(table(['MATCH','FORMULA','PICK','ODDS','BOOK','QUOTE TIME UTC','STATUS','FT'],\n        rows.slice(0,150),p=>[\n          p.home+' — '+p.away,p.formula_id,p.selection+' 2.5',\n          Number(p.odds).toFixed(2),p.bookmaker,\n          new Date(p.quote_observed_at*1000).toISOString().slice(0,16).replace('T',' ')+\n            (String(p.odds_source).includes('HISTORICAL_RESEARCH_ONLY')?' · OLD CACHE':''),\n          p.status,p.hg==null?'—':p.hg+'-'+p.ag]));",
  "      b46OuHistoryMount(content,panel,rows);",
  'REPLACE_RESEARCH_150_ROWS_WITH_PUBLIC_PAGED_HISTORY');
 out=one(out,
  "          b46AdaptiveData=d;b46AdaptiveAt=Date.now();b46AdaptiveOverviewError=false;\n          if(mode==='ou'&&content.isConnected)draw();",
  "          b46AdaptiveData=d;b46AdaptiveAt=Date.now();b46AdaptiveOverviewError=false;\n          updateMenu();\n          if(mode==='ou'&&content.isConnected)draw();",
  'SIDEBAR_REFRESH_ON_ADAPTIVE');
 out=one(out,
  "      loading=false;updateMenu();\n      if(mode){",
  `      loading=false;updateMenu();
      // Read existing TEST Adaptive snapshot for the sidebar, even when another
      // Pre-Match page is selected. Does NOT request paid football data.
      if(mode!=='ou'&&ouLedger&&!b46AdaptiveLoading&&
         (!b46AdaptiveData||Date.now()-b46AdaptiveAt>60000)&&!b46AdaptiveOverviewError){
        b46AdaptiveLoading=fetch('/__b46_pm_adaptive_research',{cache:'no-store'})
          .then(r=>{if(!r.ok)throw Error('O/U stats HTTP '+r.status);return r.json()})
          .then(d=>{
            if(d?.code!=='B46_ADAPTIVE_OU_RESEARCH_V1'||!Array.isArray(d.formulas))
              throw Error('Invalid O/U snapshot');
            b46AdaptiveData=d;b46AdaptiveAt=Date.now();b46AdaptiveOverviewError=false;
            updateMenu();
          }).catch(e=>{
            b46AdaptiveOverviewError=true;updateMenu();
            console.warn('Pre-Match O/U sidebar snapshot:',String(e));
          }).finally(()=>{b46AdaptiveLoading=null});
      }
      if(mode){`,
  'FETCH_SIDEBAR_WITHOUT_OPENING_OU');
 return out;
}
export function patchOuSidebarHistoryWorker(worker){
 if(typeof worker!=='string'||worker.includes(B46_OU_SIDEBAR_HISTORY_V1))
  throw Error('TEST_FRONTEND_INVALID_OR_ALREADY_INSTALLED');
 const embed=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const m=worker.match(embed);if(!m)throw Error('CLIENT_MISSING');
 const next=patchOuSidebarHistoryClient(JSON.parse(m[1]));
 let out=one(worker,m[0],'var prematchClientScript = '+JSON.stringify(next)+';','EMBED_CLIENT');
 const anchor='  const pmStyles = prematchStyles + prematchMirrorStyles + ';
 out=one(out,anchor,anchor+JSON.stringify(css)+' + ','PUBLIC_HISTORY_CSS');
 return {worker:out,client:next};
}
