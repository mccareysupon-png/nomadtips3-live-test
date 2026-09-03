(()=>{
  const row=document.querySelector('.site-footer-certrow');
  if(!row)return;

  const style=document.createElement('style');
  style.textContent=`
    .site-footer .site-footer-certrow .site-cert{background:transparent!important;border:0!important;box-shadow:none!important;border-radius:0!important}
    .site-footer .site-cert-mark.nomad-standard-icon{flex:0 0 42px!important;width:42px!important;height:42px!important;border:0!important;border-radius:0!important;padding:0!important;color:#8f928f!important;background:transparent!important;display:grid!important;place-items:center!important}
    .site-footer .site-cert-mark.nomad-standard-icon svg{display:block;width:42px;height:42px;overflow:visible}
    .site-footer .site-cert-mark.nomad-standard-icon .ring{fill:none;stroke:currentColor;stroke-width:2.2}
    .site-footer .site-cert-mark.nomad-standard-icon .stroke{fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
    .site-footer .site-cert-mark.nomad-standard-icon .fill{fill:currentColor;stroke:none}
    @media(max-width:700px){
      .site-footer .site-footer-certrow{
        display:grid!important;
        grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:6px!important;
        align-items:start!important;
        width:100%!important;
      }
      .site-footer .site-footer-certrow .site-cert{
        display:flex!important;
        flex-direction:column!important;
        align-items:center!important;
        justify-content:flex-start!important;
        gap:4px!important;
        min-width:0!important;
        padding:6px 2px!important;
        margin:0!important;
        text-align:center!important;
      }
      .site-footer .site-cert-mark.nomad-standard-icon{
        flex:0 0 26px!important;
        width:26px!important;
        height:26px!important;
      }
      .site-footer .site-cert-mark.nomad-standard-icon svg{width:26px!important;height:26px!important}
      .site-footer .site-cert-copy{
        display:flex!important;
        flex-direction:column!important;
        align-items:center!important;
        gap:1px!important;
        min-width:0!important;
        width:100%!important;
        text-align:center!important;
      }
      .site-footer .site-cert-copy b{
        display:block!important;
        font-size:8.2px!important;
        line-height:1.12!important;
        letter-spacing:.01em!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }
      .site-footer .site-cert-copy span{
        display:block!important;
        margin-top:1px!important;
        font-size:6.6px!important;
        line-height:1.15!important;
        white-space:normal!important;
        overflow-wrap:anywhere!important;
      }
      .site-footer .site-cert-copy small{
        display:block!important;
        margin-top:2px!important;
        font-size:5.8px!important;
        line-height:1.1!important;
        letter-spacing:.05em!important;
        white-space:normal!important;
      }
    }
  `;
  document.head.appendChild(style);

  const icons=[
    `<svg viewBox="0 0 48 48" role="img" aria-label="Real market price"><circle class="ring" cx="24" cy="24" r="20"/><path class="stroke" d="M13 15h11l7 7-12 12-7-7V16z"/><circle class="fill" cx="22.2" cy="18.8" r="1.5"/><path class="stroke" d="M29 33v-5m5 5v-9m5 9V20"/></svg>`,
    `<svg viewBox="0 0 48 48" role="img" aria-label="Asian handicap"><circle class="ring" cx="24" cy="24" r="20"/><text x="24" y="20" text-anchor="middle" fill="currentColor" font-family="Arial,Helvetica,sans-serif" font-size="12" font-weight="900">AH</text><path class="stroke" d="M13 24h22M24 24v12M15 32h6M30 29v6M27 32h6"/></svg>`,
    `<svg viewBox="0 0 48 48" role="img" aria-label="Transparent stats"><circle class="ring" cx="24" cy="24" r="20"/><rect class="fill" x="14" y="28" width="5" height="8" rx="1"/><rect class="fill" x="22" y="23" width="5" height="13" rx="1"/><rect class="fill" x="30" y="16" width="5" height="20" rx="1"/></svg>`,
    `<svg viewBox="0 0 48 48" role="img" aria-label="Live match evidence"><circle class="ring" cx="24" cy="24" r="20"/><circle class="fill" cx="24" cy="20" r="3.2"/><path class="stroke" d="M18.5 14.5a8 8 0 0 0 0 11M29.5 14.5a8 8 0 0 1 0 11M14.5 11a13 13 0 0 0 0 18M33.5 11a13 13 0 0 1 0 18"/><text x="24" y="37" text-anchor="middle" fill="currentColor" font-family="Arial,Helvetica,sans-serif" font-size="6.2" font-weight="900" letter-spacing=".8">LIVE</text></svg>`
  ];

  [...row.querySelectorAll('.site-cert-mark')].slice(0,4).forEach((mark,index)=>{
    mark.classList.add('nomad-standard-icon');
    mark.innerHTML=icons[index];
  });

  const base=new URL('./',document.currentScript?.src||window.location.href);
  if(!document.querySelector('link[data-nomad-pwa-install]')){
    const pwaStyle=document.createElement('link');
    pwaStyle.rel='stylesheet';
    pwaStyle.href=new URL('nomad-pwa-install.css?v=20260903-v1',base).href;
    pwaStyle.dataset.nomadPwaInstall='1';
    document.head.appendChild(pwaStyle);
  }
  if(!document.querySelector('script[data-nomad-pwa-install]')){
    const pwaScript=document.createElement('script');
    pwaScript.src=new URL('nomad-pwa-install.js?v=20260903-v1',base).href;
    pwaScript.dataset.nomadPwaInstall='1';
    document.head.appendChild(pwaScript);
  }
})();
