(()=>{
  'use strict';

  const script=document.currentScript;
  const root=new URL('./',script?.src||window.location.href);
  const links=[
    ['About Us',new URL('about/',root).href],
    ['User Guide',new URL('user-guide/',root).href],
    ['Privacy Policy',new URL('privacy/',root).href],
    ['Terms of Service',new URL('terms/',root).href],
    ['Disclaimer',new URL('disclaimer/',root).href]
  ];

  const rail=()=>{
    const nav=document.createElement('nav');
    nav.className='nomad-info-linkrail';
    nav.setAttribute('aria-label','NOMADTIPS3 information pages');
    nav.innerHTML=links.map(([label,href])=>`<a href="${href}">${label}</a>`).join('');
    return nav;
  };

  const attachToExisting=footer=>{
    if(footer.querySelector('.nomad-info-linkrail'))return;
    const bottom=footer.querySelector('.site-footer-bottom');
    if(bottom)bottom.insertAdjacentElement('beforebegin',rail());
    else footer.appendChild(rail());
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

  const mount=()=>{
    const existing=document.querySelector('.site-footer');
    if(existing)attachToExisting(existing);else createStandalone();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
