(()=>{
  const mobile=window.matchMedia('(max-width:1023px)');
  const getLayout=()=>document.getElementById('liveLayout');
  const syncAria=()=>{
    const layout=getLayout();
    if(!layout)return;
    const open=layout.classList.contains('match-open');
    document.querySelectorAll('.signal-item').forEach(item=>{
      item.setAttribute('aria-expanded',item.classList.contains('active')&&open?'true':'false');
    });
  };

  document.addEventListener('click',event=>{
    if(!mobile.matches)return;
    const item=event.target.closest('.signal-item');
    const layout=getLayout();
    if(!item||!layout)return;

    const sameActive=item.classList.contains('active');
    const isOpen=layout.classList.contains('match-open');

    if(sameActive&&isOpen){
      event.preventDefault();
      event.stopImmediatePropagation();
      layout.classList.remove('match-open');
      syncAria();
      return;
    }

    requestAnimationFrame(()=>requestAnimationFrame(syncAria));
  },true);

  const observer=new MutationObserver(syncAria);
  observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  mobile.addEventListener?.('change',syncAria);
  syncAria();
})();
