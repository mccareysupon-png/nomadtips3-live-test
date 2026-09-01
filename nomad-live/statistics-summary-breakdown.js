(()=>{
  const winNodes=[...document.querySelectorAll('.stats-win-metric strong,.mobile-stats-win strong')];
  const lossNodes=[...document.querySelectorAll('.stats-loss-metric strong,.mobile-stats-loss strong')];
  const pushNodes=[...document.querySelectorAll('.stats-push-metric strong,.mobile-stats-push strong')];
  const settledCountNode=document.querySelector('.mobile-settled-count');
  if(!winNodes.length||!lossNodes.length||!pushNodes.length)return;

  const setText=(node,value)=>{
    const next=String(value);
    if(node&&node.textContent!==next)node.textContent=next;
  };

  const setAll=(nodes,value)=>nodes.forEach(node=>setText(node,value));

  const update=records=>{
    const settled=Array.isArray(records)?records.filter(item=>item?.settlement):[];
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    const classified=wins+losses+pushes;
    setAll(winNodes,wins);
    setAll(lossNodes,losses);
    setAll(pushNodes,pushes);
    setText(settledCountNode,`${classified} settled`);
  };

  window.addEventListener('nomad:statistics-records',event=>{
    update(event?.detail?.records);
  });
})();
