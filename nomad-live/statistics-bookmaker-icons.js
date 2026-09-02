(()=>{
  'use strict';

  const tbody=document.querySelector('.data-table tbody');
  if(!tbody)return;

  const SPRITE='assets/bookmakers/vintage-sprite.webp?v=20260902-v2';
  let spriteReady=false;

  const aliases=new Map([
    ['bet365','bet365'],
    ['1xbet','1xbet'],
    ['m88','m88'],
    ['m88mansion','m88'],
    ['crown','crown'],
    ['crownbet','crown'],
    ['18bet','18bet'],
    ['sbobet','sbobet'],
    ['12bet','12bet'],
    ['12betcom','12bet']
  ]);

  const clean=value=>String(value||'').trim().replace(/\s+/g,' ');
  const keyOf=value=>clean(value).toLowerCase().replace(/[^a-z0-9]/g,'');
  const bookmakerIndex=()=>[...document.querySelectorAll('.data-table thead th')].findIndex(th=>/BOOKMAKER/i.test(th.textContent||''));

  const clearCell=cell=>{
    cell.classList.remove('bookmaker-logo-cell');
    cell.removeAttribute('data-bookmaker-icon');
    cell.removeAttribute('aria-label');
    cell.removeAttribute('title');
  };

  const decorate=()=>{
    const index=bookmakerIndex();
    if(index<0)return;
    document.querySelectorAll('.data-table tbody tr').forEach(row=>{
      const cell=row.children[index];
      if(!cell)return;
      const label=clean(cell.textContent);
      const icon=aliases.get(keyOf(label));
      if(!spriteReady||!icon){clearCell(cell);return;}
      cell.classList.add('bookmaker-logo-cell');
      cell.dataset.bookmakerIcon=icon;
      cell.setAttribute('aria-label',label);
      cell.setAttribute('title',label);
    });
  };

  let queued=false;
  const queue=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate();});
  };

  const probe=new Image();
  probe.onload=()=>{spriteReady=true;decorate();};
  probe.onerror=()=>{spriteReady=false;decorate();};
  probe.src=SPRITE;

  decorate();
  window.addEventListener('nomad:statistics-records',queue);
  new MutationObserver(queue).observe(tbody,{childList:true,subtree:true,characterData:true});
})();
