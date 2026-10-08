const MARKET_ORDER = ['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
const state = {market:'ALL',status:'ALL',query:'',payload:null};

const qs = s => document.querySelector(s);
const tabs = qs('#marketTabs');
const summary = qs('#dailySummary');
const rowsEl = qs('#signalRows');
const empty = qs('#emptyState');

function node(tag,cls,text){
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(text!==undefined) el.textContent=text;
  return el;
}

function fmtPct(v){return v==null?'—':Number(v).toFixed(1)+'%'}
function fmtPnl(v){
  const n=Number(v||0);
  return (n>0?'+':'')+n.toFixed(2)+'u';
}
function resultClass(result){
  if(result==='WIN'||result==='HALF_WIN') return 'win';
  if(result==='LOSS'||result==='HALF_LOSS') return 'loss';
  return 'pending';
}
function statusClass(status){
  if(status==='LIVE') return 'live';
  if(status==='FINISHED') return 'win';
  return 'pending';
}
function currentStats(){
  return state.payload?.summary?.[state.market]||{
    signals:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,winRate:null,pnl:0
  };
}

function renderTabs(){
  tabs.replaceChildren();
  for(const market of MARKET_ORDER){
    const s=state.payload.summary[market];
    const btn=node('button','market-tab'+(state.market===market?' active':''));
    btn.type='button';
    btn.append(document.createTextNode(market+' '+fmtPct(s.winRate)+' '));
    const pnl=node('span',s.pnl>=0?'profit':'loss',fmtPnl(s.pnl));
    btn.append(pnl);
    btn.addEventListener('click',()=>{state.market=market;render();});
    tabs.append(btn);
  }
}

function renderSummary(){
  const s=currentStats();
  const items=[
    ['SIGNALS',s.signals],
    ['WIN',s.win],
    ['LOSS',s.loss],
    ['PUSH',s.push],
    ['HALF WIN',s.halfWin],
    ['HALF LOSS',s.halfLoss],
    ['PENDING',s.pending],
    ['WIN RATE',fmtPct(s.winRate)]
  ];
  summary.replaceChildren();
  for(const [label,value] of items){
    const box=node('div','stat');
    box.append(node('span','',label),node('b','',String(value)));
    summary.append(box);
  }
  const pnlBox=node('div','stat');
  pnlBox.append(node('span','','P/L TODAY'),node('b','pnl '+(s.pnl>=0?'pos':'neg'),fmtPnl(s.pnl)));
  summary.append(pnlBox);
}

function filteredRows(){
  const q=state.query.trim().toLowerCase();
  return state.payload.signals.filter(row=>{
    if(state.market!=='ALL' && row.market!==state.market) return false;
    if(state.status!=='ALL' && row.state!==state.status) return false;
    if(q){
      const hay=[row.home,row.away,row.league,row.bookmaker,row.market,row.selection].join(' ').toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function td(text,cls){
  const cell=node('td',cls||'');
  cell.textContent=text??'—';
  return cell;
}

function renderRows(){
  const rows=filteredRows();
  rowsEl.replaceChildren();
  empty.hidden=rows.length>0;
  for(const row of rows){
    const tr=document.createElement('tr');
    tr.append(td(row.signalTime));

    const match=node('td','match');
    match.append(node('strong','',row.home+' - '+row.away),node('small','',row.league));
    tr.append(match);

    const st=document.createElement('td');
    st.append(node('span','badge '+statusClass(row.state),row.state+(row.state==='LIVE'?' '+row.matchMinute+"'":'')));
    tr.append(st);

    tr.append(td(row.market));
    tr.append(td((row.selection||'')+(row.line&&row.line!=='—'?' '+row.line:'')));
    tr.append(td('@'+Number(row.odds).toFixed(2)));
    tr.append(td(row.signalMinute+"'"));
    tr.append(td(row.bookmaker));

    const result=document.createElement('td');
    result.append(node('span','badge '+resultClass(row.result),row.result.replace('_',' ')));
    tr.append(result);

    const p=Number(row.pnl||0);
    tr.append(td(fmtPnl(p),'pnl '+(p>=0?'pos':'neg')));
    rowsEl.append(tr);
  }
}

function render(){renderTabs();renderSummary();renderRows();}

async function boot(){
  const [sessionRes,dailyRes]=await Promise.all([
    fetch('/api/member/session',{cache:'no-store'}),
    fetch('/api/member/daily',{cache:'no-store'})
  ]);
  const session=await sessionRes.json();
  if(!sessionRes.ok || !session?.authenticated || session?.member?.status!=='ACTIVE'){
    location.replace('/pricing');
    return;
  }
  const daily=await dailyRes.json();
  if(!dailyRes.ok || daily?.ok!==true) throw new Error('DAILY_FEED_UNAVAILABLE');

  qs('#memberName').textContent=session.member.displayName;
  qs('#memberAvatar').textContent=session.member.displayName.slice(0,1).toUpperCase();
  qs('#memberStatus').textContent='MEMBER · '+session.member.status;
  state.payload=daily;
  render();
}

qs('#statusFilter')?.addEventListener('change',e=>{state.status=e.target.value;renderRows();});
qs('#searchInput')?.addEventListener('input',e=>{state.query=e.target.value;renderRows();});

boot().catch(()=>{
  rowsEl.replaceChildren();
  empty.hidden=false;
  empty.textContent='Member Signal Center is temporarily unavailable.';
});
