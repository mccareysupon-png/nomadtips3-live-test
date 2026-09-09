(()=>{
'use strict';
const VALID=new Set(['live-score','signal','statistics']);
const ODDS_KEY='nomad341OddsDisplayV1',ODDS_MODES=new Set(['decimal','american','fractional']);
const STATS_PAGE_SIZE=50;
const HEADING=Object.freeze({
  'live-score':'LIVE SCORE & EVENT MONITOR',
  signal:'1X2 · OVER/UNDER SIGNAL',
  statistics:'STATISTICS'
});
function normalize(value){return VALID.has(value)?value:'live-score'}
function fromHash(){return normalize(String(location.hash||'').replace(/^#/,'').toLowerCase())}
function currentOddsMode(){
  const runtime=window.NOMAD342_ODDS_DISPLAY;
  if(typeof runtime?.getMode==='function')return runtime.getMode();
  try{const value=String(localStorage.getItem(ODDS_KEY)||'').toLowerCase();return ODDS_MODES.has(value)?value:'decimal';}catch{return'decimal'}
}
function syncOddsControl(){
  const mode=currentOddsMode();
  document.querySelectorAll('.nomad342-odds-control [data-odds-mode]').forEach(button=>{
    const active=button.dataset.oddsMode===mode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',active?'true':'false');
  });
}
function setOddsMode(value){
  const mode=ODDS_MODES.has(String(value||'').toLowerCase())?String(value).toLowerCase():'decimal';
  const runtime=window.NOMAD342_ODDS_DISPLAY;
  if(typeof runtime?.setMode==='function'){runtime.setMode(mode);return;}
  try{localStorage.setItem(ODDS_KEY,mode);}catch{}
  document.dispatchEvent(new CustomEvent('nomad342:odds-display-change',{detail:{mode,source:'control-fallback'}}));
}
function mountOddsControl(){
  const tablist=document.querySelector('.nomad342-tabs[role="tablist"]');
  if(!tablist)return null;
  let bar=tablist.closest('.nomad342-controlbar');
  if(!bar){
    bar=document.createElement('div');
    bar.className='nomad342-controlbar';
    tablist.before(bar);
    bar.append(tablist);
  }
  let control=bar.querySelector('.nomad342-odds-control');
  if(!control){
    control=document.createElement('div');
    control.className='nomad342-odds-control';
    control.setAttribute('role','group');
    control.setAttribute('aria-label','Odds display format');
    control.innerHTML='<span class="nomad342-odds-label">ODDS</span><button type="button" data-odds-mode="decimal" aria-pressed="false">DECIMAL</button><button type="button" data-odds-mode="american" aria-pressed="false">AMERICAN</button><button type="button" data-odds-mode="fractional" aria-pressed="false">FRACTION</button>';
    bar.append(control);
    control.addEventListener('click',event=>{
      const button=event.target.closest('[data-odds-mode]');
      if(!button)return;
      setOddsMode(button.dataset.oddsMode);
      syncOddsControl();
    });
  }
  syncOddsControl();
  return bar;
}
function statsPageTokens(totalPages,currentPage){
  if(totalPages<=7)return Array.from({length:totalPages},(_,index)=>index+1);
  const pages=new Set([1,totalPages,currentPage-1,currentPage,currentPage+1]);
  const sorted=[...pages].filter(page=>page>=1&&page<=totalPages).sort((a,b)=>a-b);
  const tokens=[];
  sorted.forEach((page,index)=>{
    if(index&&page-sorted[index-1]>1)tokens.push('…');
    tokens.push(page);
  });
  return tokens;
}
function mountStatisticsPagination(){
  const tbody=document.getElementById('statsRows');
  const wrap=tbody?.closest('.stats-table-wrap');
  if(!tbody||!wrap)return;
  let currentPage=1;
  let scheduled=false;
  let pager=document.getElementById('statsPagination');
  if(!pager){
    pager=document.createElement('nav');
    pager.id='statsPagination';
    pager.className='stats-pagination';
    pager.setAttribute('aria-label','Statistics pages');
    wrap.after(pager);
  }
  if(!document.getElementById('nomad342-statistics-pagination-style')){
    const style=document.createElement('style');
    style.id='nomad342-statistics-pagination-style';
    style.textContent=`
      #nomad342PanelStatistics .stats-pagination{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 10px 2px;color:#8f9991;font:800 10px/1.2 Arial,Helvetica,sans-serif}
      #nomad342PanelStatistics .stats-pagination[hidden]{display:none!important}
      #nomad342PanelStatistics .stats-page-buttons{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
      #nomad342PanelStatistics .stats-page-button{min-width:30px;height:30px;padding:0 8px;border:1px solid rgba(255,255,255,.08);border-radius:0;background:#121812;color:#aab4ac;font:900 10px/1 Arial,Helvetica,sans-serif;cursor:pointer}
      #nomad342PanelStatistics .stats-page-button:hover{background:#192219;color:#e8ece7}
      #nomad342PanelStatistics .stats-page-button.is-active{border-color:rgba(65,217,154,.42);background:rgba(65,217,154,.12);color:#57dda0}
      #nomad342PanelStatistics .stats-page-button:disabled{opacity:.35;cursor:default}
      #nomad342PanelStatistics .stats-page-ellipsis{min-width:18px;text-align:center;color:#69736c}
      #nomad342PanelStatistics .stats-page-info{white-space:nowrap;color:#8f9991;letter-spacing:.03em}
      @media(max-width:700px){
        #nomad342PanelStatistics .stats-pagination{justify-content:center;padding:10px 4px 0}
        #nomad342PanelStatistics .stats-page-info{width:100%;text-align:center;order:2}
        #nomad342PanelStatistics .stats-page-buttons{justify-content:center}
        #nomad342PanelStatistics .stats-page-button{min-width:28px;height:28px;padding:0 7px}
      }
    `;
    document.head.append(style);
  }
  const render=(scrollToTable=false)=>{
    const rows=[...tbody.children];
    const total=rows.length;
    const placeholder=total===1&&Number(rows[0]?.firstElementChild?.colSpan||0)>=9;
    if(!total||placeholder){
      rows.forEach(row=>{row.hidden=false});
      pager.hidden=true;
      pager.innerHTML='';
      currentPage=1;
      return;
    }
    const totalPages=Math.max(1,Math.ceil(total/STATS_PAGE_SIZE));
    currentPage=Math.min(Math.max(1,currentPage),totalPages);
    const start=(currentPage-1)*STATS_PAGE_SIZE;
    const end=Math.min(total,start+STATS_PAGE_SIZE);
    rows.forEach((row,index)=>{row.hidden=index<start||index>=end});
    if(totalPages<=1){
      pager.hidden=true;
      pager.innerHTML='';
      return;
    }
    pager.hidden=false;
    const tokens=statsPageTokens(totalPages,currentPage);
    const buttons=tokens.map(token=>token==='…'
      ?'<span class="stats-page-ellipsis" aria-hidden="true">…</span>'
      :`<button type="button" class="stats-page-button${token===currentPage?' is-active':''}" data-stats-page="${token}"${token===currentPage?' aria-current="page"':''}>${token}</button>`).join('');
    pager.innerHTML=`<div class="stats-page-buttons"><button type="button" class="stats-page-button" data-stats-page="prev" aria-label="Previous statistics page"${currentPage===1?' disabled':''}>‹</button>${buttons}<button type="button" class="stats-page-button" data-stats-page="next" aria-label="Next statistics page"${currentPage===totalPages?' disabled':''}>›</button></div><span class="stats-page-info">${start+1}–${end} / ${total} · PAGE ${currentPage}/${totalPages}</span>`;
    if(scrollToTable)wrap.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;render(false)});
  };
  pager.addEventListener('click',event=>{
    const button=event.target.closest('[data-stats-page]');
    if(!button||button.disabled)return;
    const action=button.dataset.statsPage;
    if(action==='prev')currentPage-=1;
    else if(action==='next')currentPage+=1;
    else currentPage=Number(action)||1;
    render(true);
  });
  new MutationObserver(schedule).observe(tbody,{childList:true});
  render(false);
}
function placeTabs(selected,panels){
  const panel=panels.find(item=>item.dataset.panel===selected);
  const tablist=document.querySelector('.nomad342-tabs[role="tablist"]');
  const controlbar=tablist?.closest('.nomad342-controlbar')||tablist;
  const summary=panel?.querySelector('.status-grid');
  if(panel&&controlbar&&summary&&summary.nextElementSibling!==controlbar)summary.after(controlbar);
}
function setTab(name,{updateHash=true,focus=false}={}){
  const selected=normalize(name);
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  const panels=[...document.querySelectorAll('.nomad342-tab-panel[role="tabpanel"]')];
  placeTabs(selected,panels);
  for(const tab of tabs){
    const active=tab.dataset.tab===selected;
    tab.setAttribute('aria-selected',active?'true':'false');
    tab.tabIndex=active?0:-1;
    if(active&&focus)tab.focus();
  }
  for(const panel of panels){
    const active=panel.dataset.panel===selected;
    panel.hidden=!active;
    panel.setAttribute('aria-hidden',active?'false':'true');
  }
  const heading=document.getElementById('nomad342HeadingTitle');
  if(heading)heading.textContent=HEADING[selected];
  if(updateHash){
    const next=`#${selected}`;
    if(location.hash!==next)history.replaceState(null,'',next);
  }
  document.title=`nomadtips3 · ${selected==='live-score'?'Live Score':selected==='signal'?'Signal':'Statistics'} 3.42`;
  document.dispatchEvent(new CustomEvent('nomad342:ledgerrefresh'));
  document.dispatchEvent(new CustomEvent('nomad342:tabchange',{detail:{tab:selected}}));
}
function start(){
  const tabs=[...document.querySelectorAll('.nomad342-tab[role="tab"]')];
  if(!tabs.length)return;
  mountOddsControl();
  mountStatisticsPagination();
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>setTab(tab.dataset.tab));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      let next=index;
      if(event.key==='ArrowLeft')next=(index-1+tabs.length)%tabs.length;
      if(event.key==='ArrowRight')next=(index+1)%tabs.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=tabs.length-1;
      setTab(tabs[next].dataset.tab,{focus:true});
    });
  });
  document.addEventListener('nomad342:odds-display-change',syncOddsControl);
  addEventListener('hashchange',()=>setTab(fromHash(),{updateHash:false}));
  setTab(fromHash(),{updateHash:location.hash.length>0});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.NOMAD342_TABS=Object.freeze({set:setTab});
})();
