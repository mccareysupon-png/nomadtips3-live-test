(()=>{
  const mobile=window.matchMedia('(max-width:1023px)');
  document.addEventListener('click',event=>{
    if(!mobile.matches)return;
    const item=event.target.closest('.signal-item');
    const layout=document.getElementById('liveLayout');
    if(!item||!layout)return;
    if(layout.classList.contains('match-open')&&item.classList.contains('active')){
      event.preventDefault();
      event.stopImmediatePropagation();
      layout.classList.remove('match-open');
    }
  },true);
})();
