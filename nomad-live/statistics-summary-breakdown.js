(()=>{
  const winNodes=[...document.querySelectorAll('.stats-win-metric strong,.mobile-stats-win strong')];
  const lossNodes=[...document.querySelectorAll('.stats-loss-metric strong,.mobile-stats-loss strong')];
  const pushNodes=[...document.querySelectorAll('.stats-push-metric strong,.mobile-stats-push strong')];
  const dayNodes=[...document.querySelectorAll('.stats-day-metric strong')];
  const settledCountNode=document.querySelector('.mobile-settled-count');
  if(!winNodes.length||!lossNodes.length||!pushNodes.length)return;

  const setText=(node,value)=>{
    const next=String(value);
    if(node&&node.textContent!==next)node.textContent=next;
  };

  const setAll=(nodes,value)=>nodes.forEach(node=>setText(node,value));
  const recordDay=item=>{
    const raw=item?.lockedAt;
    if(!raw)return null;
    const date=new Date(raw);
    if(Number.isNaN(date.getTime()))return null;
    return date.toISOString().slice(0,10);
  };

  const update=records=>{
    const all=Array.isArray(records)?records:[];
    const settled=all.filter(item=>item?.settlement);
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    const classified=wins+losses+pushes;
    const days=new Set(all.map(recordDay).filter(Boolean)).size;
    setAll(winNodes,wins);
    setAll(lossNodes,losses);
    setAll(pushNodes,pushes);
    setAll(dayNodes,days);
    setText(settledCountNode,`${classified} settled`);
  };

  window.addEventListener('nomad:statistics-records',event=>{
    update(event?.detail?.records);
  });
})();
