/* BALL46 mobile-only Full Market view. Uses existing DOM and existing market snapshot only.
 * No network calls, no odds mutation, no changes to PC rendering or upstream polling.
 */
(()=>{'use strict';
  if(window.__b46MobileFmAccordion20261025)return;
  window.__b46MobileFmAccordion20261025=true;
  const mq=window.matchMedia('(max-width:760px)');
  const state=new Map();
  let scheduled=false;
  const ROOT='[data-full-market-card],.expand-full-market-card,[data-full-odds-main],[data-full-market],.fom-addon';
  const CLASS='b46-mobile-fm-market';
  const HEAD=':scope > .fom-market-head,:scope > .market-head,:scope > .market-header,:scope > header,:scope > h3,:scope > h4';
  const TITLES=/^(?:1x2|asian handicap|goal(?:s)?\s*o\/u|goals?\s*over\/under|corners?(?:\s*o\/u)?|cards?(?:\s*o\/u)?|both teams to score|btts|corner asian|card asian)/i;
  const trim=v=>String(v||'').replace(/\s+/g,' ').trim();
  const clean=v=>trim(v).toLowerCase();
  const fixture=root=>root.closest('[data-expanded-match]')?.getAttribute('data-expanded-match')||
      root.closest('[data-match-id],[data-fixture-id]')?.getAttribute('data-match-id')||
      root.closest('[data-match-id],[data-fixture-id]')?.getAttribute('data-fixture-id')||'';
  const numeric=s=>/\b\d+(?:\.\d+)?\b/.test(s);
  function titleOf(header){
    const heading=header.querySelector('b,strong,h3,h4,h5')||header;
    const title=trim(heading.textContent).replace(/\s*\d+\s*books\s*$/i,'');
    return title.length<=80&&TITLES.test(title)?title:'';
  }
  function stageRow(card){
    const rows=card.querySelectorAll('tr,.fom-price-row,[role="row"],.market-row,.odds-row');
    let fallback=null;
    for(const row of rows){
      const label=clean(row.querySelector('.fom-stage-label,th,td:first-child,[role="rowheader"],.stage')?.textContent||
        row.firstElementChild?.textContent||'');
      if(!/^(?:live|close|open)\b/.test(label))continue;
      const cells=[...row.children].slice(1).map(el=>trim(el.textContent)).filter(Boolean);
      if(!cells.some(numeric))continue;
      const entry={stage:label.startsWith('live')?'LIVE':label.startsWith('close')?'CLOSE':'OPEN',value:cells.join(' / ')};
      if(entry.stage==='LIVE')return entry;
      if(entry.stage==='CLOSE'||!fallback)fallback=entry;
    }
    return fallback;
  }
  function candidateCards(root){
    const candidates=new Set(root.querySelectorAll('.fmb-market,.fom-market,[data-market-key],.market-card,.odds-market-card,.fm-market,.bookmaker-market'));
    // Semantic fallback for UIs that use a plain <section> around each market table.
    for(const node of root.querySelectorAll('section,article')){
      if(candidates.has(node))continue;
      const head=node.querySelector(HEAD);
      if(!head||!titleOf(head))continue;
      if(node.querySelectorAll('tr,.fom-price-row,[role="row"],.market-row,.odds-row').length<2)continue;
      if(node.querySelectorAll(':scope > section,:scope > article').length>2)continue;
      candidates.add(node);
    }
    return [...candidates].filter(card=>{
      const head=card.querySelector(HEAD);
      return head&&titleOf(head)&&card.querySelectorAll('tr,.fom-price-row,[role="row"],.market-row,.odds-row').length>=2;
    });
  }
  function upgrade(root,card){
    const header=card.querySelector(HEAD),title=titleOf(header);
    if(!header||!title)return;
    const activeBook=root.querySelector('[data-fmb-book][aria-pressed="true"]')?.getAttribute('data-fmb-book')||'bet365';
    const key=fixture(root)+'|'+activeBook+'|'+(card.getAttribute('data-market')||title)+'|'+(header.querySelector('span')?.textContent||'');
    if(card.dataset.b46FmInstalled==='1'){
      const live=stageRow(card),summary=header.querySelector('.b46-mobile-fm-summary');
      if(summary){const nextText=live?live.stage+'  '+live.value:'Tap to view prices';if(summary.textContent!==nextText)summary.textContent=nextText;}
      return;
    }
    const children=[...card.children].filter(e=>e!==header);
    if(!children.length)return;
    // Only direct market-card children may collapse. Never hide the bookmaker switcher.
    for(const el of children)el.classList.add('b46-mobile-fm-body');
    card.classList.add(CLASS);
    card.dataset.b46FmInstalled='1';
    const live=stageRow(card);
    const summary=document.createElement('span');
    summary.className='b46-mobile-fm-summary';
    summary.textContent=live?live.stage+'  '+live.value:'Tap to view prices';
    const button=document.createElement('button');
    button.type='button';button.className='b46-mobile-fm-toggle';
    button.setAttribute('aria-label','Expand or collapse '+title);
    const selected=state.get(key)===true;
    card.dataset.b46FmOpen=selected?'true':'false';
    button.setAttribute('aria-expanded',String(selected));
    const glyph=document.createElement('span');glyph.className='b46-mobile-fm-chevron';glyph.setAttribute('aria-hidden','true');
    button.append(summary,glyph);
    button.addEventListener('click',ev=>{
      ev.preventDefault();ev.stopPropagation();
      if(!mq.matches)return;
      const willOpen=card.dataset.b46FmOpen!=='true';
      for(const other of root.querySelectorAll('.'+CLASS)){
        other.dataset.b46FmOpen='false';
        other.querySelector('.b46-mobile-fm-toggle')?.setAttribute('aria-expanded','false');
      }
      // The selected bookmaker's full snapshot is already in DOM; no fetch on click.
      card.dataset.b46FmOpen=willOpen?'true':'false';
      button.setAttribute('aria-expanded',String(willOpen));
      state.set(key,willOpen);
      if(willOpen){
        for(const [k] of state)if(k!==key&&k.startsWith(fixture(root)+'|'))state.set(k,false);
      }
      if(state.size>100)state.delete(state.keys().next().value);
    });
    header.append(button);
  }
  function roots(){
    const found=[...document.querySelectorAll(ROOT)];
    // Never fall back to general match cards outside the Full Market area.
    return found.filter(r=>r.querySelectorAll('.fmb-market,.fom-market,[data-market-key],.market-card,.odds-market-card,.fm-market,section').length>0);
  }
  function hydrate(){
    scheduled=false;
    if(!mq.matches)return;
    for(const root of roots()){
      for(const card of candidateCards(root))upgrade(root,card);
    }
  }
  function schedule(){
    if(!scheduled){scheduled=true;queueMicrotask(hydrate);}
  }
  const style=document.createElement('style');
  style.id='b46-mobile-fullmarket-accordion-20261025';
  style.textContent=[
    '@media(max-width:760px){',
    '.'+CLASS+'{min-width:0!important;border:0!important;box-shadow:0 3px 14px rgba(0,0,0,.10)!important;border-radius:12px!important;overflow:hidden!important;}',
    '.'+CLASS+'[data-b46-fm-open="false"] > .b46-mobile-fm-body{display:none!important;}',
    '.'+CLASS+' > .fom-market-head,.'+CLASS+' > .market-head,.'+CLASS+' > .market-header,.'+CLASS+' > header{min-width:0!important;border:0!important;}',
    '.'+CLASS+'.fmb-market > header{display:flex!important;flex-wrap:wrap!important;align-items:center!important;row-gap:3px!important;}',
    '.'+CLASS+'.fmb-market > header > .b46-mobile-fm-toggle{flex:0 0 100%;margin:0!important;}',
    '.'+CLASS+' .b46-mobile-fm-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:36px;margin-top:5px;padding:5px 0;background:transparent;border:0;color:inherit;text-align:left;font:inherit;cursor:pointer;}',
    '.'+CLASS+' .b46-mobile-fm-summary{font-size:12px;font-weight:650;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;color:#bfe5d1;}',
    '.'+CLASS+' .b46-mobile-fm-chevron{flex:0 0 auto;width:9px;height:9px;border-right:2px solid #a6cdb8;border-bottom:2px solid #a6cdb8;transform:rotate(45deg);transition:transform .18s ease;}',
    '.'+CLASS+'[data-b46-fm-open="true"] .b46-mobile-fm-chevron{transform:rotate(225deg);}',
    '.'+CLASS+' .b46-mobile-fm-toggle:focus-visible{outline:2px solid #43e6a2;outline-offset:3px;border-radius:4px;}',
    '}',
    '@media(min-width:761px){.b46-mobile-fm-toggle{display:none!important;}}',
    '@media(prefers-reduced-motion:reduce){.b46-mobile-fm-chevron{transition:none!important;}}'
  ].join('');
  document.head.append(style);
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:false});
  mq.addEventListener?.('change',schedule);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();