(()=>{
  'use strict';

  const PRICE_ERROR_RE=/(?:http\s*\d{3}|parser|endpoint|source[_ -]?(?:blocked|error|timeout)|challenge page|api key|price_fetch_failed|waiting_api)/i;
  const PRIVATE_NOTE_RE=/(?:source[_ -]?error|provider|fallback|http\s*\d{3}|parser|endpoint|api key|price_fetch_failed|waiting_api|odds[- ]?api|api[- ]?football|totalcorner|nowgoal|goaloo|oddspedia)/i;
  const STATUS_RE=/^(?:PASS|WAIT|STALE|FAIL|UNAVAILABLE)$/i;

  const setText=(node,value)=>{
    if(!node)return;
    const next=String(value??'');
    if(node.textContent!==next)node.textContent=next;
  };
  const parts=value=>String(value||'').trim().replace(/\s+/g,' ').split(/\s*·\s*/).map(item=>item.trim()).filter(Boolean);

  function bookmakerFromPrice(value){
    const list=parts(value);
    if(!list.length)return '';
    if(STATUS_RE.test(list[0]))list.shift();
    const homeIndex=list.findIndex(item=>/^HOME\b/i.test(item));
    if(homeIndex>0)return list[homeIndex-1];
    return list[0]||'';
  }

  function cleanPriceText(value){
    const raw=String(value||'').trim().replace(/\s+/g,' ');
    if(!raw)return raw;
    const list=parts(raw);
    if(STATUS_RE.test(list[0]))list.shift();
    const homeIndex=list.findIndex(item=>/^HOME\b/i.test(item));
    if(homeIndex>0){
      list.splice(0,homeIndex-1);
      return list.join(' · ')||'UNAVAILABLE';
    }
    if(PRICE_ERROR_RE.test(raw))return 'UNAVAILABLE';
    return list.join(' · ')||'UNAVAILABLE';
  }

  function maskLivePriceRows(){
    document.querySelectorAll('.price-source-row').forEach(row=>{
      const name=row.querySelector('.price-source-name');
      const value=row.querySelector('.price-source-value');
      const book=bookmakerFromPrice(value?.textContent)||'BOOKMAKER';
      setText(name,book);
      setText(value,cleanPriceText(value?.textContent));
    });

    document.querySelectorAll('.price-selected-name').forEach(node=>setText(node,'SELECTED'));
    document.querySelectorAll('.price-selected-value').forEach(node=>setText(node,cleanPriceText(node.textContent)));

    document.querySelectorAll('.detail-card').forEach(card=>{
      const title=String(card.querySelector('h3')?.textContent||'').trim().toUpperCase();
      if(title==='SIGNAL LOCK · LOCKED'){
        card.querySelectorAll('.check').forEach(row=>{
          const label=row.querySelector('span');
          const value=row.querySelector('b');
          if(!label||!value)return;
          if(/^BOOKMAKER\s*\/\s*SOURCE$/i.test(String(label.textContent||'').trim())){
            const book=parts(value.textContent)[0]||'—';
            setText(label,'Bookmaker');
            setText(value,book);
          }
        });
        return;
      }
      if(title!=='PRICE CHECK')return;
      card.querySelectorAll('.check').forEach(row=>{
        const label=row.querySelector('span');
        const value=row.querySelector('b');
        if(!label||!value)return;
        const labelText=String(label.textContent||'').trim();
        const sourceRow=/^SOURCE\s*\d+/i.test(labelText)||/^BOOKMAKER$/i.test(labelText)||(!/^SELECTED PRICE$/i.test(labelText)&&/^(?:Bet|Pinnacle|SBO|M88|188|12|1x)/i.test(labelText));
        if(sourceRow){
          const book=bookmakerFromPrice(value.textContent)||(!/^SOURCE\s*\d+/i.test(labelText)&&!/^BOOKMAKER$/i.test(labelText)?labelText:'BOOKMAKER');
          setText(label,book);
          setText(value,cleanPriceText(value.textContent));
        }else if(/^SELECTED PRICE$/i.test(labelText)){
          setText(value,cleanPriceText(value.textContent));
        }
      });
    });
  }

  function maskStatistics(){
    const head=[...document.querySelectorAll('.data-table thead th')];
    const bookIndex=head.findIndex(th=>/BOOK\s*\/\s*SOURCE|BOOKMAKER/i.test(th.textContent||''));
    if(bookIndex>=0){
      setText(head[bookIndex],'BOOKMAKER');
      document.querySelectorAll('.data-table tbody tr').forEach(row=>{
        const cell=row.children[bookIndex];
        if(!cell)return;
        const book=parts(cell.textContent)[0]||'—';
        setText(cell,book);
      });
    }
  }

  function maskStatus(){
    const pill=document.querySelector('.source-pill');
    if(pill){
      const text=String(pill.textContent||'').replace(/\s+/g,' ').trim();
      let next=text;
      if(/^LIVE DATA\s*·\s*LIVE/i.test(text))next='LIVE DATA · LIVE';
      else if(/SOURCE WAIT|WAITING_API/i.test(text))next='LIVE DATA · WAIT';
      else if(/ENGINE OFFLINE|OFFLINE/i.test(text)&&/^LIVE DATA/i.test(text))next='LIVE DATA · OFFLINE';
      if(next!==text){
        const dot=pill.querySelector('.dot')?.outerHTML||'<span class="dot"></span>';
        pill.innerHTML=`${dot}${next}`;
      }
    }

    const note=document.querySelector('main > .note');
    if(note&&PRIVATE_NOTE_RE.test(note.textContent||''))setText(note,'Live data temporarily unavailable.');
  }

  function footerAlert(){
    const bottom=document.querySelector('.site-footer-bottom');
    if(!bottom)return null;
    let alert=bottom.querySelector('.public-system-alert');
    if(!alert){
      alert=document.createElement('span');
      alert.className='public-system-alert';
      alert.setAttribute('role','status');
      alert.setAttribute('aria-live','polite');
      const socials=bottom.querySelector('.site-socials');
      if(socials)bottom.insertBefore(alert,socials);
      else bottom.appendChild(alert);
    }
    return alert;
  }

  function syncFooterStatus(){
    const alert=footerAlert();
    if(!alert)return;
    const pill=document.querySelector('.source-pill');
    const text=String(pill?.textContent||'').replace(/\s+/g,' ').trim();
    let label='';
    let state='';

    if(/OFFLINE|UNAVAILABLE|\bFAIL\b/i.test(text)){
      label='SYSTEM STATUS · TEMPORARILY UNAVAILABLE';
      state='is-error';
    }else if(/\bWAIT\b|SOURCE WAIT|WAITING_API/i.test(text)){
      label='SYSTEM STATUS · DATA DELAYED';
      state='is-warning';
    }

    alert.className=`public-system-alert${state?` is-visible ${state}`:''}`;
    setText(alert,label);
  }

  function sanitize(){
    maskLivePriceRows();
    maskStatistics();
    maskStatus();
    syncFooterStatus();
  }

  let queued=false;
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;sanitize();});
  }

  sanitize();
  const root=document.querySelector('main')||document.body;
  new MutationObserver(queue).observe(root,{childList:true,subtree:true,characterData:true});
  const topbar=document.querySelector('.topbar');
  if(topbar)new MutationObserver(queue).observe(topbar,{childList:true,subtree:true,characterData:true});
})();
