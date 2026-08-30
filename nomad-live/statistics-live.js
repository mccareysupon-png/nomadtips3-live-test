(()=>{
  const API=window.NOMAD_RUNTIME?.engineBase;
  if(!API){console.error('NOMAD runtime engine URL is unavailable');return;}
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pair=p=>`${p?.home??'—'}–${p?.away??'—'}`;
  const entry=r=>{const score=pair(r?.entryScore);const minute=r?.minute;return minute!==null&&minute!==undefined&&minute!==''&&Number.isFinite(Number(minute))?`${score} · ${Math.trunc(Number(minute))}'`:score;};
  const fmtLine=v=>v==null?'—':`${Number(v)>0?'+':''}${Number(v).toFixed(2)}`;
  const fmtOdds=v=>v==null?'—':Number(v).toFixed(2);
  const when=s=>{try{const d=new Date(s);if(Number.isNaN(d.getTime()))return '—';const date=d.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'});const time=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});return `${date} · ${time}`;}catch{return '—'}};
  const clsResult=r=>/WIN/.test(r||'')?'win':/LOSS/.test(r||'')?'loss':'';
  const recordBookmaker=r=>r?.bookmaker||'—';
  const compactNumber=value=>{
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    return Number.isInteger(n)?String(n):String(Number(n.toFixed(2)));
  };
  const signedNumber=value=>{
    const n=Number(value);
    if(!Number.isFinite(n))return '—';
    const text=compactNumber(n);
    return n>0?`+${text}`:text;
  };
  const evidenceValue=(enabled,minimum)=>enabled===false?'OFF':compactNumber(minimum??1);
  const selectedAhText=values=>{
    const mode=String(values?.allowedLinesMode||'ANY').toUpperCase();
    if(mode!=='SELECTED')return 'AH ANY';
    const raw=Array.isArray(values?.allowedSelectionLines)?values.allowedSelectionLines:[];
    const lines=[...new Set(raw.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
    if(!lines.length)return 'AH SELECTED';
    if(lines.length===1)return `AH ${signedNumber(lines[0])}`;
    const contiguous=lines.every((value,index)=>index===0||Math.abs(value-lines[index-1]-.25)<1e-9);
    if(contiguous)return `AH ${signedNumber(lines[0])}–${signedNumber(lines.at(-1))}`;
    return `AH ${lines.map(signedNumber).join(',')}`;
  };
  const oddsRangeText=values=>{
    const min=compactNumber(values?.oddsMinimum);
    const maxEnabled=values?.oddsMaximumEnabled===true;
    const max=compactNumber(values?.oddsMaximum);
    return maxEnabled&&max!=='—'?`Odds ${min}–${max}`:`Odds ≥${min}`;
  };
  const conditionHtml=r=>{
    const values=r?.configSnapshot?.values||r?.configSnapshot?.config;
    if(!values||typeof values!=='object')return '<span class="condition-empty">—</span>';
    const scoreDiff=values.scoreDifferenceFilterEnabled===true?`Score Diff ≤${compactNumber(values.maxScoreDifference)}`:'Score Diff OFF';
    const homeEvent=values.homeEventRequired===false?'OFF':'ON';
    const evidenceMode=String(values.evidenceMode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
    const oneSignal=values.oneSignalPerMatch===false?'OFF':'ON';
    const lines=[
      {text:`Minute R. ${compactNumber(values.minuteFrom)}–${compactNumber(values.minuteTo)} · R.Window ${compactNumber(values.rollingWindowMinutes)}m · ${scoreDiff}`},
      {text:`Attack W. ${compactNumber(values.attackWeight)} · Danger.AT ${compactNumber(values.dangerousAttackWeight)} · H.P. ≥${compactNumber(values.homePressureShareMinimum)}% · Required ${compactNumber(values.trendConditionsRequired)}/3`},
      {text:`HOME Event ${homeEvent} · Shot On ${evidenceValue(values.sotEvidenceEnabled,values.sotDeltaMinimum)} · Shot Off ${evidenceValue(values.shotOffEvidenceEnabled,values.shotOffDeltaMinimum)} · Corner ${evidenceValue(values.cornerEvidenceEnabled,values.cornerDeltaMinimum)} · Evidence ${evidenceMode}`},
      {text:`${selectedAhText(values)} · ${oddsRangeText(values)}`,market:true},
      {text:`Max Price Age ${compactNumber(values.maximumPriceAgeSeconds)}s · One Signal/Match ${oneSignal}`},
    ];
    return lines.map(line=>`<span class="condition-line${line.market?' condition-line-market':''}">${esc(line.text)}</span>`).join('');
  };
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
    return `<tr><td>${r.lockedAt?when(r.lockedAt):'—'}</td><td>${esc(r.home)} — ${esc(r.away)}</td><td class="condition-cell">${conditionHtml(r)}</td><td>${esc((r.selection||'').toUpperCase())}</td><td>${fmtLine(r.line)}</td><td class="odds-cell">${fmtOdds(r.odds)}</td><td>${esc(recordBookmaker(r))}</td><td>${entry(r)}</td><td>${fin?pair(fin):'—'}</td><td class="${c}">${esc(res)}</td><td class="${c}">${r.settlement?`${r.settlement.profit>=0?'+':''}${Number(r.settlement.profit).toFixed(2)}u`:'—'}</td></tr>`;
  };
  const summarizeRecords=records=>{
    const settled=records.filter(item=>item?.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    const profit=settled.reduce((total,item)=>total+(Number(item.settlement?.profit)||0),0);
    const avgOdds=records.length?records.reduce((total,item)=>total+(Number(item?.odds)||0),0)/records.length:0;
    return {
      totalSignals:records.length,
      settled:settled.length,
      wins,losses,pushes,
      winRate:settled.length?wins/settled.length*100:0,
      avgOdds,
      profit,
      roi:settled.length?profit/settled.length*100:0
    };
  };

  const load=async()=>{
    try{
      if(firstLoad)setSource('RESULT LEDGER · CONNECTING',false);
      const r=await fetch(API+'/statistics',{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const d=await r.json();
      const records=Array.isArray(d.records)?d.records:[];
      const publicStats=summarizeRecords(records);
      const rowsHtml=records.length?records.map(rowHtml).join(''):'<tr><td colspan="11">No locked signals yet.</td></tr>';
      const summaryKey=JSON.stringify(publicStats);

      if(rowsHtml!==lastRowsHtml){
        tbody.innerHTML=rowsHtml;
        lastRowsHtml=rowsHtml;
      }
      if(summaryKey!==lastSummaryKey){
        setText(metrics[0],publicStats.totalSignals);
        setText(metrics[1],`${Number(publicStats.winRate).toFixed(1)}%`);
        setText(metrics[2],publicStats.totalSignals?Number(publicStats.avgOdds).toFixed(2):'—');
        setText(metrics[3],`${Number(publicStats.roi)>=0?'+':''}${Number(publicStats.roi).toFixed(1)}%`);
        setText(muted,`WIN ${publicStats.wins} · LOSS ${publicStats.losses} · PUSH ${publicStats.pushes}`);
        setText(note,`Statistics connected · ${publicStats.settled} settled public records.`);
        lastSummaryKey=summaryKey;
      }
      window.dispatchEvent(new CustomEvent('nomad:statistics-records',{detail:{records}}));
      setSource(`RESULT LEDGER · ${String(window.NOMAD_RUNTIME?.environment||'live').toUpperCase()}`,true);
      firstLoad=false;
    }catch(e){
      setText(note,'Statistics connection temporarily unavailable.');
      setSource('RESULT LEDGER · OFFLINE',false);
      firstLoad=false;
    }
  };

  load();
  setInterval(load,15000);
})();
