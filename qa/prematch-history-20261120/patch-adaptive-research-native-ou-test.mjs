// Show Adaptive Research in the EXISTING TEST PreMatch Over/Under statistics.
// Preserve every other tab and existing legacy predictions/Total unmodified.
const once=(s,a,b,label)=>{
 const n=s.split(a).length-1;
 if(n!==1)throw Error('ADAPTIVE_NATIVE_UI_DRIFT_'+label+'_'+n);
 return s.replace(a,b);
};
export const ADAPTIVE_NATIVE_UI_V1='B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1';

const panelCode="\n  // Native Over/Under TEST route only. Research statistics NEVER enter Total.\n  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null;\n  function b46AdaptivePanel(content){\n    if(mode!=='ou'||!content)return;\n    let panel=content.querySelector('#b46-adaptive-native');\n    if(!panel){\n      panel=document.createElement('section');\n      panel.id='b46-adaptive-native';\n      panel.className='b46pm-stats-board';\n      panel.setAttribute('aria-label','Separate Adaptive Over Under 2.5 Research');\n      content.append(panel);\n    }\n    const mk=(tag,text,cls)=>{\n      const x=document.createElement(tag);x.textContent=String(text??'—');\n      if(cls)x.className=cls;return x;\n    };\n    const table=(headers,rows,pick)=>{\n      const scroll=document.createElement('div');\n      scroll.style.overflow='auto';scroll.style.maxHeight='345px';\n      const t=document.createElement('table');\n      t.style.width='100%';t.style.minWidth='750px';\n      t.style.borderCollapse='collapse';t.style.fontSize='12px';\n      const header=document.createElement('tr');\n      headers.forEach(h=>{\n        const cell=mk('th',h);cell.style.padding='10px';\n        cell.style.textAlign='left';cell.style.borderBottom='1px solid #395648';header.append(cell);\n      });\n      t.append(header);\n      if(!rows.length){\n        const tr=document.createElement('tr'),td=mk('td','No price-backed predictions yet');\n        td.colSpan=headers.length;td.style.padding='12px';tr.append(td);t.append(tr);\n      }\n      rows.forEach(v=>{\n        const tr=document.createElement('tr');\n        pick(v).forEach(value=>{\n          const td=mk('td',value);td.style.padding='9px 10px';\n          td.style.borderBottom='1px solid #294334';tr.append(td);\n        });t.append(tr);\n      });\n      scroll.append(t);return scroll;\n    };\n    const data=b46AdaptiveData;\n    panel.replaceChildren();\n    panel.append(mk('strong','ADAPTIVE OVER/UNDER 2.5 · RESEARCH TEST','b46pm-stats-period-title'));\n    if(data){\n      const formula=data.formulas??[],rows=data.records??[];\n      const total=formula.reduce((n,f)=>n+Number(f.totalPredictions||0),0);\n      const pending=formula.reduce((n,f)=>n+Number(f.pending||0),0);\n      const settled=formula.reduce((n,f)=>n+Number(f.settled||0),0);\n      const board=mk('div','','b46pm-stats-grid');\n      for(const [label,val] of [\n        ['HISTORY QUALIFIED',data.screeningCounts?.uniqueFixturesWithPatterns??0],\n        ['PRICE-BACKED MATCHES',data.priced?.fixtures??0],\n        ['RESEARCH ENTRIES',total],['PENDING',pending],['SETTLED',settled]\n      ]){\n        const cell=mk('div','','b46pm-stat');\n        cell.append(mk('span',label,'b46pm-stat-label'),mk('strong',val,'b46pm-stat-value'));\n        board.append(cell);\n      }\n      panel.append(board);\n      panel.append(mk('p','Original recorded pre-match bookmaker quotes. OLD CACHE means historical research price, not verified live. This Ledger and Snapshot are never included in Total.','b46pm-stats-cutoff'));\n      panel.append(mk('strong','PRICE-BACKED RESEARCH RESULTS','b46pm-stats-period-title'));\n      panel.append(table(['MATCH','FORMULA','PICK','ODDS','BOOK','QUOTE TIME UTC','STATUS','FT'],\n        rows.slice(0,150),p=>[\n          p.home+' — '+p.away,p.formula_id,p.selection+' 2.5',\n          Number(p.odds).toFixed(2),p.bookmaker,\n          new Date(p.quote_observed_at*1000).toISOString().slice(0,16).replace('T',' ')+\n            (String(p.odds_source).includes('HISTORICAL_RESEARCH_ONLY')?' · OLD CACHE':''),\n          p.status,p.hg==null?'—':p.hg+'-'+p.ag]));\n      panel.append(mk('strong','SEPARATE FORMULA STATISTICS','b46pm-stats-period-title'));\n      panel.append(table(['FORMULA','HISTORY MATCHES','PREDICTIONS','PENDING','WIN','LOSS','WIN RATE','AVG ODDS','P/L','ROI','MAX DD'],\n        formula,f=>[\n          f.formula,data.formulaCounts?.[f.formula]?.fixtureCount??0,\n          f.totalPredictions,f.pending,f.win,f.loss,\n          f.winRate==null?'—':f.winRate.toFixed(2)+'%',\n          f.averageOdds==null?'—':f.averageOdds.toFixed(2),\n          f.profitLoss?.toFixed(2)??'0.00',\n          f.roi==null?'—':f.roi.toFixed(2)+'%',\n          f.maximumDrawdown?.toFixed(2)??'0.00']));\n      panel.append(mk('p',\n        'History screen: '+(data.screeningCounts?.formulasTriggered??0)+\n        ' formula-side matches across '+(data.screeningCounts?.uniqueFixturesWithPatterns??0)+\n        ' fixtures. Missing-priced matches remain research candidates only, not Predictions.',\n        'b46pm-stats-cutoff'));\n    }else{\n      panel.append(mk('p','Reading separate test research statistics…','b46pm-stats-cutoff'));\n    }\n    if(!b46AdaptiveLoading&&(!b46AdaptiveData||Date.now()-b46AdaptiveAt>60000)){\n      b46AdaptiveLoading=fetch('/__b46_pm_adaptive_research',{cache:'no-store'})\n        .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})\n        .then(d=>{\n          if(d?.code!=='B46_ADAPTIVE_OU_RESEARCH_V1'||!Array.isArray(d.formulas))\n            throw Error('Unverified research response');\n          b46AdaptiveData=d;b46AdaptiveAt=Date.now();\n          if(mode==='ou'&&content.isConnected)b46AdaptivePanel(content);\n        })\n        .catch(e=>{\n          const live=document.getElementById('b46-adaptive-native');\n          if(live&&mode==='ou')\n            live.append(mk('p','Research data unavailable: '+String(e.message),'b46pm-stats-cutoff'));\n        }).finally(()=>{b46AdaptiveLoading=null});\n    }\n  }\n";

