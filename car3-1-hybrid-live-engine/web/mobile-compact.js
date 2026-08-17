(()=>{
  const MOBILE_QUERY='(max-width: 760px)';
  const mq=window.matchMedia(MOBILE_QUERY);
  let button=null;

  function markExtraContent(){
    const detail=document.querySelector('.detail');
    if(!detail)return;

    const titles=[...detail.querySelectorAll(':scope > .section-title')];
    titles.slice(1).forEach(el=>el.classList.add('mobile-extra'));

    [
      '.charts',
      '#evidenceGrid',
      '.tabs',
      '#tab-odds',
      '#tab-events',
      '#tab-source',
      '.decision',
      '.footer-note'
    ].forEach(selector=>{
      detail.querySelectorAll(selector).forEach(el=>el.classList.add('mobile-extra'));
    });
  }

  function ensureToggle(){
    const grid=document.querySelector('#statsGrid');
    if(!grid||button)return;
    button=document.createElement('button');
    button.type='button';
    button.className='mobile-more-toggle';
    button.setAttribute('aria-expanded','false');
    button.innerHTML='<span>More stats</span><small>ODDS · PRESSURE · EVENTS · SIGNAL STATUS</small>';
    button.addEventListener('click',()=>{
      const open=document.body.classList.toggle('mobile-more-open');
      button.setAttribute('aria-expanded',String(open));
      button.querySelector('span').textContent=open?'Less stats':'More stats';
      if(!open)button.scrollIntoView({block:'nearest',behavior:'smooth'});
    });
    grid.insertAdjacentElement('afterend',button);
  }

  function ensureStyles(){
    if(document.querySelector('link[data-car31-mobile-compact]'))return;
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href=new URL('./mobile-compact.css?v=20260818-r1',import.meta.url).href;
    link.dataset.car31MobileCompact='true';
    document.head.appendChild(link);
  }

  function applyMode(){
    document.body.classList.toggle('mobile-compact',mq.matches);
    if(!mq.matches){
      document.body.classList.remove('mobile-more-open');
      if(button){
        button.setAttribute('aria-expanded','false');
        const label=button.querySelector('span');
        if(label)label.textContent='More stats';
      }
    }
  }

  function init(){
    ensureStyles();
    markExtraContent();
    ensureToggle();
    applyMode();
    mq.addEventListener?.('change',applyMode);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
