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
          <span class="site-social facebook" role="img" aria-label="Facebook" title="Facebook">f</span>
          <span class="site-social" role="img" aria-label="X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l14 16M19 4L5 20"/></svg></span>
          <span class="site-social" role="img" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r=".7" fill="currentColor" stroke="none"/></svg></span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(footer);

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
