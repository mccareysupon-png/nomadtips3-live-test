(()=>{
  const API='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pair=p=>`${p?.home??'—'}–${p?.away??'—'}`;
  const fmtLine=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toFixed(2)}`;
  const fmtOdds=v=>v==null?'—':Number(v).toFixed(2);
  const when=s=>{try{return new Date(s).toLocaleString([], {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
  const clsResult=r=>/WIN/.test(r||'')?'win':/LOSS/.test(r||'')?'loss':'';
  const recordSource=r=>`${r?.bookmaker||'—'} · ${r?.oddsSource||'—'}`;
  const metrics=[...document.querySelectorAll('.summary-grid .metric strong')];
  const tbody=document.querySelector('.data-table tbody');
  const muted=document.querySelector('.panel-head .muted');
  const note=document.querySelector('main > .note');
  const pill=document.querySelector('.source-pill');
  if(!tbody)return;

  let firstLoad=true;
  let lastRowsHtml='';
  let lastSummaryKey='';

  const setSource=(text,ok=true)=>{
    if(!pill)return;
    const next=`<span class="dot" style="${ok?'':'background:#f2d21b;box-shadow:none'}"></span>${esc(text)}`;
    if(pill.innerHTML!==next)pill.innerHTML=next;
  };
  const setText=(node,value)=>{
    if(!node)return;
    const next=String(value);
    if(node.textContent!==next)node.textContent=next;
  };
  const rowHtml=r=>{
    const fin=r.settlement?.finalScore;
    const res=r.settlement?.result||'PENDING';
    const c=clsResult(res);
    return `<tr><td>${r.lockedAt?when(r.lockedAt):'—'}</td><td>${esc(r.home)} — ${esc(r.away)}</td><td>${esc((r.selection||'').toUpperCase())}</td><td>${fmtLine(r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${esc(recordSource(r))}</td><td>${pair(r.entryScore)}</td><td>${fin?pair(fin):'—'}</td><td class="${c}">${esc(res)}</td><td class="${c}">${r.settlement?`${r.settlement.profit>=0?'+':''}${Number(r.settlement.profit).toFixed(2)}u`:'—'}</td></tr>`;
  };

  const load=async()=>{
    try{
      if(firstLoad)setSource('RESULT LEDGER · CONNECTING',false);
      const r=await fetch(API+'/statistics',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const records=Array.isArray(d.records)?d.records:[];
      const rowsHtml=records.length?records.map(rowHtml).join(''):'<tr><td colspan="10">No locked signals yet.</td></tr>';
      const summaryKey=JSON.stringify({
        totalSignals:d.totalSignals??0,winRate:Number(d.winRate||0),avgOdds:d.avgOdds??null,roi:Number(d.roi||0),
        wins:d.wins||0,losses:d.losses||0,pushes:d.pushes||0,settled:d.settled||0
      });

      if(rowsHtml!==lastRowsHtml){
        tbody.innerHTML=rowsHtml;
        lastRowsHtml=rowsHtml;
      }
      if(summaryKey!==lastSummaryKey){
        setText(metrics[0],d.totalSignals??0);
        setText(metrics[1],`${Number(d.winRate||0).toFixed(1)}%`);
        setText(metrics[2],d.avgOdds!=null?Number(d.avgOdds).toFixed(2):'—');
        setText(metrics[3],`${Number(d.roi||0)>=0?'+':''}${Number(d.roi||0).toFixed(1)}%`);
        setText(muted,`WIN ${d.wins||0} · LOSS ${d.losses||0} · PUSH ${d.pushes||0}`);
        setText(note,`Statistics connected · ${d.settled||0} settled records.`);
        lastSummaryKey=summaryKey;
      }
      setSource('RESULT LEDGER · LIVE',true);
      firstLoad=false;
    }catch(e){
      setText(note,`Statistics connection unavailable: ${e.message}`);
      setSource('RESULT LEDGER · OFFLINE',false);
      firstLoad=false;
    }
  };

  load();
  setInterval(load,15000);
})();
