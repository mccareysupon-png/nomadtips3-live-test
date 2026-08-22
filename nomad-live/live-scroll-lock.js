(()=>{
  const list=document.querySelector('.match-list');
  if(!list)return;

  let anchorId=null;
  let anchorTop=null;
  let scrollFrame=0;
  let restoreFrame=0;

  const openRows=()=>[...list.querySelectorAll('.match-wrap[open]')];
  const capture=()=>{
    const rows=openRows();
    if(!rows.length){anchorId=null;anchorTop=null;return;}
    const row=rows.find(item=>{
      const rect=item.getBoundingClientRect();
      return rect.bottom>0&&rect.top<window.innerHeight;
    })||rows[0];
    anchorId=row.dataset.matchId||null;
    anchorTop=row.getBoundingClientRect().top;
  };

  const restore=()=>{
    if(!anchorId||!Number.isFinite(anchorTop))return;
    const row=[...list.querySelectorAll('.match-wrap')].find(item=>item.dataset.matchId===anchorId);
    if(!row)return;
    const delta=row.getBoundingClientRect().top-anchorTop;
    if(Math.abs(delta)>1)window.scrollBy({top:delta,left:0,behavior:'auto'});
    anchorTop=row.getBoundingClientRect().top;
  };

  list.addEventListener('toggle',()=>requestAnimationFrame(capture),true);
  window.addEventListener('scroll',()=>{
    if(scrollFrame)return;
    scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;capture();});
  },{passive:true});

  const observer=new MutationObserver(mutations=>{
    if(!mutations.some(item=>item.type==='childList'))return;
    if(restoreFrame)cancelAnimationFrame(restoreFrame);
    restoreFrame=requestAnimationFrame(()=>{
      restoreFrame=0;
      restore();
      requestAnimationFrame(capture);
    });
  });
  observer.observe(list,{childList:true,subtree:false});

  requestAnimationFrame(capture);
})();
