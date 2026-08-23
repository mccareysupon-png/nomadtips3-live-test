(()=>{
  const API='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
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
  const setSource=(text,ok=true)=>{if(!pill)return;pill.innerHTML=`<span class="dot" style="${ok?'':'background:#f2d21b;box-shadow:none'}"></span>${esc(text)}`;};
  const load=async()=>{
    try{
      setSource('RESULT LEDGER · CONNECTING',false);
      const r=await fetch(API+'/statistics',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      if(metrics[0])metrics[0].textContent=d.totalSignals??0;
      if(metrics[1])metrics[1].textContent=`${Number(d.winRate||0).toFixed(1)}%`;
      if(metrics[2])metrics[2].textContent=d.avgOdds?Number(d.avgOdds).toFixed(2):'—';
      if(metrics[3])metrics[3].textContent=`${Number(d.roi||0)>=0?'+':''}${Number(d.roi||0).toFixed(1)}%`;
      tbody.innerHTML=(d.records||[]).length?d.records.map(r=>{
        const fin=r.settlement?.finalScore;
        const res=r.settlement?.result||'PENDING';
        const c=clsResult(res);
        return `<tr><td>${r.lockedAt?when(r.lockedAt):'—'}</td><td>${esc(r.home)} — ${esc(r.away)}</td><td>${esc((r.selection||'').toUpperCase())}</td><td>${fmtLine(r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${esc(recordSource(r))}</td><td>${pair(r.entryScore)}</td><td>${fin?pair(fin):'—'}</td><td class="${c}">${esc(res)}</td><td class="${c}">${r.settlement?`${r.settlement.profit>=0?'+':''}${Number(r.settlement.profit).toFixed(2)}u`:'—'}</td></tr>`;
      }).join(''):'<tr><td colspan="10">No locked signals yet.</td></tr>';
      if(muted)muted.textContent=`WIN ${d.wins||0} · LOSS ${d.losses||0} · PUSH ${d.pushes||0}`;
      if(note)note.textContent=`Statistics connected · ${d.settled||0} settled records.`;
      setSource('RESULT LEDGER · LIVE',true);
    }catch(e){
      if(note)note.textContent=`Statistics connection unavailable: ${e.message}`;
      setSource('RESULT LEDGER · OFFLINE',false);
    }
  };
  load();
  setInterval(load,15000);
})();
