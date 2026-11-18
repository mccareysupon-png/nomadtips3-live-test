// Browser-isolated staging candidate. Reuses current finance card and fast renderer.
// Does NOT patch or deploy the live website. Unsupported advanced filters use native fallback.
export function patchStageFastUI(input){
 let s=input;
 const once=(from,to)=>{if(s.split(from).length!==2)throw Error('STAGE_UI_ANCHOR_DRIFT_'+from.slice(0,50));s=s.replace(from,to)};
 const replaceSection=(a,b,to)=>{let i=s.indexOf(a),j=s.indexOf(b,i+1);if(i<0||j<0)throw Error('STAGE_UI_SECTION_DRIFT_'+a);s=s.slice(0,i)+to+'\n'+s.slice(j)};
 replaceSection('function validRoute(){','function nativeReady(){',`const aliases={all:'all',ah:'AH','1x2':'1X2',ou:'O/U','o/u':'O/U',overunder:'O/U',over_under:'O/U',corners:'Corners',corner:'Corners',btts:'BTTS',cards:'Cards',other:'Other'};
 function stageMarket(){
  const q=new URLSearchParams(location.search),v=q.get('market')||$('[data-stat-market].active')?.dataset.statMarket||'all';
  return aliases[String(v).toLowerCase()]??null;
 }
 function validRoute(){
  const q=new URLSearchParams(location.search);
  return document.body?.dataset.workspaceView==='statistics'&&!!stageMarket()&&['all',''].includes(q.get('variant')||'all')&&['all',''].includes(q.get('filter')||'all')&&['all',''].includes(q.get('range')||'all');
 }`);
 once("g.market!=='all'||g.variant!=='all'||g.filter!=='all'||g.range!=='all'||","g.market!==stageMarket()||g.variant!=='all'||g.filter!=='all'||g.range!=='all'||");
 once("!Array.isArray(g.series?.units)||g.series.units.length<1 ||","!Array.isArray(g.series?.units)||(g.summary?.priced>0&&g.series.units.length<1) ||");
 once("const values=points.map(p=>p.value);",`if(!points.length){
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 560 190');svg.setAttribute('role','img');svg.setAttribute('aria-label','No settled signals');
  const t=document.createElementNS(ns,'text');t.setAttribute('x','280');t.setAttribute('y','95');t.setAttribute('text-anchor','middle');t.setAttribute('fill','#a8d8c4');t.textContent='No settled signals';svg.append(t);return svg;
 }
 const values=points.map(p=>p.value);`);
 once("title.textContent='DAILY NET UNITS · ALL MARKETS';","title.textContent='DAILY NET UNITS · '+(stageMarket()==='all'?'ALL MARKETS':stageMarket());");
 once("(count/head.total*100).toFixed(1)","(head.total?count/head.total*100:0).toFixed(1)");
 const detailsStart=" details.addEventListener('click',()=>{",detailsEnd=" right.append(label,net,stats,outcomes,details);";
 replaceSection(detailsStart,detailsEnd,` const pendingButton=document.createElement('button');pendingButton.className='b46-fast-details';pendingButton.type='button';pendingButton.dataset.stagePending='1';pendingButton.textContent='Pending ('+head.pending+')';
 details.addEventListener('click',()=>void openStageRecords(preview,'history'));
 pendingButton.addEventListener('click',()=>void openStageRecords(preview,'pending'));
 right.append(label,net,stats,outcomes,details,pendingButton);`);
 once(detailsEnd,"");
 const mountStart="function mount(){";
 once(mountStart,`async function openStageRecords(host,kind){
  if(!host?.isConnected)return;
  host.querySelector('[data-stage-records]')?.remove();
  const box=document.createElement('section');box.dataset.stageRecords=kind;box.style.cssText='margin-top:12px;max-width:100%;overflow-x:auto';
  const label=document.createElement('div');label.textContent='Loading '+kind+'…';label.dataset.stageRecordStatus='1';box.append(label);
  const table=document.createElement('table');table.style.cssText='width:100%;min-width:530px;font-size:12px;text-align:left';const tbody=document.createElement('tbody');table.append(tbody);box.append(table);
  const more=document.createElement('button');more.type='button';more.className='b46-fast-details';more.textContent='Show 50 more';more.hidden=true;box.append(more);host.append(box);
  let cursor=0,shown=0,gen=head.generation,market=stageMarket(),loading=false;
  const base='/_stage/read/';
  function cell(tr,txt){const td=document.createElement('td');td.style.cssText='padding:6px;border-bottom:1px solid #355547';td.textContent=String(txt??'—');tr.append(td)}
  async function read(){
   if(loading||cursor===null)return;loading=true;more.disabled=true;
   try{
    const r=await fetch(base+kind+'?market='+encodeURIComponent(market)+'&generation='+gen+'&offset='+cursor+'&limit=50',{cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!r.ok){if(r.status===409)throw Error('Data changed — reopen list');throw Error('Read failed')}
    const d=await r.json();if(d.generation!==gen||!Array.isArray(d.rows)||d.rows.length>50)throw Error('Invalid page');
    for(const row of d.rows){
     const tr=document.createElement('tr');tr.dataset.stageSignalId=String(row.id);tr.dataset.stageResult=String(row.result??row.status);tr.style.cursor='pointer';
     const name=x=>x?.name??x;
     cell(tr,[name(row.home),name(row.away)].filter(Boolean).join(' – '));cell(tr,name(row.league));cell(tr,row.marketLabel??row.market);cell(tr,row.selection);cell(tr,row.line);cell(tr,row.odds);cell(tr,row.result??row.status);
     tr.addEventListener('click',async()=>{
      try{
       const z=await fetch(base+'detail?market='+encodeURIComponent(market)+'&generation='+gen+'&id='+encodeURIComponent(row.id),{cache:'no-store',signal:AbortSignal.timeout(8000)});
       if(!z.ok)throw Error('Detail unavailable');const data=await z.json();
       box.querySelector('[data-stage-match-detail]')?.remove();const detail=document.createElement('pre');detail.dataset.stageMatchDetail=String(data.row.id);detail.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px';detail.textContent=JSON.stringify(data.row,null,2);box.append(detail);
      }catch(e){label.textContent=e.message}
     });
     tbody.append(tr);shown++;
    }
    cursor=d.next;label.textContent='Showing '+shown+' of '+d.total;more.hidden=cursor===null;
   }catch(e){label.textContent=e.message;more.hidden=false}
   finally{loading=false;more.disabled=false}
  }
  more.addEventListener('click',()=>void read());await read();
 }
 function mount(){`);
 // Keep the current financial card, not a second chart. Native fallback is enabled only for unsupported routes.
 once("if(!graph||!head||!validRoute()||nativeReady()){if(nativeReady())cleanup();return}","if(!graph||!head||!validRoute()){return}");
 once("if(nativeReady()){\n       diag.nativeReadyMs","if(nativeReady()&&!validRoute()){\n       diag.nativeReadyMs");
 const start="const begin=async()=>{",end="if(document.readyState==='loading'){";
 replaceSection(start,end,`let running=false,lastKey=null;
 const begin=async()=>{
  if(running)return;
  if(document.body?.dataset.workspaceView!=='statistics'){cleanup();return}
  if(!validRoute()){cleanup();diag.status='unsupported-filter-native-fallback';triggerNativeFallback();return}
  running=true;
  try{
   const key=stageMarket(),q='?market='+encodeURIComponent(key);
   const [hr,gr]=await Promise.all([fetch('/_stage/read/head'+q,{cache:'no-store',signal:AbortSignal.timeout(8000)}),fetch('/_stage/read/graph'+q,{cache:'no-store',signal:AbortSignal.timeout(8000)})]);
   if(!hr.ok||!gr.ok)throw Error('STAGE_READ_HTTP');
   const [h,g]=await Promise.all([hr.json(),gr.json()]);
   if(key!==stageMarket())return;
   if(h.generation!==g.generation||h.asOf!==g.asOf)throw Error('STAGE_READ_GENERATION');
   const stamp=key+':'+h.generation;
   if(stamp===lastKey&&preview?.isConnected)return;
   head={schema:1,ok:true,snapshotSavedAt:h.asOf,generation:h.generation,total:h.total,pending:h.pending,unresolved:h.unresolved,win:h.raw_counts.WIN,loss:h.raw_counts.LOSS,push:h.raw_counts.PUSH,halfWin:h.raw_counts.HALF_WIN,halfLoss:h.raw_counts.HALF_LOSS};
   graph={...g,variant:'all',filter:'all',range:'all'};
   if(!validData(head,graph))throw Error('STAGE_GRAPH_HEAD_MISMATCH');
   cleanup();mount();lastKey=stamp;
   diag.generation=h.generation;diag.market=key;diag.revisionSequence=g.sequence;
  }catch(e){diag.status='stage-read-unavailable';diag.error=String(e.message||e);/* no production mutation; keep last verified view */}
  finally{running=false}
 };
 document.addEventListener('ball46:workspace-view',()=>void begin());
 document.addEventListener('click',e=>{if(e.target?.closest?.('[data-stat-market],[data-sp-filter],[data-sp-variant]'))setTimeout(begin,50)},true);
 window.addEventListener('popstate',()=>void begin());
 setInterval(()=>void begin(),1000);`);
 return s;
}
