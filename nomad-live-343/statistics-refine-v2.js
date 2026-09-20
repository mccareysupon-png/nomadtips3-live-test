(()=>{
'use strict';
function arrange(){
  const ceo=document.querySelector('.ceo-performance-shell');
  const grid=document.querySelector('[data-next-stat-markets]');
  if(!ceo||!grid||ceo.closest('.market-performance-cluster-v2'))return;
  const cluster=document.createElement('section');
  cluster.className='market-performance-cluster-v2';
  grid.parentNode.insertBefore(cluster,grid);
  cluster.appendChild(ceo);
  cluster.appendChild(grid);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arrange,{once:true});else arrange();
})();
