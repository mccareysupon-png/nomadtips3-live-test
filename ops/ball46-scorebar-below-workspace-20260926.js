/* BALL46_SCOREBAR_BELOW_WORKSPACE_20260926
 * Isolated presentation-only scorebar.
 * Reads existing rendered LIVE cards. No fetch/API/provider access.
 * Removal path: remove the single script reference from Production index.html.
 */
(()=>{
  'use strict';
  const ID='ball46-scorebar10-below-workspace';
  const STYLE_ID='ball46-scorebar10-below-workspace-style';
  const MAX=10;
  const MOBILE_MAX=760;
  let raf=0;

  function installStyle(){
    if(document.getElementById(STYLE_ID)) return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      #${ID}{margin:12px 0 0;min-width:0;border:1px solid var(--line);border-radius:10px;background:var(--panel);overflow:hidden}
      #${ID}[hidden]{display:none!important}
      #${ID} .b46-sb-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 10px;border-bottom:1px solid var(--line);font-size:7px;font-weight:900;letter-spacing:.08em;color:var(--muted)}
      #${ID} .b46-sb-head strong{font-size:8px;color:var(--text)}
      #${ID} .b46-sb-track{display:grid;grid-template-columns:repeat(10,minmax(88px,1fr));min-width:880px;overflow-x:auto;scrollbar-width:thin}
      #${ID} .b46-sb-item{appearance:none;border:0;border-right:1px solid var(--line);background:transparent;color:var(--text);padding:7px 6px;min-width:0;text-align:left;cursor:pointer}
      #${ID} .b46-sb-item:last-child{border-right:0}
      #${ID} .b46-sb-item:hover{background:color-mix(in srgb,var(--green) 8%,transparent)}
      #${ID} .b46-sb-teams{display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
      #${ID} .b46-sb-team{font-size:7px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #${ID} .b46-sb-meta{display:flex;align-items:center;justify-content:space-between;gap:5px;margin-top:5px}
      #${ID} .b46-sb-score{font-size:10px;font-weight:950;letter-spacing:.03em;color:var(--green)}
      #${ID} .b46-sb-time{font-size:6px;font-weight:900;color:var(--muted);white-space:nowrap}
      @media(max-width:${MOBILE_MAX}px){#${ID}{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function ensureBar(){
    let bar=document.getElementById(ID);
    if(bar) return bar;
    const workspace=document.querySelector('.workspace.singlepage');
    if(!workspace) return null;
    installStyle();
    bar=document.createElement('section');
    bar.id=ID;
    bar.setAttribute('aria-label','Live scorebar');
    bar.innerHTML='<div class="b46-sb-head"><strong>LIVE SCOREBAR</strong><span data-b46-sb-count>0 LIVE</span></div><div class="b46-sb-track" data-b46-sb-track></div>';
    workspace.insertAdjacentElement('afterend',bar);
    return bar;
  }

  function liveRows(){
    const live=document.querySelector('[data-status-section="live"]');
    if(!live) return [];
    return [...live.querySelectorAll('[data-match-id]')].slice(0,MAX);
  }

  function rowData(row){
    const teams=[...row.querySelectorAll('.teams-cell b')];
    const scores=[...row.querySelectorAll('.score-cell > strong')];
    const time=row.querySelector('.score-cell small');
    return {
      id:String(row.dataset.matchId||''),
      home:(teams[0]?.textContent||'—').trim(),
      away:(teams[1]?.textContent||'—').trim(),
      score:`${(scores[0]?.textContent||'—').trim()}–${(scores[1]?.textContent||'—').trim()}`,
      time:(time?.textContent||'LIVE').trim(),
      row
    };
  }

  function updateItem(item,d){
    if(item.dataset.matchId!==d.id) item.dataset.matchId=d.id;
    const home=item.querySelector('[data-sb-home]');
    const away=item.querySelector('[data-sb-away]');
    const score=item.querySelector('[data-sb-score]');
    const time=item.querySelector('[data-sb-time]');
    if(home.textContent!==d.home) home.textContent=d.home;
    if(away.textContent!==d.away) away.textContent=d.away;
    if(score.textContent!==d.score) score.textContent=d.score;
    if(time.textContent!==d.time) time.textContent=d.time;
    item.onclick=()=>d.row.click();
  }

  function makeItem(d){
    const item=document.createElement('button');
    item.type='button';
    item.className='b46-sb-item';
    item.innerHTML='<span class="b46-sb-teams"><span class="b46-sb-team" data-sb-home></span><span class="b46-sb-team" data-sb-away></span></span><span class="b46-sb-meta"><b class="b46-sb-score" data-sb-score></b><span class="b46-sb-time" data-sb-time></span></span>';
    updateItem(item,d);
    return item;
  }

  function sync(){
    raf=0;
    const bar=ensureBar();
    if(!bar) return;
    const visibleLivePanel=document.querySelector('[data-workspace-panel="live"]:not([hidden])');
    const rows=visibleLivePanel?liveRows():[];
    if(innerWidth<=MOBILE_MAX||!rows.length){bar.hidden=true;return;}
    bar.hidden=false;
    const data=rows.map(rowData);
    const track=bar.querySelector('[data-b46-sb-track]');
    const existing=new Map([...track.children].map(el=>[String(el.dataset.matchId||''),el]));
    const ordered=[];
    for(const d of data){
      const item=existing.get(d.id)||makeItem(d);
      updateItem(item,d);
      ordered.push(item);
      existing.delete(d.id);
    }
    existing.forEach(el=>el.remove());
    ordered.forEach((el,i)=>{if(track.children[i]!==el) track.insertBefore(el,track.children[i]||null);});
    const count=bar.querySelector('[data-b46-sb-count]');
    const label=`${data.length} LIVE`;
    if(count.textContent!==label) count.textContent=label;
  }

  function schedule(){
    if(raf) return;
    raf=requestAnimationFrame(sync);
  }

  function boot(){
    sync();
    const board=document.querySelector('[data-board-sections]');
    if(board) new MutationObserver(schedule).observe(board,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
    const livePanel=document.querySelector('[data-workspace-panel="live"]');
    if(livePanel) new MutationObserver(schedule).observe(livePanel,{attributes:true,attributeFilter:['hidden']});
    addEventListener('resize',schedule,{passive:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
