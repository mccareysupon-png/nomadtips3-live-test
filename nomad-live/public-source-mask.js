(()=>{
  'use strict';

  const BOOKMAKER_RE=/\b(Bet365|Pinnacle|SBOBET|M88|188BET|12BET|1xBet)\b/i;
  const PROVIDER_RE=/\b(?:Odds-API\.io|The Odds API|API-Football|TotalCorner|Nowgoal|Goaloo|Oddspedia|SOURCE\s*\d+|S\d+)\b/gi;
  const TECHNICAL_RE=/(?:http\s*\d{3}|parser|endpoint|fallback|provider|source[_ -]?blocked|challenge page|api key|price_fetch_failed|source_timeout)/i;

  const bookmaker=text=>String(text||'').match(BOOKMAKER_RE)?.[1]||'';
  const setText=(node,value)=>{
    if(!node)return;
    const next=String(value??'');
    if(node.textContent!==next)node.textContent=next;
  };

  function cleanPriceText(value){
    let text=String(value||'').trim().replace(/\s+/g,' ');
    if(!text)return text;
    if(TECHNICAL_RE.test(text))return 'UNAVAILABLE';
    text=text
      .replace(/^(?:PASS|WAIT|STALE|FAIL|UNAVAILABLE)\s*·\s*/i,'')
      .replace(PROVIDER_RE,'')
      .replace(/\s*·\s*·\s*/g,' · ')
      .replace(/^\s*[·|/,:-]+\s*|\s*[·|/,:-]+\s*$/g,'')
      .replace(/\s{2,}/g,' ')
      .trim();
    return text||'UNAVAILABLE';
  }

  function maskLivePriceRows(){
    document.querySelectorAll('.price-source-row').forEach(row=>{
      const name=row.querySelector('.price-source-name');
      const value=row.querySelector('.price-source-value');
      const book=bookmaker(value?.textContent)||bookmaker(name?.textContent)||bookmaker(row.textContent);
      setText(name,book||'BOOKMAKER');
      setText(value,cleanPriceText(value?.textContent));
    });

    document.querySelectorAll('.price-selected-name').forEach(node=>setText(node,'SELECTED'));
    document.querySelectorAll('.price-selected-value').forEach(node=>setText(node,cleanPriceText(node.textContent)));

    document.querySelectorAll('.detail-card').forEach(card=>{
      const title=String(card.querySelector('h3')?.textContent||'').trim().toUpperCase();
      if(title!=='PRICE CHECK')return;
      card.querySelectorAll('.check').forEach(row=>{
        const label=row.querySelector('span');
        const value=row.querySelector('b');
        if(!label||!value)return;
        const labelText=String(label.textContent||'').trim();
        const priceSourceRow=/^SOURCE\s*\d+/i.test(labelText)||/^BOOKMAKER$/i.test(labelText)||BOOKMAKER_RE.test(labelText);
        if(priceSourceRow){
          const book=bookmaker(value.textContent)||bookmaker(labelText)||bookmaker(row.textContent);
          setText(label,book||'BOOKMAKER');
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
        const book=bookmaker(cell.textContent);
        setText(cell,book||'—');
      });
    }
  }

  function maskStatus(){
    const pill=document.querySelector('.source-pill');
    if(pill){
      const text=String(pill.textContent||'').replace(/\s+/g,' ').trim();
      const next=text
        .replace(/\s*·\s*(?:TotalCorner|Nowgoal|Goaloo|Odds-API\.io|The Odds API|API-Football|Oddspedia).*$/i,'')
        .replace(/SOURCE WAIT/gi,'WAIT')
        .replace(/ENGINE OFFLINE/gi,'OFFLINE');
      if(next!==text){
        const dot=pill.querySelector('.dot')?.outerHTML||'<span class="dot"></span>';
        pill.innerHTML=`${dot}${next}`;
      }
    }

    const note=document.querySelector('main > .note');
    if(note&&TECHNICAL_RE.test(note.textContent||''))setText(note,'Live data temporarily unavailable.');
  }

  function sanitize(){
    maskLivePriceRows();
    maskStatistics();
    maskStatus();
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
