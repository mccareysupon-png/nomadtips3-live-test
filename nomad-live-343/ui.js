(()=>{
'use strict';
const page=document.body.dataset.page||'';
const navMap={live:'index.html',signal:'signal.html',statistics:'statistics.html'};
document.querySelectorAll('[data-nav]').forEach(a=>{
  const key=a.dataset.nav;
  a.classList.toggle('active',key===page);
  if(key===page)a.setAttribute('aria-current','page');
});
const search=document.querySelector('[data-match-search]');
if(search){
  search.addEventListener('input',()=>{
    const q=search.value.trim().toLowerCase();
    document.querySelectorAll('[data-match-row]').forEach(row=>{
      row.hidden=q&&!row.textContent.toLowerCase().includes(q);
    });
  });
}
window.NOMAD343_UI={version:'clean-ui-v1',page,navMap};
})();
