(()=>{
'use strict';
const page=document.body.dataset.page||'';
const navMap={live:'index.html',signal:'signal.html',statistics:'statistics.html'};
const viewerTimeZone=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'}catch{return'UTC'}})();
document.querySelectorAll('[data-nav]').forEach(a=>{
  const key=a.dataset.nav;
  a.classList.toggle('active',key===page);
  if(key===page)a.setAttribute('aria-current','page');
});
document.querySelectorAll('[data-local-timezone]').forEach(el=>{el.textContent=viewerTimeZone});
const search=document.querySelector('[data-match-search]');
if(search){
  search.addEventListener('input',()=>{
    const q=search.value.trim().toLowerCase();
    document.querySelectorAll('[data-match-row]').forEach(row=>{
      row.hidden=q&&!row.textContent.toLowerCase().includes(q);
    });
  });
}
window.NOMAD343_UI={version:'clean-ui-v2-local-timezone',page,navMap,timeZone:viewerTimeZone};
})();
