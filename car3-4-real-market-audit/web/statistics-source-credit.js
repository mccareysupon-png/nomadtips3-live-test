(()=>{
  const PUBLIC_SOURCE='Odds-API.io';

  const applySourceCredit=()=>{
    document.querySelectorAll('#statsRows tr').forEach(row=>{
      const cells=row.querySelectorAll('td');
      if(cells.length>=9){
        const sourceCell=cells[cells.length-1];
        if(sourceCell.textContent!==PUBLIC_SOURCE)sourceCell.textContent=PUBLIC_SOURCE;
      }
    });

    document.querySelectorAll('#statsCards .stats-card-meta>div').forEach(block=>{
      const label=block.querySelector('small');
      const value=block.querySelector('strong');
      if(label&&value&&label.textContent.trim().toUpperCase()==='SOURCE'&&value.textContent!==PUBLIC_SOURCE){
        value.textContent=PUBLIC_SOURCE;
      }
    });
  };

  const start=()=>{
    applySourceCredit();
    const observer=new MutationObserver(applySourceCredit);
    const rows=document.getElementById('statsRows');
    const cards=document.getElementById('statsCards');
    if(rows)observer.observe(rows,{childList:true,subtree:true});
    if(cards)observer.observe(cards,{childList:true,subtree:true});
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