export function patchAdaptiveNativeClient(client){
 if(typeof client!=='string'||!client.includes('const routes = [')||
    !client.includes("{id:'ou',label:'Over/Under'")||
    !client.includes('function renderEmptyOuScreen(content,statsMode){')||
    !client.includes('const finish=()=>{'))
  throw Error('UNEXPECTED_NATIVE_TEST_CLIENT');
 if(client.includes(ADAPTIVE_NATIVE_UI_V1))throw Error('NATIVE_ADAPTIVE_ALREADY_INSTALLED');
 const start='function renderEmptyOuScreen(content,statsMode){';
 const done="const finish=()=>{\n      syncPrematchViewport();\n      panel.scrollTop=previousScroll;\n    };";
 let out=once(client,start,'// '+ADAPTIVE_NATIVE_UI_V1+'\n'+panelCode+'\n'+start,'RESEARCH_PANEL');
 out=once(out,done,
  "const finish=()=>{\n      syncPrematchViewport();\n      panel.scrollTop=previousScroll;\n      if(mode==='ou')b46AdaptivePanel(content);\n    };",
  'NATIVE_DRAW_FINALIZER');
 return out;
}
export function patchAdaptiveNativeWorker(main){
 if(typeof main!=='string'||!main.includes('var prematchClientScript = ')||
  !main.includes('env.PREMATCH_STORE.fetch')||
  !main.includes('if (u.pathname === "/__b46_prematch_data")'))
  throw Error('UNEXPECTED_PREMATCH_TEST_WORKER');
 if(main.includes('/__b46_pm_adaptive_research'))
  throw Error('ADAPTIVE_PROXY_ALREADY_INSTALLED');
 const match=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 if(!match)throw Error('CLIENT_SCRIPT_NOT_EMBEDDED');
 const prev=JSON.parse(match[1]),client=patchAdaptiveNativeClient(prev);
 let out=once(main,match[0],
  'var prematchClientScript = '+JSON.stringify(client)+';',
  'EMBED_NATIVE_CLIENT');
 const proxy='if (u.pathname === "/__b46_prematch_data") return env.PREMATCH_STORE.fetch("https://prematch.internal/preview-data");';
 out=once(out,proxy,
  'if (u.pathname === "/__b46_pm_adaptive_research") return env.PREMATCH_STORE.fetch("https://prematch.internal/ou-adaptive-research-data");\n  '+proxy,
  'SAME_ORIGIN_PROXY');
 return {worker:out,client};
}
