(()=>{
  const PAGE_SIZE=50;
  const tbody=document.querySelector('.data-table tbody');
  const pager=document.querySelector('[data-stats-pagination]');
  const panel=document.querySelector('.data-table')?.closest('.panel');
  if(!tbody||!pager) return;

  const pageFromUrl=()=>{
    const value=Number(new URL(window.location.href).searchParams.get('page'));
    return Number.isInteger(value)&&value>0?value:1;
  };
  let currentPage=pageFromUrl();
  let frame=0;

  const isPlaceholder=row=>row.cells.length===1&&Number(row.cells[0]?.colSpan)>=9;
  const updateUrl=(page,push=false)=>{
    const url=new URL(window.location.href);
    if(page<=1) url.searchParams.delete('page');
    else url.searchParams.set('page',String(page));
    const method=push?'pushState':'replaceState';
    window.history[method]({statsPage:page},'',`${url.pathname}${url.search}${url.hash}`);
  };
  const pageSequence=(total,current)=>{
    if(total<=7) return Array.from({length:total},(_,index)=>index+1);
    const keep=new Set([1,total,current,current-1,current+1]);
    if(current<=3) [2,3,4].forEach(page=>keep.add(page));
    if(current>=total-2) [total-3,total-2,total-1].forEach(page=>keep.add(page));
    const pages=[...keep].filter(page=>page>=1&&page<=total).sort((a,b)=>a-b);
    const output=[];
    pages.forEach((page,index)=>{
      if(index&&page-pages[index-1]>1) output.push('…');
      output.push(page);
    });
    return output;
  };
  const button=(label,page,options={})=>{
    const disabled=Boolean(options.disabled);
    const active=Boolean(options.active);
    return `<button type="button" class="stats-page-button${active?' is-active':''}" data-page="${page}"${disabled?' disabled':''}${active?' aria-current="page"':''}>${label}</button>`;
  };
  const renderPager=(totalRows,totalPages)=>{
    if(totalPages<=1){pager.hidden=true;pager.innerHTML='';return;}
    pager.hidden=false;
    const start=((currentPage-1)*PAGE_SIZE)+1;
    const end=Math.min(totalRows,currentPage*PAGE_SIZE);
    const numbered=pageSequence(totalPages,currentPage).map(item=>item==='…'
      ?'<span class="stats-page-ellipsis" aria-hidden="true">…</span>'
      :button(String(item),item,{active:item===currentPage})
    ).join('');
    pager.innerHTML=`<span class="stats-page-summary">${start}–${end} / ${totalRows}</span><span class="stats-page-controls">${button('Previous',currentPage-1,{disabled:currentPage===1})}${numbered}${button('Next',currentPage+1,{disabled:currentPage===totalPages})}</span>`;
    pager.querySelectorAll('button[data-page]:not([disabled])').forEach(control=>control.addEventListener('click',()=>{
      const next=Number(control.dataset.page);
      if(!Number.isInteger(next)||next<1||next>totalPages||next===currentPage) return;
      currentPage=next;
      updateUrl(currentPage,true);
      apply();
      if(panel) window.scrollTo({top:Math.max(0,panel.getBoundingClientRect().top+window.scrollY-72),behavior:'smooth'});
    }));
  };
  const apply=()=>{
    frame=0;
    const rows=[...tbody.rows];
    if(!rows.length||(rows.length===1&&isPlaceholder(rows[0]))){
      rows.forEach(row=>row.hidden=false);
      pager.hidden=true;
      pager.innerHTML='';
      return;
    }
    const totalRows=rows.length;
    const totalPages=Math.max(1,Math.ceil(totalRows/PAGE_SIZE));
    const clamped=Math.min(Math.max(1,currentPage),totalPages);
    if(clamped!==currentPage){currentPage=clamped;updateUrl(currentPage,false);}
    const first=(currentPage-1)*PAGE_SIZE;
    const last=first+PAGE_SIZE;
    rows.forEach((row,index)=>{row.hidden=index<first||index>=last;});
    renderPager(totalRows,totalPages);
  };
  const schedule=()=>{
    if(frame) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(apply);
  };

  new MutationObserver(schedule).observe(tbody,{childList:true});
  window.addEventListener('popstate',()=>{currentPage=pageFromUrl();apply();});
  apply();
})();
