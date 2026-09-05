(()=>{
  'use strict';

  const script=document.currentScript;
  const root=new URL('./',script?.src||window.location.href);
  const path=String(window.location.pathname||'');

  const infoPath=/\/(?:about|privacy|terms|user-guide|disclaimer)(?:\/|$)/i.test(path);
  const signalPath=path==='/'||/\/nomad-live\/(?:index\.html)?\/?$/i.test(path);
  const statisticsPath=path==='/statistics.html'||/\/nomad-live\/statistics\.html\/?$/i.test(path);
  const picksPath=/\/soccer-predictions(?:\/index\.html)?\/?$/i.test(path);
  const prediction3Path=/\/prediction3(?:\/index\.html)?\/?$/i.test(path);
  const publicRailPath=signalPath||statisticsPath||picksPath||prediction3Path;

  const stripPicksNavigation=()=>{
    document.querySelectorAll('.topnav a,.mobile-nav a').forEach(link=>{
      const href=String(link.getAttribute('href')||'');
      if(/soccer-predictions/i.test(href))link.remove();
    });
  };
  stripPicksNavigation();

  /* Scope lock:
     Page 1 Signal      -> add link rail only, below original 3.41 footer content.
     Page 2 Statistics  -> add link rail only, below original 3.41 footer content.
     Page 3 Live Score  -> handled by the isolated 3.42 UI-only footer layer.
     Page 4 Picks       -> add link rail only at the page bottom; do not create a footer.
     Prediction3        -> add link rail below the original 3.41 footer content.
     Information pages  -> retain their existing information-page footer behavior.
     Picks navigation   -> removed from desktop/tablet/mobile navigation wherever this module is loaded. */
  if(!infoPath&&!publicRailPath)return;

  const predictionsHref='https://www.nomadtips3.com/prediction2';
  const links=[
    ['Soccer Predictions',predictionsHref],
    ['About Us',new URL('about/',root).href],
    ['User Guide',new URL('user-guide/',root).href],
    ['Privacy Policy',new URL('privacy/',root).href],
    ['Terms of Service',new URL('terms/',root).href],
    ['Disclaimer',new URL('disclaimer/',root).href],
    ['Mobile App',new URL('?install=app',root).href],
    ['Betting Outlook',new URL('news.html',root).href,true]
  ];

  const rail=(standalone=false)=>{
    const nav=document.createElement('nav');
    nav.className=`nomad-info-linkrail${standalone?' nomad-info-linkrail--standalone':''}`;
    nav.setAttribute('aria-label','NOMADTIPS3 information pages');
    nav.innerHTML=links.map(([label,href,newTab])=>`<a href="${href}"${newTab?' target="_blank" rel="noopener noreferrer"':''}>${label}</a>`).join('');
    return nav;
  };

  const attachPublicRail=()=>{
    stripPicksNavigation();
    if(document.querySelector('.nomad-info-linkrail'))return;

    if(picksPath){
      document.body.appendChild(rail(true));
      return;
    }

    let attempts=0;
    const mount=()=>{
      const footer=document.querySelector('.site-footer');
      if(!footer){
        if(attempts++<40)setTimeout(mount,50);
        return;
      }
      if(footer.querySelector('.nomad-info-linkrail'))return;
      const inner=footer.querySelector('.site-footer-inner,.site-footer__inner')||footer;
      /* Append after every original footer section, including copyright/social. */
      inner.appendChild(rail(false));
    };
    mount();
  };

  if(publicRailPath){
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',attachPublicRail,{once:true});else attachPublicRail();
    return;
  }

  const attachToExisting=footer=>{
    stripPicksNavigation();
    if(!footer||footer.querySelector('.nomad-info-linkrail'))return;
    const bottom=footer.querySelector('.site-footer-bottom');
    if(bottom){
      bottom.insertAdjacentElement('beforebegin',rail());
      return;
    }
    const inner=footer.querySelector('.site-footer__inner,.site-footer-inner');
    (inner||footer).appendChild(rail());
  };

  const createStandalone=()=>{
    const footer=document.createElement('footer');
    footer.className='nomad-info-footer';
    footer.setAttribute('aria-label','NOMADTIPS3 information and contact');
    footer.innerHTML=`<div class="nomad-info-footer-inner">
      <div class="nomad-info-footer-brand">nomad<span>tips</span>3</div>
      <p class="nomad-info-footer-lead"><strong>NOMADTIPS3 is an independent football information, analysis and live match-monitoring interface.</strong> It does not accept bets, hold wagering balances or process wagering transactions.</p>
      <div data-nomad-info-rail></div>
      <div class="nomad-info-footer-meta">
        <div class="nomad-info-footer-contact">Contact: <a href="mailto:manualprototype@nomadtips3.com">manualprototype@nomadtips3.com</a></div>
        <div class="nomad-info-footer-copy">© 2026 NOMADTIPS3 · Information and entertainment use only.</div>
      </div>
    </div>`;
    footer.querySelector('[data-nomad-info-rail]')?.replaceWith(rail());
    document.body.appendChild(footer);
  };

  const removeLegacyFooterStyle=()=>{
    [...document.querySelectorAll('link[rel="stylesheet"]')].forEach(node=>{
      const href=String(node.href||'');
      const isLegacy=/\/site-footer\.css(?:\?|$)/i.test(href);
      const isOriginal=/\/nomad-live\/site-footer\.css(?:\?|$)/i.test(href);
      if(isLegacy&&!isOriginal)node.remove();
    });
  };

  const restoreOriginal341Footer=()=>{
    stripPicksNavigation();
    const current=document.querySelector('.site-footer');
    if(current?.querySelector('.site-footer-certrow')){
      attachToExisting(current);
      return;
    }

    if(current)current.remove();
    removeLegacyFooterStyle();

    const cssHref=new URL('nomad-live/site-footer.css?v=20260831-info-restore-v2',root).href;
    if(!document.querySelector('link[data-nomad-original-footer]')){
      const style=document.createElement('link');
      style.rel='stylesheet';
      style.href=cssHref;
      style.dataset.nomadOriginalFooter='3.41';
      document.head.appendChild(style);
    }

    const existingScript=document.querySelector('script[data-nomad-original-footer]');
    if(existingScript)return;

    const original=document.createElement('script');
    original.src=new URL('nomad-live/site-footer.js?v=20260831-info-restore-v2',root).href;
    original.defer=true;
    original.dataset.nomadOriginalFooter='3.41';
    original.onload=()=>attachToExisting(document.querySelector('.site-footer'));
    original.onerror=()=>{
      console.warn('Original NOMAD 3.41 footer unavailable; using safe fallback.');
      if(!document.querySelector('.site-footer,.nomad-info-footer'))createStandalone();
    };
    document.body.appendChild(original);
  };

  const mount=()=>restoreOriginal341Footer();

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
