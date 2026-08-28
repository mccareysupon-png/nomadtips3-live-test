document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.day-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const target=btn.dataset.view==='yesterday'
        ? document.getElementById('resultList')
        : document.getElementById('predictionList');
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(target&&!target.hidden){
          target.scrollIntoView({behavior:'smooth',block:'start'});
        }
      }));
    });
  });
});
