(()=>{
  if(document.querySelector('.site-footer')) return;

  const footer=document.createElement('footer');
  footer.className='site-footer';
  footer.setAttribute('aria-label','nomadtips3 information and contact');
  footer.innerHTML=`
    <div class="site-footer-inner">
      <div class="site-footer-certrow" aria-label="nomadtips3 transparency standards">
        <div class="site-cert"><div class="site-cert-mark">MP</div><div class="site-cert-copy"><b>REAL MARKET PRICE</b><span>Recorded market reference</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">AH</div><div class="site-cert-copy"><b>ASIAN HANDICAP</b><span>Transparent settlement method</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">ST</div><div class="site-cert-copy"><b>TRANSPARENT STATS</b><span>Locked record history</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">LIVE</div><div class="site-cert-copy"><b>LIVE MATCH EVIDENCE</b><span>Recorded match context</span><small>NOMAD STANDARD</small></div></div>
      </div>

      <div class="site-footer-main">
        <div class="site-footer-brand">nomad<span>tips</span>3</div>
        <p class="site-footer-lead"><strong>nomadtips3 is an independent football prediction and live match-monitoring interface.</strong> It does not accept bets or process wagering transactions.</p>
        <div class="site-footer-copy">
          <p>Signals, live indicators, market references and statistical records are presented for football analysis, transparency, historical review and entertainment.</p>
          <p>Recorded signals preserve the available market reference, Asian Handicap, entry score and timestamp at the moment the record is locked. Market prices and match conditions may change afterwards.</p>
          <p>Data may be delayed, incomplete or temporarily unavailable. Historical records do not guarantee future sporting outcomes.</p>
        </div>

        <div class="site-footer-meta">
          <div class="site-contact">
            <b>Administrative Contact</b>
            nomadtips3 Information Services<br>
            Northhaven House, 7 Beacon Quay<br>
            Greyhaven Island, Atlantic Territory · GH 1047<br>
            Contact: <a href="mailto:manualprototype@nomadtips3.com">manualprototype@nomadtips3.com</a>
            <span class="placeholder">Remote correspondence placeholder · fictional location used for privacy.</span>
          </div>
          <div class="site-platform-time"><small>Local Time</small><b id="nomadPlatformTime">--:--:--</b></div>
        </div>
      </div>

      <div class="site-footer-bottom">
        <span>© 2026 nomadtips3. Information and entertainment use only.</span>
        <div class="site-socials" aria-label="Social channels">
          <span class="site-social facebook" role="img" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.7-1.6H17V4.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.6H8.2v3.2h2.6V22h2.9Z"/></svg></span>
          <span class="site-social x" role="img" aria-label="X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 3H22l-6.8 7.8L23 21h-6.1l-4.8-6.3L6.6 21H3.5l7.2-8.3L3.2 3h6.3l4.3 5.7L18.9 3Zm-1.1 16.2h1.7L8.6 4.7H6.8l11 14.5Z"/></svg></span>
          <span class="site-social instagram" role="img" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r=".7" class="instagram-dot"/></svg></span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(footer);

  const pagePath=String(window.location.pathname||'');
  const isStatistics=pagePath==='/statistics.html'||/\/nomad-live\/statistics\.html\/?$/i.test(pagePath);
  if(isStatistics&&!footer.querySelector('.nomad-info-linkrail')){
    if(!document.querySelector('style[data-statistics-info-links]')){
      const style=document.createElement('style');
      style.dataset.statisticsInfoLinks='1';
      style.textContent=`
        .site-footer .nomad-info-linkrail{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:0;margin:14px 0 0;padding:14px 0 2px;border-top:1px solid rgba(255,255,255,.07)}
        .site-footer .nomad-info-linkrail a{color:#929792;text-decoration:none;font:800 9px/1.35 Arial,Helvetica,sans-serif;padding:3px 10px;transition:color .14s ease}
        .site-footer .nomad-info-linkrail a:hover,.site-footer .nomad-info-linkrail a:focus-visible{color:#00f0a8;outline:none}
        .site-footer .nomad-info-linkrail .sep{color:rgba(255,255,255,.18);font:700 9px/1 Arial,Helvetica,sans-serif}
        @media(max-width:700px){.site-footer .nomad-info-linkrail{row-gap:6px;padding-top:12px}.site-footer .nomad-info-linkrail a{font-size:8.5px;padding:4px 7px}}
      `;
      document.head.appendChild(style);
    }
    const nav=document.createElement('nav');
    nav.className='nomad-info-linkrail';
    nav.setAttribute('aria-label','NOMADTIPS3 information pages');
    nav.innerHTML='<a href="https://www.nomadtips3.com/prediction2">Soccer Predictions</a><span class="sep">|</span><a href="/about/">About Us</a><span class="sep">|</span><a href="/user-guide/">User Guide</a><span class="sep">|</span><a href="/privacy/">Privacy Policy</a><span class="sep">|</span><a href="/terms/">Terms of Service</a><span class="sep">|</span><a href="/disclaimer/">Disclaimer</a>';
    footer.querySelector('.site-footer-inner')?.appendChild(nav);
  }

  const timeEl=document.getElementById('nomadPlatformTime');
  const render=()=>{
    const d=new Date();
    const hh=String(d.getHours()).padStart(2,'0');
    const mm=String(d.getMinutes()).padStart(2,'0');
    const ss=String(d.getSeconds()).padStart(2,'0');
    if(timeEl) timeEl.textContent=`${hh}:${mm}:${ss}`;
  };
  render();
  setInterval(render,1000);
})();

(()=>{
  const path=String(window.location.pathname||'');
  if(!/\/(?:settings|statistics)(?:\.html)?\/?$/i.test(path))return;
  if(document.querySelector('script[data-match-scout-sidecar]'))return;
  const script=document.createElement('script');
  script.src='match-scout-sidecar.js?v=20260828-central-v2';
  script.dataset.matchScoutSidecar='1';
  script.onerror=()=>console.warn('Match Scouts sidecar unavailable; core page remains unchanged.');
  document.head.appendChild(script);
})();

(()=>{
  const target='https://www.nomadtips3.com/prediction2';
  const fix=()=>{
    document.querySelectorAll('.nomad-info-linkrail a').forEach(link=>{
      const label=String(link.textContent||'').trim();
      if(/^Soccer\s+Pre/i.test(label)){
        link.textContent='Soccer Predictions';
        link.href=target;
      }
    });
  };
  fix();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fix,{once:true});
  [100,500,1500,2500].forEach(ms=>setTimeout(fix,ms));
})();

/* 2026-09-05 footer-target production release: includes Prediction2 direct footer + Statistics rail. */
