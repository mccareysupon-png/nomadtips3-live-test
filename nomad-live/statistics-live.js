(()=>{
  const API='https://nomadtips3-live-engine-5dollar.mccarey-supon.workers.dev';
  const RESET_AT='2026-08-23T08:02:00.000Z'; // 23 Aug 2026 15:02 Thailand
  const RESET_LABEL='23 Aug · 15:02';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pair=p=>`${p?.home??'—'}–${p?.away??'—'}`;
  const fmtLine=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toFixed(2)}`;
  const fmtOdds=v=>v==null?'—':Number(v).toFixed(2);
  const when=s=>{try{return new Date(s).toLocaleString([], {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
  const clsResult=r=>/WIN/.test(r||'')?'win':/LOSS/.test(r||'')?'loss':'';
  const recordSource=r=>`${r?.bookmaker||'—'} · ${r?.oddsSource||'—'}`;
  const stamp=r=>{const t=Date.parse(r?.lockedAt||'');return Number.isFinite(t)?t:null;};
  const metrics=[...document.querySelectorAll('.summary-grid .metric strong')];
  const tbody=document.querySelector('.data-table tbody');
  const muted=document.querySelector('.panel-head .muted');
  const note=document.querySelector('main > .note');
  const pill=document.querySelector('.source-pill');
  if(!tbody)return;
  const setSource=(text,ok=true)=>{if(!pill)return;pill.innerHTML=`<span class="dot" style="${ok?'':'background:#f2d21b;box-shadow:none'}"></span>${esc(text)}`;};
  const newLedgerRecords=records=>{
    const reset=Date.parse(RESET_AT);
    const dated=records.filter(r=>stamp(r)!=null);
    const after=dated.filter(r=>stamp(r)>=reset);
    const latestBefore=dated.filter(r=>stamp(r)<reset).sort((a,b)=>stamp(b)-stamp(a))[0]||null;
    const merged=latestBefore?[latestBefore,...after]:after;
    const seen=new Set();
    return merged.filter(r=>{
      const key=String(r?.id??`${r?.lockedAt}|${r?.home}|${r?.away}|${r?.line}|${r?.odds}`);
      if(seen.has(key))return false;
      seen.add(key);return true;
    }).sort((a,b)=>(stamp(b)||0)-(stamp(a)||0));
  };
  const summarize=records=>{
    const settled=records.filter(r=>String(r?.settlement?.result||'PENDING').toUpperCase()!=='PENDING');
    const results=settled.map(r=>String(r?.settlement?.result||'').toUpperCase());
    const wins=results.filter(r=>r.includes('WIN')).length;
    const losses=results.filter(r=>r.includes('LOSS')).length;
    const pushes=results.filter(r=>r.includes('PUSH')||r==='DRAW').length;
    const odds=records.map(r=>Number(r?.odds)).filter(Number.isFinite);
    const avgOdds=odds.length?odds.reduce((a,b)=>a+b,0)/odds.length:null;
    const profit=settled.reduce((sum,r)=>sum+(Number.isFinite(Number(r?.settlement?.profit))?Number(r.settlement.profit):0),0);
    const winRate=settled.length?(wins/settled.length)*100:0;
    const roi=settled.length?(profit/settled.length)*100:0;
    return {total:records.length,settled:settled.length,wins,losses,pushes,avgOdds,winRate,roi};
  };
  const load=async()=>{
    try{
      setSource('RESULT LEDGER · CONNECTING',false);
      const r=await fetch(API+'/statistics',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const records=newLedgerRecords(Array.isArray(d.records)?d.records:[]);
      const s=summarize(records);
      if(metrics[0])metrics[0].textContent=s.total;
      if(metrics[1])metrics[1].textContent=`${s.winRate.toFixed(1)}%`;
      if(metrics[2])metrics[2].textContent=s.avgOdds!=null?s.avgOdds.toFixed(2):'—';
      if(metrics[3])metrics[3].textContent=`${s.roi>=0?'+':''}${s.roi.toFixed(1)}%`;
      tbody.innerHTML=records.length?records.map(r=>{
        const fin=r.settlement?.finalScore;
        const res=r.settlement?.result||'PENDING';
        const c=clsResult(res);
        return `<tr><td>${r.lockedAt?when(r.lockedAt):'—'}</td><td>${esc(r.home)} — ${esc(r.away)}</td><td>${esc((r.selection||'').toUpperCase())}</td><td>${fmtLine(r.line)}</td><td>${fmtOdds(r.odds)}</td><td>${esc(recordSource(r))}</td><td>${pair(r.entryScore)}</td><td>${fin?pair(fin):'—'}</td><td class="${c}">${esc(res)}</td><td class="${c}">${r.settlement?`${r.settlement.profit>=0?'+':''}${Number(r.settlement.profit).toFixed(2)}u`:'—'}</td></tr>`;
      }).join(''):'<tr><td colspan="10">Waiting for first locked signal in the new ledger.</td></tr>';
      if(muted)muted.textContent=`WIN ${s.wins} · LOSS ${s.losses} · PUSH ${s.pushes}`;
      if(note)note.textContent=`New ledger started ${RESET_LABEL} · latest locked signal at reset is retained · ${s.settled} settled.`;
      setSource('RESULT LEDGER · NEW · LIVE',true);
    }catch(e){
      if(note)note.textContent=`Statistics connection unavailable: ${e.message}`;
      setSource('RESULT LEDGER · OFFLINE',false);
    }
  };
  load();
  setInterval(load,15000);
})();
