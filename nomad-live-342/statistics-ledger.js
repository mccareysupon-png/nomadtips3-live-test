(()=>{
'use strict';
const runtime=window.NOMAD342_LEDGER_RUNTIME||{};
const base=String(runtime.base||'').replace(/\/$/,'');
const tbody=document.getElementById('statsRows');
const status=document.getElementById('statsStatus');
const metrics={
  roi:document.getElementById('statsRoi'),
  profit:document.getElementById('statsProfit'),
  total:document.getElementById('statsTotal'),
  day:document.getElementById('statsDay'),
  win:document.getElementById('statsWin'),
  loss:document.getElementById('statsLoss'),
  draw:document.getElementById('statsDraw'),
  avgOdds:document.getElementById('statsAvgOdds'),
  winRate:document.getElementById('statsWinRate')
};
let timer=null,busy=false;
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const finite=value=>{if(value===null||value===undefined||value===''||typeof value==='boolean')return null;const n=Number(value);return Number.isFinite(n)?n:null};
const pair=value=>`${value?.home??'—'}–${value?.away??'—'}`;
const when=value=>{try{return new Date(value).toLocaleString('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return '—'}};
const fmtOdds=value=>{const n=finite(value);if(n===null)return'—';const formatter=window.NOMAD342_ODDS_DISPLAY?.format;return typeof formatter==='function'?formatter(n):n.toFixed(2);};
const fmtDecimal=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtLine=value=>{const n=finite(value);if(n===null)return'—';if(Math.abs(n)<1e-9)return'0.0';const abs=Math.abs(n);const digits=Number.isInteger(abs)?1:2;return `${n>0?'+':'-'}${abs.toFixed(digits)}`;};
const fmtRawHk=value=>{const n=finite(value);return n===null?'—':n.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');};
const fmtProfit=value=>finite(value)===null?'—':`${finite(value)>0?'+':''}${finite(value).toFixed(2)}u`;
const resultClass=result=>`result-${String(result||'PENDING').toLowerCase()}`;
const displayResult=result=>String(result||'PENDING').toUpperCase()==='PUSH'?'DRAW':String(result||'PENDING').toUpperCase().replaceAll('_',' ');
const profitClass=value=>finite(value)===null?'':finite(value)>0?'pl-positive':finite(value)<0?'pl-negative':'';
const set=(node,value)=>{if(node)node.textContent=String(value)};
const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
const teamKey=(home,away)=>`${normalize(home)}|${normalize(away)}`;
const BANGKOK_OFFSET_MS=7*60*60*1000;
const bangkokDayKey=value=>{
  const n=finite(value);
  if(n===null)return null;
  const d=new Date(n+BANGKOK_OFFSET_MS);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
};
const scorePair=value=>{
  const home=finite(Array.isArray(value)?value[0]:value?.home),away=finite(Array.isArray(value)?value[1]:value?.away);
  return home===null||away===null?null:{home,away};
};
function scoreAfterEntry(finalScore,entryScore){
  const final=scorePair(finalScore),entry=scorePair(entryScore);if(!final)return null;if(!entry)return final;
  const home=final.home-entry.home,away=final.away-entry.away;return home<0||away<0?null:{home,away};
}
function gradeAhExpected(pick,line,score){
  const p=String(pick||'').toUpperCase(),l=finite(line),s=scorePair(score);
  if(!['HOME','AWAY'].includes(p)||l===null||!s||!Number.isInteger(l*4))return null;
  const selected=p==='HOME'?s.home:s.away,opponent=p==='HOME'?s.away:s.home;
  const grade=part=>{const adjusted=selected+part-opponent;if(Math.abs(adjusted)<1e-9)return'PUSH';return adjusted>0?'WIN':'LOSS';};
  if(Number.isInteger(l*2))return grade(l);
  const parts=[grade(l-.25),grade(l+.25)];
  if(parts.includes('PUSH'))return parts.includes('WIN')?'HALF_WIN':'HALF_LOSS';
  return parts[0]===parts[1]?parts[0]:null;
}
function currentLive(row){
  const rows=Array.isArray(window.__nomad342EventResults)?window.__nomad342EventResults:[];
  const usable=rows.map(item=>item?.m).filter(m=>m&&!m?.freshness?.stale&&scorePair(m.score));
  const id=String(row?.matchId??'');
  if(id){const exact=usable.find(m=>String(m.id??'')===id);if(exact)return exact;}
  const key=teamKey(row?.home,row?.away);if(key==='|')return null;
  const matches=usable.filter(m=>teamKey(m.home,m.away)===key);
  return matches.length===1?matches[0]:null;
}
function finalDisplay(row){
  const settledScore=scorePair(row?.finalScore);
  if(settledScore)return pair(settledScore);
  const result=String(row?.result||'PENDING').toUpperCase();
  if(result!=='PENDING')return '—';
  const live=currentLive(row),liveScore=scorePair(live?.score),minute=finite(live?.minute);
  if(liveScore&&minute!==null)return `${pair(liveScore)} · ${Math.max(0,Math.trunc(minute))}′`;
  return '—';
}
function finalHtml(row){
  const text=finalDisplay(row);
  const liveMatch=/^(.*? · )(\d+′)$/.exec(text);
  if(!liveMatch)return esc(text);
  return `${esc(liveMatch[1])}<span class="live-minute">${esc(liveMatch[2])}</span>`;
}
function fallbackDays(rows){
  return new Set(rows.map(row=>bangkokDayKey(row?.lockedAt)).filter(Boolean)).size;
}
function fallbackAvgOdds(rows){
  const settled=rows.filter(row=>String(row?.result||'PENDING').toUpperCase()!=='PENDING');
  const priced=settled.map(row=>finite(row?.odds)).filter(value=>value!==null);
  return priced.length?priced.reduce((sum,value)=>sum+value,0)/priced.length:null;
}

const HISTORY_RANGES=Object.freeze({'7D':7,'30D':30,'90D':90,'6M':183,'1Y':365,'ALL':Infinity});
const historyState={range:'30D',daily:[]};
function historyDayMs(day){
  const ms=Date.parse(`${String(day||'')}T00:00:00+07:00`);
  return Number.isFinite(ms)?ms:null;
}
function historyDate(day,long=false){
  const ms=historyDayMs(day);if(ms===null)return String(day||'—');
  try{return new Date(ms).toLocaleDateString('en-GB',{timeZone:'Asia/Bangkok',day:'2-digit',month:'short',...(long?{year:'numeric'}:{})});}catch{return String(day||'—')}
}
function normalizeDaily(rows){
  return (Array.isArray(rows)?rows:[]).map(row=>({...row,_ms:historyDayMs(row?.day)})).filter(row=>row._ms!==null).sort((a,b)=>a._ms-b._ms);
}
function historyRows(){
  const rows=historyState.daily,days=HISTORY_RANGES[historyState.range]??30;
  if(!rows.length||days===Infinity)return rows;
  const latest=rows[rows.length-1]._ms,cutoff=latest-(days-1)*86400000;
  return rows.filter(row=>row._ms>=cutoff);
}
function historyAggregate(rows){
  const wins=rows.reduce((sum,row)=>sum+(finite(row?.wins)||0),0),losses=rows.reduce((sum,row)=>sum+(finite(row?.losses)||0),0),draws=rows.reduce((sum,row)=>sum+(finite(row?.pushes)||0),0),signals=rows.reduce((sum,row)=>sum+(finite(row?.totalPredictions)||0),0),settled=rows.reduce((sum,row)=>sum+(finite(row?.settledPredictions)||0),0),profit=rows.reduce((sum,row)=>sum+(finite(row?.profit)||0),0);
  const weightedOdds=rows.reduce((sum,row)=>{const odds=finite(row?.avgOdds),count=finite(row?.settledPredictions)||0;return odds===null?sum:sum+odds*count;},0);
  return {wins,losses,draws,signals,settled,profit,winRate:wins+losses?wins/(wins+losses)*100:0,avgOdds:settled?weightedOdds/settled:null};
}
function ensureHistoryStyle(){
  if(document.getElementById('nomad342-history-style'))return;
  const style=document.createElement('style');style.id='nomad342-history-style';style.textContent=`
    #nomad342PanelStatistics .stats-history-card{position:relative;margin:0 0 14px;padding:15px 16px 12px;overflow:hidden;background:linear-gradient(180deg,rgba(19,28,23,.98),rgba(12,18,15,.98));color:#dfe8e1}
    #nomad342PanelStatistics .stats-history-card::after{content:"";position:absolute;left:8%;right:8%;bottom:-34px;height:70px;background:radial-gradient(ellipse at center,rgba(65,217,154,.10),rgba(65,217,154,0) 70%);pointer-events:none}
    #nomad342PanelStatistics .stats-history-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:8px}
    #nomad342PanelStatistics .stats-history-title{display:flex;align-items:flex-end;gap:12px;min-width:0}
    #nomad342PanelStatistics .stats-history-copy{min-width:0}
    #nomad342PanelStatistics .stats-history-copy span{display:block;color:#7f8d84;font:900 8px/1 Arial,Helvetica,sans-serif;letter-spacing:.13em;text-transform:uppercase}
    #nomad342PanelStatistics .stats-history-rate{margin-top:4px;color:#62e4a8;font:900 26px/1 Arial,Helvetica,sans-serif;letter-spacing:-.03em;text-shadow:0 0 14px rgba(65,217,154,.20)}
    #nomad342PanelStatistics .stats-history-rate small{margin-left:5px;color:#7e8d83;font:900 8px/1 Arial,Helvetica,sans-serif;letter-spacing:.10em}
    #nomad342PanelStatistics .stats-history-meta{padding-bottom:2px;color:#75827a;font:800 9px/1.25 Arial,Helvetica,sans-serif;white-space:nowrap}
    #nomad342PanelStatistics .stats-history-ranges{display:flex;align-items:center;justify-content:flex-end;gap:4px;flex-wrap:wrap}
    #nomad342PanelStatistics .stats-history-range{height:27px;min-width:34px;padding:0 8px;border:0;background:rgba(255,255,255,.035);color:#78857d;font:900 8px/1 Arial,Helvetica,sans-serif;letter-spacing:.04em;cursor:pointer}
    #nomad342PanelStatistics .stats-history-range:hover{background:rgba(65,217,154,.07);color:#b9c5bd}
    #nomad342PanelStatistics .stats-history-range.is-active{background:rgba(65,217,154,.12);color:#58dda0;box-shadow:inset 0 -1px 0 rgba(65,217,154,.48)}
    #nomad342PanelStatistics .stats-history-plot{position:relative;height:190px;min-height:150px;touch-action:pan-y;user-select:none}
    #nomad342PanelStatistics .stats-history-svg{display:block;width:100%;height:100%;overflow:visible}
    #nomad342PanelStatistics .stats-history-axis{display:flex;justify-content:space-between;margin-top:-1px;padding:0 5px;color:#5e6b63;font:800 8px/1 Arial,Helvetica,sans-serif;letter-spacing:.04em}
    #nomad342PanelStatistics .stats-history-hitlayer{position:absolute;inset:0;cursor:crosshair}
    #nomad342PanelStatistics .stats-history-tooltip{position:absolute;z-index:4;min-width:176px;padding:10px 11px;background:rgba(8,13,10,.96);box-shadow:0 12px 34px rgba(0,0,0,.36),0 0 20px rgba(65,217,154,.06);pointer-events:none;transform:translate(-50%,-108%);opacity:0;transition:opacity .12s ease;color:#aab6ae;font:800 9px/1.35 Arial,Helvetica,sans-serif}
    #nomad342PanelStatistics .stats-history-tooltip.is-visible{opacity:1}
    #nomad342PanelStatistics .stats-history-tooltip.is-left{transform:translate(-6%,-108%)}
    #nomad342PanelStatistics .stats-history-tooltip.is-right{transform:translate(-94%,-108%)}
    #nomad342PanelStatistics .stats-history-tooltip strong{display:block;margin-bottom:7px;color:#e8eee9;font-size:10px;letter-spacing:.04em}
    #nomad342PanelStatistics .stats-history-tipgrid{display:grid;grid-template-columns:1fr auto;gap:4px 14px}
    #nomad342PanelStatistics .stats-history-tipgrid b{color:#dce5de;text-align:right}
    #nomad342PanelStatistics .stats-history-tipgrid .good{color:#62e4a8}
    #nomad342PanelStatistics .stats-history-empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#657269;font:900 9px/1 Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase}
    @media(max-width:700px){
      #nomad342PanelStatistics .stats-history-card{padding:12px 11px 10px;margin-bottom:11px}
      #nomad342PanelStatistics .stats-history-head{display:block;margin-bottom:7px}
      #nomad342PanelStatistics .stats-history-title{justify-content:space-between;gap:8px}
      #nomad342PanelStatistics .stats-history-rate{font-size:23px}
      #nomad342PanelStatistics .stats-history-ranges{justify-content:flex-start;margin-top:9px;gap:3px}
      #nomad342PanelStatistics .stats-history-range{height:26px;min-width:32px;padding:0 7px}
      #nomad342PanelStatistics .stats-history-plot{height:160px;min-height:140px}
      #nomad342PanelStatistics .stats-history-tooltip{min-width:164px;padding:9px 10px}
    }
  `;document.head.append(style);
}
function mountHistoryCard(){
  let card=document.getElementById('statsHistoryCard');if(card)return card;
  const panel=document.getElementById('nomad342PanelStatistics'),summary=panel?.querySelector('.statistics-summary');if(!panel||!summary)return null;
  ensureHistoryStyle();
  card=document.createElement('section');card.id='statsHistoryCard';card.className='panel stats-history-card';card.setAttribute('aria-label','Performance history');
  card.innerHTML=`<div class="stats-history-head"><div class="stats-history-title"><div class="stats-history-copy"><span>PERFORMANCE HISTORY</span><div class="stats-history-rate" id="statsHistoryRate">—<small>WIN RATE</small></div></div><div class="stats-history-meta" id="statsHistoryMeta">WAITING FOR HISTORY</div></div><div class="stats-history-ranges" role="group" aria-label="Statistics history range">${Object.keys(HISTORY_RANGES).map(key=>`<button type="button" class="stats-history-range${key===historyState.range?' is-active':''}" data-history-range="${key}" aria-pressed="${key===historyState.range?'true':'false'}">${key}</button>`).join('')}</div></div><div class="stats-history-plot" id="statsHistoryPlot"><div class="stats-history-empty">Waiting for settled history…</div></div><div class="stats-history-axis"><span id="statsHistoryFrom">—</span><span id="statsHistoryTo">—</span></div>`;
  summary.after(card);
  card.addEventListener('click',event=>{const button=event.target.closest('[data-history-range]');if(!button)return;historyState.range=button.dataset.historyRange||'30D';card.querySelectorAll('[data-history-range]').forEach(item=>{const active=item.dataset.historyRange===historyState.range;item.classList.toggle('is-active',active);item.setAttribute('aria-pressed',active?'true':'false');});renderHistory();});
  return card;
}
function historyTooltip(row){
  const odds=finite(row?.avgOdds),roi=finite(row?.roi),rate=finite(row?.winRate)||0,profit=finite(row?.profit)||0;
  return `<strong>${esc(historyDate(row?.day,true).toUpperCase())}</strong><div class="stats-history-tipgrid"><span>SIGNALS</span><b>${esc(row?.totalPredictions??0)}</b><span>WIN</span><b class="good">${esc(row?.wins??0)}</b><span>LOSS</span><b>${esc(row?.losses??0)}</b><span>DRAW</span><b>${esc(row?.pushes??0)}</b><span>WIN RATE</span><b class="good">${rate.toFixed(1)}%</b><span>AVG ODDS</span><b>${odds===null?'—':esc(fmtOdds(odds))}</b><span>ROI</span><b>${roi===null?'—':`${roi.toFixed(2)}%`}</b><span>NET P/L</span><b class="${profit>0?'good':''}">${esc(fmtProfit(profit))}</b></div>`;
}
function renderHistory(nextDaily){
  const card=mountHistoryCard();if(!card)return;
  if(nextDaily!==undefined)historyState.daily=normalizeDaily(nextDaily);
  const rows=historyRows(),plot=card.querySelector('#statsHistoryPlot'),rateNode=card.querySelector('#statsHistoryRate'),metaNode=card.querySelector('#statsHistoryMeta'),fromNode=card.querySelector('#statsHistoryFrom'),toNode=card.querySelector('#statsHistoryTo');
  if(!rows.length){rateNode.innerHTML='—<small>WIN RATE</small>';metaNode.textContent='NO HISTORY';fromNode.textContent='—';toNode.textContent='—';plot.innerHTML='<div class="stats-history-empty">Waiting for settled history…</div>';return;}
  const aggregate=historyAggregate(rows);rateNode.innerHTML=`${aggregate.winRate.toFixed(1)}%<small>WIN RATE</small>`;metaNode.textContent=`${aggregate.signals} SIGNALS · ${fmtProfit(aggregate.profit)}`;fromNode.textContent=historyDate(rows[0].day);toNode.textContent=historyDate(rows[rows.length-1].day);
  const W=1000,H=220,L=38,R=18,T=16,B=24,plotW=W-L-R,plotH=H-T-B,baseY=H-B;
  const points=rows.map((row,index)=>{const x=rows.length===1?L+plotW/2:L+index*(plotW/(rows.length-1)),rate=Math.max(0,Math.min(100,finite(row?.winRate)||0)),y=T+(100-rate)/100*plotH;return {x,y,row};});
  const line=points.map((point,index)=>`${index?'L':'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' '),area=`${line} L${points[points.length-1].x.toFixed(2)} ${baseY} L${points[0].x.toFixed(2)} ${baseY} Z`;
  const grids=[25,50,75].map(value=>{const y=T+(100-value)/100*plotH;return `<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="rgba(255,255,255,.045)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;}).join('');
  plot.innerHTML=`<svg class="stats-history-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="statsHistoryFill342" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#41d99a" stop-opacity=".28"/><stop offset="62%" stop-color="#41d99a" stop-opacity=".07"/><stop offset="100%" stop-color="#41d99a" stop-opacity="0"/></linearGradient><filter id="statsHistoryGlow342" x="-20%" y="-30%" width="140%" height="180%"><feGaussianBlur stdDeviation="6"/></filter></defs>${grids}<path d="${area}" fill="url(#statsHistoryFill342)"/><path d="${line}" fill="none" stroke="#41d99a" stroke-opacity=".34" stroke-width="7" filter="url(#statsHistoryGlow342)" vector-effect="non-scaling-stroke"/><path d="${line}" fill="none" stroke="#59e2a5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle id="statsHistoryDot" cx="${points[points.length-1].x}" cy="${points[points.length-1].y}" r="4.2" fill="#78efb6" stroke="#173e2d" stroke-width="2" vector-effect="non-scaling-stroke" opacity="0"/></svg><div class="stats-history-tooltip" id="statsHistoryTooltip"></div><div class="stats-history-hitlayer" id="statsHistoryHitlayer" aria-label="Hover or tap the chart for daily details"></div>`;
  const hit=plot.querySelector('#statsHistoryHitlayer'),tooltip=plot.querySelector('#statsHistoryTooltip'),dot=plot.querySelector('#statsHistoryDot');
  const show=index=>{index=Math.max(0,Math.min(points.length-1,index));const point=points[index],pct=point.x/W*100;dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);dot.setAttribute('opacity','1');tooltip.innerHTML=historyTooltip(point.row);tooltip.style.left=`${pct}%`;tooltip.style.top=`${point.y/H*100}%`;tooltip.classList.toggle('is-left',pct<16);tooltip.classList.toggle('is-right',pct>84);tooltip.classList.add('is-visible');};
  const locate=event=>{const rect=hit.getBoundingClientRect();if(!rect.width)return;const raw=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),x=L+raw*plotW,index=points.reduce((best,point,i)=>Math.abs(point.x-x)<Math.abs(points[best].x-x)?i:best,0);show(index);};
  hit.addEventListener('pointermove',locate);hit.addEventListener('pointerdown',locate);hit.addEventListener('pointerleave',()=>{dot.setAttribute('opacity','0');tooltip.classList.remove('is-visible');});
}
function buildAhAudit(records){
  const audit=new Map();
  for(const record of Array.isArray(records)?records:[]){
    const signal=(Array.isArray(record?.signals)?record.signals:[]).find(item=>String(item?.market||'').toUpperCase()==='AH');
    if(!signal)continue;
    const matchId=String(record?.matchId??'');if(!matchId)continue;
    audit.set(matchId,{
      pick:String(signal.pick||'').toUpperCase(),line:finite(signal.line),rawLine:finite(signal.rawLine),odds:finite(signal.odds),entryScore:signal.entryScore||record?.entryScore,
      homeOdds:finite(signal.homeOdds),awayOdds:finite(signal.awayOdds),rawHomeHk:finite(signal.rawHomeHk),rawAwayHk:finite(signal.rawAwayHk),
      bookmaker:String(signal.bookmaker||record?.market?.asianHandicap?.bookmaker||'Bet365'),provider:String(signal.provider||record?.market?.asianHandicap?.provider||record?.market?.provider||'Nowgoal')
    });
  }
  return audit;
}
function ahCells(row,audit){
  const pick=String(audit?.pick||row?.pick||'').toUpperCase(),selectedLine=finite(audit?.line)??finite(row?.line),rawLine=finite(audit?.rawLine);
  const selectedOdds=finite(audit?.odds)??finite(row?.odds),homeOdds=finite(audit?.homeOdds),awayOdds=finite(audit?.awayOdds),rawHome=finite(audit?.rawHomeHk),rawAway=finite(audit?.rawAwayHk);
  const rawSelected=pick==='HOME'?rawHome:pick==='AWAY'?rawAway:null,bookmaker=String(audit?.bookmaker||'Bet365'),provider=String(audit?.provider||'Nowgoal');
  const expected=rawLine===null?null:(pick==='HOME'?-rawLine:rawLine),perspectiveOk=expected===null||selectedLine===null?null:Math.abs(expected-selectedLine)<1e-9;
  const priceExpected=rawSelected===null?null:1+rawSelected,priceOk=priceExpected===null||selectedOdds===null?null:Math.abs(priceExpected-selectedOdds)<1e-6;
  const pickMain=`${pick||'—'} ${fmtLine(selectedLine)}`;
  const perspective=rawLine===null?'Goaloo raw line not stored':`Goaloo raw ${fmtLine(rawLine)} → ${pick||'—'} ${fmtLine(expected)}${perspectiveOk===null?'':perspectiveOk?' · ✓':' · ⚠'}`;
  const priceMain=fmtDecimal(selectedOdds);
  const pricePair=`${bookmaker} · ${provider} · Home ${fmtDecimal(homeOdds)} · Away ${fmtDecimal(awayOdds)}`;
  const rawPair=rawHome===null&&rawAway===null?'Hong Kong raw odds not stored':`Hong Kong Home ${fmtRawHk(rawHome)} · Away ${fmtRawHk(rawAway)}${priceOk===null?'':` · selected → ${fmtDecimal(priceExpected)} ${priceOk?'✓':'⚠'}`}`;
  const finalScore=scorePair(row?.finalScore),gradingScore=finalScore?scoreAfterEntry(finalScore,audit?.entryScore||row?.entryScore):null,expectedResult=gradingScore?gradeAhExpected(pick,selectedLine,gradingScore):null,serverResult=String(row?.result||'PENDING').toUpperCase(),settlementOk=expectedResult?expectedResult===serverResult:null;
  const settlement=expectedResult&&finalScore&&gradingScore?`FT ${pair(finalScore)} · AFTER LOCK ${pair(gradingScore)} · expected ${displayResult(expectedResult)} · ${settlementOk?'✓':'⚠'}`:'';
  return {
    market:'Asian Handicap',
    pick:`<strong>${esc(pickMain)}</strong>`,
    odds:`<strong>${esc(priceMain)}</strong><br><small>${esc(bookmaker)}</small>`,
    settlement:settlement?`<br><small>${esc(settlement)}</small>`:''
  };
}
function rowHtml(row,ahAudit){
  const result=String(row.result||'PENDING').toUpperCase(),isAh=String(row.market||'').startsWith('Asian Handicap');
  const audit=isAh?ahCells(row,ahAudit.get(String(row?.matchId??''))):null;
  const marketHtml=isAh?esc(audit.market):esc(row.market);
  const pickHtml=isAh?audit.pick:esc(row.pick);
  const oddsHtml=isAh?audit.odds:esc(fmtOdds(row.odds));
  const resultHtml=isAh?`${esc(displayResult(result))}${audit.settlement}`:esc(displayResult(result));
  return `<tr><td>${esc(when(row.lockedAt))}</td><td>${esc(row.home)} — ${esc(row.away)}</td><td class="market-cell">${marketHtml}</td><td>${pickHtml}</td><td>${oddsHtml}</td><td>${esc(row.minute??'—')}′ · ${esc(pair(row.entryScore))}</td><td class="final-cell">${finalHtml(row)}</td><td class="${esc(resultClass(result))}">${resultHtml}</td><td class="${esc(profitClass(row.profit))}">${esc(fmtProfit(row.profit))}</td></tr>`;
}
async function fetchJson(path){
  const ac=new AbortController(),timeout=setTimeout(()=>ac.abort(),Number(runtime.timeoutMs)||6500);
  try{const response=await fetch(`${base}${path}${path.includes('?')?'&':'?'}t=${Date.now()}`,{cache:'no-store',signal:ac.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);return await response.json();}
  finally{clearTimeout(timeout);}
}
async function load(){
  if(busy||!base||!tbody)return;busy=true;
  try{
    const data=await fetchJson(`${runtime.statisticsPath||'/statistics'}?limit=500`),summary=data?.summary||{},rows=Array.isArray(data?.rows)?data.rows:[];
    let ahAudit=new Map();
    try{const signalData=await fetchJson(`${runtime.signalPath||'/signal'}?limit=500`);ahAudit=buildAhAudit(signalData?.records);}catch{}
    const avgOdds=finite(summary.avgOdds)??fallbackAvgOdds(rows);
    set(metrics.roi,finite(summary.roi)===null?'—':`${Number(summary.roi).toFixed(2)}%`);
    set(metrics.profit,fmtProfit(summary.profit));
    const daily=document.getElementById('statsDailyRows');
    if(daily)daily.innerHTML=(data.daily||[]).map(d=>`<tr><td>${esc(d.day)}</td><td>${esc(d.totalPredictions)}</td><td>${esc(d.wins)} (${esc(d.halfWins||0)} half)</td><td>${esc(d.losses)} (${esc(d.halfLosses||0)} half)</td><td>${esc(d.pushes)}</td><td>${esc(d.pendingPredictions)}</td><td>${Number(d.winRate).toFixed(1)}%</td><td>${esc(fmtProfit(d.profit))}</td><td>${finite(d.roi)===null?'—':Number(d.roi).toFixed(2)+'%'}</td></tr>`).join('');
    set(metrics.total,summary.totalPredictions??rows.length);
    set(metrics.day,summary.days??fallbackDays(rows));
    set(metrics.win,summary.wins??0);
    set(metrics.loss,summary.losses??0);
    set(metrics.draw,summary.pushes??0);
    set(metrics.avgOdds,avgOdds===null?'—':fmtOdds(avgOdds));
    set(metrics.winRate,`${Number(summary.winRate||0).toFixed(1)}%`);
    renderHistory(data.daily||[]);
    tbody.innerHTML=rows.length?rows.map(row=>rowHtml(row,ahAudit)).join(''):'<tr><td colspan="9">No picks recorded yet.</td></tr>';
    set(status,`LEDGER ONLINE · ${summary.settledPredictions??0} settled · ${summary.pendingPredictions??0} pending · updated ${when(data.updatedAt)}`);
  }catch(error){
    set(status,'LEDGER TEMPORARILY UNAVAILABLE');
    if(!tbody.children.length||/Connecting|No picks|unavailable/i.test(tbody.textContent||''))tbody.innerHTML='<tr><td colspan="9">Statistics ledger connection temporarily unavailable.</td></tr>';
  }finally{busy=false;}
}
mountHistoryCard();
const refresh=()=>setTimeout(load,0);
load();timer=setInterval(load,Math.max(3000,Number(runtime.pollMs)||5000));
document.addEventListener('nomad342:ledgerlocked',refresh);
document.addEventListener('nomad342:ledgerrefresh',refresh);
document.addEventListener('nomad342:odds-display-change',refresh);
window.addEventListener('focus',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('beforeunload',()=>{if(timer)clearInterval(timer)});
})();