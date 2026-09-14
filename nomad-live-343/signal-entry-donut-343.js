(()=>{'use strict';
const VERSION='343-entry-donut-v1';
const parseValue=v=>{const m=String(v??'').replace(/,/g,'').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null};
function convertEntryStats(root=document){
  const groups=root.querySelectorAll('.signal-entry-block .signal-entry-detail-grid section:first-child .signal-mirror-bars:not([data-entry-donut])');
  groups.forEach(group=>{
    const rows=[...group.querySelectorAll('.signal-mirror-row')];
    if(!rows.length)return;
    const items=rows.map(row=>{
      const label=row.querySelector(':scope > span')?.textContent?.trim()||'STAT';
      const values=[...row.children].filter(el=>el.tagName==='STRONG');
      const homeText=values[0]?.textContent?.trim()||'—';
      const awayText=values[1]?.textContent?.trim()||'—';
      const home=parseValue(homeText),away=parseValue(awayText);
      const sum=(home??0)+(away??0),hasPair=home!==null&&away!==null&&sum>0;
      const homeDeg=hasPair?Math.max(0,Math.min(360,(home/sum)*360)):0;
      return `<div class="signal-entry-donut-item${hasPair?'':' empty'}" data-entry-stat="${label.replace(/"/g,'&quot;')}"><div class="signal-entry-donut-ring" style="--home-deg:${homeDeg.toFixed(2)}deg" aria-label="${label}: Home ${homeText}, Away ${awayText}"></div><b class="signal-entry-donut-label">${label}</b><div class="signal-entry-donut-values"><span class="home">${homeText}</span><i>/</i><span class="away">${awayText}</span></div></div>`;
    }).join('');
    group.innerHTML=`<div class="signal-entry-donut-grid">${items}</div>`;
    group.setAttribute('data-entry-donut',VERSION);
  });
}
function boot(){
  convertEntryStats();
  const board=document.querySelector('[data-signal-body]')||document.body;
  const observer=new MutationObserver(records=>{if(records.some(r=>r.addedNodes.length))convertEntryStats(board)});
  observer.observe(board,{childList:true,subtree:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.NOMAD_SIGNAL_ENTRY_DONUT={version:VERSION,refresh:convertEntryStats};
})();
