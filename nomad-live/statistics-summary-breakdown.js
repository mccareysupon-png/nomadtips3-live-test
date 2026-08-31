(()=>{
  const winNode=document.querySelector('.stats-win-metric strong');
  const lossNode=document.querySelector('.stats-loss-metric strong');
  const pushNode=document.querySelector('.stats-push-metric strong');
  if(!winNode||!lossNode||!pushNode)return;

  const setText=(node,value)=>{
    const next=String(value);
    if(node.textContent!==next)node.textContent=next;
  };

  const update=records=>{
    const settled=Array.isArray(records)?records.filter(item=>item?.settlement):[];
    const wins=settled.filter(item=>/WIN/.test(item.settlement?.result||'')).length;
    const losses=settled.filter(item=>/LOSS/.test(item.settlement?.result||'')).length;
    const pushes=settled.filter(item=>item.settlement?.result==='PUSH').length;
    setText(winNode,wins);
    setText(lossNode,losses);
    setText(pushNode,pushes);
  };

  window.addEventListener('nomad:statistics-records',event=>{
    update(event?.detail?.records);
  });
})();
