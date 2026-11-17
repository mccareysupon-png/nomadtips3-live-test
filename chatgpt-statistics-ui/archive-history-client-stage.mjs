// STAGING ONLY — raw, SETTLED-only archive, paged 50 visible results at a time.
// It must never aggregate these rows or change verified snapshot totals/graph.
export const stageArchiveHistoryScript=String.raw`(()=>{
'use strict';
window.__B46_STAGE_ARCHIVE_DIAG={status:'ready',apiCalls:0,shown:0,buffered:0};
let session=null;
const safe=(v,max=150)=>String(v??'—').slice(0,max);
const ms=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?(n<1e12?n*1000:n):Date.parse(String(v||''))};
const when=v=>{const n=ms(v);return Number.isFinite(n)?new Intl.DateTimeFormat('en-GB',{
 timeZone:'Asia/Bangkok',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'
}).format(new Date(n)):'—'};
const fmtOdds=v=>{const n=Number(v);return Number.isFinite(n)&&n>1?n.toFixed(2):'—'};
function key(row){return String(row?.id??row?.signalId??'')}
function isSettled(row){return row?.status==='SETTLED'&&
 ['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'].includes(String(row.result||'').toUpperCase())}
const node=(tag,cls,text)=>{
 const el=document.createElement(tag);
 if(cls)el.className=cls;
 if(text!=null)el.textContent=String(text);
 return el;
};
function css(){
 if(document.getElementById('b46-stage-archive-css'))return;
 const s=document.createElement('style');s.id='b46-stage-archive-css';
 s.textContent=[
 '#b46-stage-archive{margin-top:16px;padding:13px 0 0;border-top:1px solid #355547}',
 '#b46-stage-archive .b46-stage-archive-title{font-size:13px;color:#e4f4eb;font-weight:750}',
 '#b46-stage-archive .b46-stage-archive-status{font-size:11px;color:#91ac9d;margin:7px 0 11px}',
 '#b46-stage-archive .b46-stage-archive-table-wrap{width:100%;overflow-x:auto;max-width:100%}',
 '#b46-stage-archive table{width:100%;border-collapse:collapse;min-width:520px;font-size:11px}',
 '#b46-stage-archive th{text-align:left;font-weight:700;color:#96b5a5;border-bottom:1px solid #315246;padding:9px 8px}',
 '#b46-stage-archive td{padding:8px;border-bottom:1px solid #213d31;color:#d5e6d9;vertical-align:middle}',
 '#b46-stage-archive td[data-result="WIN"],#b46-stage-archive td[data-result="HALF_WIN"]{color:#41d49d}',
 '#b46-stage-archive td[data-result="LOSS"],#b46-stage-archive td[data-result="HALF_LOSS"]{color:#ed9c9c}',
 '#b46-stage-archive button{font-size:12px;font-weight:700;border:1px solid #336e57;background:#1a3b2e;color:#cff7df;border-radius:8px;margin-top:14px;padding:10px 15px;cursor:pointer}',
 '#b46-stage-archive button:disabled{opacity:.65;cursor:wait}',
 '@media(max-width:850px){#b46-stage-archive .b46-stage-archive-title{font-size:12px}}'
 ].join('');document.head.appendChild(s);
}
function signature(data){
 return JSON.stringify([data.ledgerTotal,data.total,data.pending,data.unresolved,
 data.win,data.loss,data.push,data.halfWin,data.halfLoss,data.statisticsLedgerVersion]);
}
function renderRecord(session,row){
 const tr=node('tr');
 const league=row?.league?.name??row?.league;
 const home=row?.home?.name??row?.home;
 const away=row?.away?.name??row?.away;
 const match=[home,away].filter(x=>x!=null&&x!=='').map(x=>safe(x,65)).join(' – ');
 const market=safe(row?.marketLabel||row?.market||'—',56).replaceAll('_',' ');
 const select=safe(row?.selection??row?.selectionLine??'—',30);
 const line=row?.line==null?'':(' · '+safe(row.line,12));
 const score=row?.finalScore&&row.finalScore.home!=null&&row.finalScore.away!=null?
   safe(row.finalScore.home,3)+'–'+safe(row.finalScore.away,3):'—';
 const result=safe(row.result,15).toUpperCase();
 const cols=[
 when(row.settledAt??row.createdAt),safe(league,40),match||'—',market,
 select+line,fmtOdds(row.odds),result+' · '+score
 ];
 cols.forEach((txt,i)=>{
  const td=node('td',null,txt);
  if(i===6)td.dataset.result=result;
  tr.appendChild(td);
 });
 session.tbody.appendChild(tr);
 session.shown++;
}
async function page(session){
 const url=new URL('/api/engine/statistics',location.origin);
 url.searchParams.set('paged','1');
 if(session.cursor)url.searchParams.set('cursor',session.cursor);
 const response=await fetch(url,{headers:{Accept:'application/json'},
  cache:'no-store',signal:AbortSignal.timeout(35000)});
 window.__B46_STAGE_ARCHIVE_DIAG.apiCalls++;
 if(!response.ok)throw Error('HISTORY_HTTP_'+response.status);
 const data=await response.json();
 if(data?.ok!==true||!Array.isArray(data.rows)||data.rows.length>500||
    !Number.isSafeInteger(data.total)||!Number.isSafeInteger(data.ledgerTotal)||
    data.total>data.ledgerTotal||data.ledgerTotal<0||
    data.hasMore===true&&!data.nextCursor)throw Error('HISTORY_PAGE_SOURCE_INVALID');
 const current=signature(data);
 if(session.sourceSig&&session.sourceSig!==current)throw Error('HISTORY_SOURCE_CHANGED_REFRESH_TO_CONTINUE');
 session.sourceSig=current;
 session.total=data.total;
 const seenPage=new Set();
 session.buffer=data.rows.filter(r=>{
   const k=key(r);
   if(!k||seenPage.has(k)||session.seen.has(k)||!isSettled(r))return false;
   seenPage.add(k);session.seen.add(k);return true;
 });
 session.offset=0;
 const next=data.nextCursor||null;
 if(next&&session.visited.has(next))throw Error('HISTORY_CURSOR_LOOP');
 if(next)session.visited.add(next);
 session.cursor=next;
 window.__B46_STAGE_ARCHIVE_DIAG.buffered=session.buffer.length;
}
async function nextBatch(session){
 if(session.busy)return;
 session.busy=true;session.more.hidden=false;session.more.disabled=true;
 session.more.textContent='Loading archived results…';
 window.__B46_STAGE_ARCHIVE_DIAG.status='page-loading';
 try{
  const target=session.shown+50;
  let pages=0;
  while(session.shown<target){
   if(!session.host.isConnected)return;
   if(session.offset<session.buffer.length){
     renderRecord(session,session.buffer[session.offset++]);continue;
   }
   if(session.loaded&&!session.cursor)break;
   if(++pages>5)break;
   await page(session);session.loaded=true;
  }
  session.status.textContent='Showing '+session.shown.toLocaleString('en-US')+
    ' of '+(session.total??'?').toLocaleString('en-US')+
    ' settled records · Archived details only · Graph unchanged';
  session.more.hidden=session.offset>=session.buffer.length&&!session.cursor;
  session.more.textContent='Show 50 more results';
  window.__B46_STAGE_ARCHIVE_DIAG.status='history-visible';
  window.__B46_STAGE_ARCHIVE_DIAG.shown=session.shown;
 }catch(e){
  const reason=String(e.message||e);
  if(reason==='HISTORY_SOURCE_CHANGED_REFRESH_TO_CONTINUE'||reason==='HISTORY_CURSOR_LOOP'){
   session.tbody.replaceChildren();session.shown=0;session.loaded=false;session.offset=0;
   session.buffer=[];session.cursor=null;session.sourceSig=null;session.total=0;
   session.seen.clear();session.visited.clear();
   window.__B46_STAGE_ARCHIVE_DIAG.shown=0;
   window.__B46_STAGE_ARCHIVE_DIAG.buffered=0;
   session.status.textContent='Archived results changed. Reload the first 50 results to continue.';
   session.more.textContent='Reload archived results';
  }else{
   session.status.textContent='History unavailable. Retry to continue from the current page.';
   session.more.textContent='Retry archived results';
  }
  session.more.hidden=false;
  window.__B46_STAGE_ARCHIVE_DIAG.status='failed';
  window.__B46_STAGE_ARCHIVE_DIAG.error=reason.slice(0,150);
 }finally{session.busy=false;session.more.disabled=false}
}
window.__B46_STAGE_OPEN_ARCHIVE=(preview,launchButton)=>{
 if(!preview?.isConnected||session?.host===preview)return;
 css();
 const box=node('section');box.id='b46-stage-archive';box.setAttribute('aria-label','Archived settled signal results');
 const title=node('div','b46-stage-archive-title','SETTLED RESULTS · ARCHIVED HISTORY');
 const status=node('div','b46-stage-archive-status','Reading recent archived records…');
 const wrap=node('div','b46-stage-archive-table-wrap');
 const table=node('table'),thead=node('thead'),tr=node('tr');
 for(const label of ['Date','League','Match','Market','Selection','Odds','Result'])
   tr.appendChild(node('th',null,label));
 thead.appendChild(tr);
 const tbody=node('tbody');table.append(thead,tbody);wrap.appendChild(table);
 const more=node('button',null,'Show 50 more results');
 more.type='button';more.hidden=true;
 box.append(title,status,wrap,more);
 preview.appendChild(box);
 session={host:preview,box,status,tbody,more,shown:0,loaded:false,offset:0,
   buffer:[],cursor:null,sourceSig:null,total:0,seen:new Set(),visited:new Set(),busy:false};
 window.__B46_STAGE_ARCHIVE_DIAG.status='opening';
 launchButton?.remove();
 more.addEventListener('click',()=>nextBatch(session));
 void nextBatch(session);
};
})();`;
