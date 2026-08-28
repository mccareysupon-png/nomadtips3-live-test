document.addEventListener('DOMContentLoaded',()=>{
  const resetToTop=()=>{
    window.scrollTo(0,0);
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
  };

  document.querySelectorAll('.day-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      btn.blur();
      resetToTop();
      requestAnimationFrame(()=>{
        resetToTop();
        requestAnimationFrame(resetToTop);
      });
    });
  });
});
