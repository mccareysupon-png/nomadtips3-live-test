(()=>{
  'use strict';

  const PAGE_SIZE=50;
  const STATS_POLL_MS=15000;
  const LIVE_POLL_MS=10000;
  const LIVE_SCORE_V2_BASE='https://nomadtips3-live-score-feed-v2.mccarey-supon.workers.dev';

  const trigger=document.querySelector('.toolbar .tabs .statistics-link');
  const toolbar=trigger?.closest('.toolbar');
  const filterTabs=[...document.querySelectorAll('.toolbar .tabs .tab')];
  const matchPanel=document.querySelector('[data-signal-match-view]');
  const matchNote=document.querySelector('[data-signal-match-note]');
  const mirror=document.querySelector('#statisticsMirror');
  const tbody=mirror?.querySelector('[data-statistics-mirror-body]');
  const pager=mirror?.querySelector('[data-statistics-mirror-pager]');
  const resultSummary=mirror?.querySelector('[data-statistics-mirror-result-summary]');
  const note=mirror?.querySelector('[data-statistics-mirror-note]');
  const metricNodes={
    total:mirror?.querySelector('[data-statistics-mirror-total]'),
    winRate:mirror?.querySelector('[data-statistics-mirror-winrate]'),
    avgOdds:mirror?.querySelector('[data-statistics-mirror-avgodds]'),
    roi:mirror?.querySelector('[data-statistics-mirror-roi]'),
    wins:mirror?.querySelector('[data-statistics-mirror-wins]'),
    losses:mirror?.querySelector('[data-statistics-mirror-losses]'),
    pushes:mirror?.querySelector('[data-statistics-mirror-pushes]'),
    days:mirror?.querySelector('[data-statistics-mirror-days]'),
  };

  if(!trigger||!toolbar||!mirror||!tbody||!pager||!matchPanel||!matchNote)return;

  let active=false;
  let statsTimer=null;
  let liveTimer=null;
  let statsRunning=false;
  let liveRunning=false;
  let records=[];
  let liveById=new Map();
  let liveByTeams=new Map();
  let currentPage=1;

  const API=()=>window.NOMAD_RUNTIME?.engineBase||null;
  const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const pair=score=>`${score?.home??'—'}–${score?.away??'—'}`;
  const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
  const resultClass=result=>/WIN/.test(result||'')?'is-win':/LOSS/.test(result||'')?'is-loss':String(result||'').toUpperCase()==='PUSH'?'is-push':'';
  const compactNumber=value=>{
    const number=Number(value);
    if(!Number.isFinite(number))return '—';
    return Number.isInteger(number)?String(number):String(Number(number.toFixed(2)));
  };
  const signedNumber=value=>{
    const number=Number(value);
    if(!Number.isFinite(number))return '—';
    const text=compactNumber(number);
    return number>0?`+${text}`:text;
  };
  const fmtLine=value=>value==null?'—':`${Number(value)>0?'+':''}${Number(value).toFixed(2)}`;
  const oddsText=value=>{
    if(!finite(value))return '—';
    const formatter=window.NOMAD_ODDS_DISPLAY?.format;
    return typeof formatter==='function'?formatter(Number(value)):Number(value).toFixed(2);
  };
  const entryText=record=>{
    const score=pair(record?.entryScore);
    const minute=record?.minute;
    return minute!==null&&minute!==undefined&&minute!==''&&Number.isFinite(Number(minute))?`${score} · ${Math.trunc(Number(minute))}'`:score;
  };
  const when=value=>{
    try{
      const date=new Date(value);
      if(Number.isNaN(date.getTime()))return '—';
      const day=date.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'});
      const time=date.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
      return `${day} · ${time}`;
    }catch{return '—';}
  };
  const recordDay=record=>{
    const date=new Date(record?.lockedAt);
    return Number.isNaN(date.getTime())?null:date.toISOString().slice(0,10);
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
    return contiguous?`AH ${signedNumber(lines[0])}–${signedNumber(lines.at(-1))}`:`AH ${lines.map(signedNumber).join(',')}`;
  };
  const oddsRangeText=values=>{
    const min=compactNumber(values?.oddsMinimum);
    const maxEnabled=values?.oddsMaximumEnabled===true;
    const max=compactNumber(values?.oddsMaximum);
    return maxEnabled&&max!=='—'?`Odds ${min}–${max}`:`Odds ≥${min}`;
  };
  const conditionHtml=record=>{
    const values=record?.configSnapshot?.values||record?.configSnapshot?.config;
    if(!values||typeof values!=='object')return '<span class="statistics-mirror-condition-line">—</span>';
    const scoreDiff=values.scoreDifferenceFilterEnabled===true?`Score Diff ≤${compactNumber(values.maxScoreDifference)}`:'Score Diff OFF';
    const eventGate=values.homeEventRequired===false?'OFF':'ON';
    const evidenceMode=String(values.evidenceMode||'ANY').toUpperCase()==='ALL'?'ALL':'ANY';
    const oneSignal=values.oneSignalPerMatch===false?'OFF':'ON';
    const sideMode=['HOME','AWAY','BOTH'].includes(String(values.targetSideMode||'HOME').toUpperCase())?String(values.targetSideMode||'HOME').toUpperCase():'HOME';
    const lines=[
      `Minute R. ${compactNumber(values.minuteFrom)}–${compactNumber(values.minuteTo)} · R.Window ${compactNumber(values.rollingWindowMinutes)}m · ${scoreDiff}`,
      `Attack W. ${compactNumber(values.attackWeight)} · Danger.AT ${compactNumber(values.dangerousAttackWeight)} · Side P. ≥${compactNumber(values.homePressureShareMinimum)}% · Required ${compactNumber(values.trendConditionsRequired)}/3`,
      `Event Gate ${eventGate} · Shot On ${evidenceValue(values.sotEvidenceEnabled,values.sotDeltaMinimum)} · Shot Off ${evidenceValue(values.shotOffEvidenceEnabled,values.shotOffDeltaMinimum)} · Corner ${evidenceValue(values.cornerEvidenceEnabled,values.cornerDeltaMinimum)} · Evidence ${evidenceMode}`,
      `Side ${sideMode} · ${selectedAhText(values)} · ${oddsRangeText(values)}`,
      `Max Price Age ${compactNumber(values.maximumPriceAgeSeconds)}s · One Signal/Match ${oneSignal}`,
    ];
    return lines.map(line=>`<span class="statistics-mirror-condition-line">${esc(line)}</span>`).join('');
  };
  const summarize=items=>{
    const settled=items.filter(item=>item?.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>String(item.settlement?.result||'').toUpperCase()==='PUSH').length;
    const decided=wins+losses;
    const profit=settled.reduce((total,item)=>total+(Number(item.settlement?.profit)||0),0);
    const avgOdds=items.length?items.reduce((total,item)=>total+(Number(item?.odds)||0),0)/items.length:0;
    return {
      total:items.length,
      settled:settled.length,
      wins,losses,pushes,
      days:new Set(items.map(recordDay).filter(Boolean)).size,
      winRate:decided?wins/decided*100:0,
      avgOdds,
      roi:settled.length?profit/settled.length*100:0,
    };
  };
  const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value);};
  const recordReference=record=>`${record?.oddsSource||'—'} · ${record?.bookmaker||'—'}`;
  const rowHtml=(record,index)=>{
    const settlement=record?.settlement;
    const result=settlement?.result||'PENDING';
    const cls=resultClass(result);
    const finalScore=settlement?.finalScore;
    const profit=settlement?`${Number(settlement.profit)>=0?'+':''}${Number(settlement.profit||0).toFixed(2)}u`:'—';
    return `<tr data-statistics-mirror-record-index="${index}"><td>${record?.lockedAt?when(record.lockedAt):'—'}</td><td>${esc(record?.home||'—')} — ${esc(record?.away||'—')}</td><td class="statistics-mirror-condition">${conditionHtml(record)}</td><td>${esc(String(record?.selection||'').toUpperCase())}</td><td>${fmtLine(record?.line)}</td><td data-statistics-mirror-odds="${finite(record?.odds)?Number(record.odds):''}">${oddsText(record?.odds)}</td><td>${esc(recordReference(record))}</td><td>${entryText(record)}</td><td data-statistics-mirror-final>${finalScore?pair(finalScore):'—'}</td><td class="${cls}">${esc(result)}</td><td class="${cls}">${profit}</td></tr>`;
  };

  const pageSequence=(total,current)=>{
    if(total<=7)return Array.from({length:total},(_,index)=>index+1);
    const keep=new Set([1,total,current,current-1,current+1]);
    if(current<=3)[2,3,4].forEach(page=>keep.add(page));
    if(current>=total-2)[total-3,total-2,total-1].forEach(page=>keep.add(page));
    const pages=[...keep].filter(page=>page>=1&&page<=total).sort((a,b)=>a-b);
    const output=[];
    pages.forEach((page,index)=>{if(index&&page-pages[index-1]>1)output.push('…');output.push(page);});
    return output;
  };
  const pageButton=(label,page,options={})=>`<button type="button" class="statistics-mirror-page-button${options.active?' is-active':''}" data-statistics-mirror-page="${page}"${options.disabled?' disabled':''}${options.active?' aria-current="page"':''}>${label}</button>`;
  const renderPager=()=>{
    const totalRows=records.length;
    const totalPages=Math.max(1,Math.ceil(totalRows/PAGE_SIZE));
    currentPage=Math.min(Math.max(1,currentPage),totalPages);
    if(totalRows<=PAGE_SIZE){pager.innerHTML='';pager.hidden=true;return;}
    const start=((currentPage-1)*PAGE_SIZE)+1;
    const end=Math.min(totalRows,currentPage*PAGE_SIZE);
    const numbered=pageSequence(totalPages,currentPage).map(item=>item==='…'?'<span class="statistics-mirror-page-summary">…</span>':pageButton(String(item),item,{active:item===currentPage})).join('');
    pager.hidden=false;
    pager.innerHTML=`<span class="statistics-mirror-page-summary">${start}–${end} / ${totalRows}</span><span class="statistics-mirror-page-controls">${pageButton('Previous',currentPage-1,{disabled:currentPage===1})}${numbered}${pageButton('Next',currentPage+1,{disabled:currentPage===totalPages})}</span>`;
  };
  const applyLiveRows=()=>{
    if(!active||!records.length)return;
    mirror.querySelectorAll('tr[data-statistics-mirror-record-index]').forEach(row=>{
      const index=Number(row.dataset.statisticsMirrorRecordIndex);
      const record=records[index];
      const cell=row.querySelector('[data-statistics-mirror-final]');
      if(!record||!cell)return;
      const result=String(record?.settlement?.result||'').toUpperCase();
      if(record?.settlement&&result&&result!=='PENDING'){
        cell.textContent=record.settlement?.finalScore?pair(record.settlement.finalScore):'—';
        cell.classList.remove('statistics-mirror-live-score');
        return;
      }
      let live=null;
      if(record?.matchId!==null&&record?.matchId!==undefined&&record?.matchId!=='')live=liveById.get(String(record.matchId))||null;
      if(!live)live=liveByTeams.get(teamKey(record?.home,record?.away))||null;
      const home=Array.isArray(live?.score)?live.score[0]:live?.score?.home;
      const away=Array.isArray(live?.score)?live.score[1]:live?.score?.away;
      if(!live||live?.freshness?.stale||!finite(home)||!finite(away)||!finite(live?.minute)){
        cell.textContent='—';
        cell.classList.remove('statistics-mirror-live-score');
        return;
      }
      cell.textContent=`${Number(home)}–${Number(away)} · ${Math.max(0,Math.trunc(Number(live.minute)))}'`;
      cell.classList.add('statistics-mirror-live-score');
    });
  };
  const renderRows=()=>{
    if(!records.length){
      tbody.innerHTML='<tr><td colspan="11">No locked signals yet.</td></tr>';
      renderPager();
      return;
    }
    const first=(currentPage-1)*PAGE_SIZE;
    const pageRecords=records.slice(first,first+PAGE_SIZE);
    tbody.innerHTML=pageRecords.map((record,offset)=>rowHtml(record,first+offset)).join('');
    renderPager();
    applyLiveRows();
  };
  const renderSummary=()=>{
    const stats=summarize(records);
    setText(metricNodes.total,stats.total);
    setText(metricNodes.winRate,`${stats.winRate.toFixed(1)}%`);
    setText(metricNodes.avgOdds,stats.total?oddsText(stats.avgOdds):'—');
    setText(metricNodes.roi,`${stats.roi>=0?'+':''}${stats.roi.toFixed(1)}%`);
    setText(metricNodes.wins,stats.wins);
    setText(metricNodes.losses,stats.losses);
    setText(metricNodes.pushes,stats.pushes);
    setText(metricNodes.days,stats.days);
    setText(resultSummary,`WIN ${stats.wins} · LOSS ${stats.losses} · PUSH ${stats.pushes}`);
    setText(note,`Statistics mirror connected · ${stats.settled} settled public records.`);
  };
  const renderAll=()=>{renderSummary();renderRows();};

  async function loadStatistics(){
    if(!active||statsRunning)return;
    const base=API();
    if(!base){setText(note,'Statistics mirror unavailable: runtime endpoint missing.');return;}
    statsRunning=true;
    try{
      const response=await fetch(`${base}/statistics`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      records=Array.isArray(data?.records)?data.records:[];
      const totalPages=Math.max(1,Math.ceil(records.length/PAGE_SIZE));
      currentPage=Math.min(currentPage,totalPages);
      renderAll();
    }catch{
      setText(note,'Statistics mirror connection temporarily unavailable.');
    }finally{statsRunning=false;}
  }

  async function loadLive(){
    if(!active||liveRunning)return;
    liveRunning=true;
    try{
      const response=await fetch(`${LIVE_SCORE_V2_BASE}/feed`,{cache:'no-store'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const data=await response.json();
      if(String(data?.version)!=='3.42'||!Array.isArray(data?.matches))throw new Error('invalid live feed contract');
      const byId=new Map();
      const byTeams=new Map();
      for(const match of data.matches){
        if(match?.freshness?.stale)continue;
        const home=Array.isArray(match?.score)?match.score[0]:match?.score?.home;
        const away=Array.isArray(match?.score)?match.score[1]:match?.score?.away;
        if(!finite(home)||!finite(away)||!finite(match?.minute))continue;
        if(match?.id!==null&&match?.id!==undefined&&match?.id!=='')byId.set(String(match.id),match);
        const key=teamKey(match?.home,match?.away);
        if(key!=='|')byTeams.set(key,byTeams.has(key)?null:match);
      }
      liveById=byId;
      liveByTeams=byTeams;
      applyLiveRows();
    }catch{
      liveById=new Map();
      liveByTeams=new Map();
      applyLiveRows();
    }finally{liveRunning=false;}
  }

  const stopTimers=()=>{
    if(statsTimer){clearInterval(statsTimer);statsTimer=null;}
    if(liveTimer){clearInterval(liveTimer);liveTimer=null;}
  };
  const startTimers=()=>{
    stopTimers();
    loadStatistics();
    loadLive();
    statsTimer=setInterval(loadStatistics,STATS_POLL_MS);
    liveTimer=setInterval(loadLive,LIVE_POLL_MS);
  };
  const setView=next=>{
    const show=next==='statistics';
    if(show===active)return;
    active=show;
    toolbar.classList.toggle('statistics-view-active',show);
    trigger.dataset.active=show?'1':'0';
    trigger.setAttribute('aria-pressed',show?'true':'false');
    matchPanel.classList.toggle('statistics-mirror-hidden',show);
    matchNote.classList.toggle('statistics-mirror-hidden',show);
    mirror.hidden=!show;
    if(show){
      currentPage=1;
      startTimers();
      requestAnimationFrame(()=>mirror.scrollIntoView({block:'nearest'}));
    }else stopTimers();
  };

  trigger.addEventListener('click',event=>{
    event.preventDefault();
    setView('statistics');
  });
  filterTabs.forEach(tab=>tab.addEventListener('click',()=>setView('matches')));
  pager.addEventListener('click',event=>{
    const button=event.target.closest('[data-statistics-mirror-page]');
    if(!button||button.disabled)return;
    const next=Number(button.dataset.statisticsMirrorPage);
    const totalPages=Math.max(1,Math.ceil(records.length/PAGE_SIZE));
    if(!Number.isInteger(next)||next<1||next>totalPages||next===currentPage)return;
    currentPage=next;
    renderRows();
    mirror.querySelector('.statistics-mirror-panel')?.scrollIntoView({block:'start',behavior:'smooth'});
  });
  window.addEventListener('nomad:odds-display-change',()=>{if(active)renderAll();});
  window.addEventListener('beforeunload',stopTimers,{once:true});

  trigger.dataset.active='0';
  trigger.setAttribute('aria-pressed','false');
})();
