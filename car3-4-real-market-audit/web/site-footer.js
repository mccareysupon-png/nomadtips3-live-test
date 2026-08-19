(()=>{
  if(document.querySelector('.site-footer')) return;

  const footer=document.createElement('footer');
  footer.className='site-footer';
  footer.setAttribute('aria-label','nomadtips3 information and contact');
  footer.innerHTML=`
    <div class="site-footer-inner">
      <div class="site-footer-certrow" aria-label="nomadtips3 internal transparency standards">
        <div class="site-cert"><div class="site-cert-mark">MP</div><div class="site-cert-copy"><b>REAL MARKET PRICE</b><span>Recorded market reference</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">AH</div><div class="site-cert-copy"><b>ASIAN HANDICAP</b><span>Transparent settlement method</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">ST</div><div class="site-cert-copy"><b>TRANSPARENT STATS</b><span>Locked record history</span><small>NOMAD STANDARD</small></div></div>
        <div class="site-cert"><div class="site-cert-mark">LIVE</div><div class="site-cert-copy"><b>LIVE MATCH EVIDENCE</b><span>Recorded match context</span><small>NOMAD STANDARD</small></div></div>
      </div>

      <div class="site-footer-main">
        <div class="site-footer-brand">nomadtips3</div>
        <p class="site-footer-lead"><strong>nomadtips3 is not a gambling website.</strong> It is a football prediction and live match-monitoring platform created for entertainment purposes only. Signals, live indicators, market references and statistical records are provided as supporting information for football predictions for entertainment.</p>
        <div class="site-footer-copy">
          <p>This website does not accept bets, process wagers or provide gambling transactions. Information is displayed for match analysis, transparency, historical review and entertainment.</p>
          <p>Market prices may change after a signal is recorded. Locked records preserve the price, Asian Handicap, entry score and time available at the recorded signal point. Historical results remain visible to support transparent performance review.</p>
          <p>Users are responsible for how they interpret and use the information presented. Nothing on this website guarantees a future sporting outcome.</p>
          <p>By accessing or continuing to use this website, you acknowledge that basic browser storage or technical cookies may be used where necessary for site operation, performance and user experience. See our <a href="privacy-policy.html">Privacy Policy</a> and <a href="terms-of-service.html">Terms of Service</a>.</p>
        </div>

        <div class="site-footer-meta">
          <div class="site-contact">
            <b>Administrative Contact</b>
            nomadtips3 Information Services<br>
            Northhaven House, 7 Beacon Quay<br>
            Greyhaven Island, Atlantic Territory · GH 1047<br>
            Contact: <a href="mailto:manualprototype@nomadtips3.com">manualprototype@nomadtips3.com</a>
          </div>
          <div class="site-footer-side">
            <div class="site-platform-time"><small>Local Time</small><b id="nomadPlatformTime">--:--:--</b></div>
            <nav class="site-score-links" aria-label="Scores and results">
              <strong>Scores &amp; Results</strong>
              <a href="https://mccareysupon-png.github.io/nomadtips3-live-test/car-livescore/web/" target="_blank" rel="noopener noreferrer">Live Scores</a>
              <a href="https://mccareysupon-png.github.io/nomadtips3-live-test/car-livescore/web/results.html" target="_blank" rel="noopener noreferrer">Results</a>
            </nav>
          </div>
        </div>
      </div>

      <div class="site-footer-bottom">
        <div class="site-footer-legal">
          <span>© 2026 nomadtips3. Information and entertainment use only.</span>
          <div class="site-legal-links"><a href="privacy-policy.html">Privacy Policy</a><span>·</span><a href="terms-of-service.html">Terms of Service</a></div>
        </div>
        <div class="site-socials" aria-label="Social channels coming soon">
          <span class="site-social" role="img" aria-label="X" title="X"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l14 16M19 4L5 20"/></svg></span>
          <span class="site-social facebook" role="img" aria-label="Facebook" title="Facebook">f</span>
          <span class="site-social" role="img" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.5"/><circle cx="17.2" cy="6.8" r=".7" fill="currentColor" stroke="none"/></svg></span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(footer);

  const timeEl=document.getElementById('nomadPlatformTime');
  let baseEpoch=Date.now();
  let basePerf=performance.now();

  const render=()=>{
    const d=new Date(baseEpoch+(performance.now()-basePerf));
    const hh=String(d.getHours()).padStart(2,'0');
    const mm=String(d.getMinutes()).padStart(2,'0');
    const ss=String(d.getSeconds()).padStart(2,'0');
    if(timeEl) timeEl.textContent=`${hh}:${mm}:${ss}`;
  };

  render();
  setInterval(render,1000);

  (async()=>{
    try{
      const response=await fetch(location.href,{method:'HEAD',cache:'no-store'});
      const serverDate=response.headers.get('Date');
      const parsed=serverDate?Date.parse(serverDate):NaN;
      if(Number.isFinite(parsed)){
        baseEpoch=parsed;
        basePerf=performance.now();
        render();
      }
    }catch{}
  })();
})();
