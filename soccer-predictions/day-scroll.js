document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('.day-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const isYesterday=btn.dataset.view==='yesterday';
      const target=isYesterday
        ? document.getElementById('resultList')
        : document.querySelector('.day-switch');

      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(target){
          target.scrollIntoView({behavior:'smooth',block:'start'});
        }
      }));
    });
  });
});
