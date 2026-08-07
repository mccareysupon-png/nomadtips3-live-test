(()=>{
  'use strict';

  const script = document.currentScript;
  const root = new URL('./', script?.src || window.location.href);

  if (window.location.pathname.includes('/live-condition-alert/')) {
    const hasHomeAwayDisplay = [...document.scripts].some(node =>
      String(node.src || '').includes('/live-condition-alert/home-away-display.js')
    );
    if (!hasHomeAwayDisplay) {
      const homeAwayDisplay = document.createElement('script');
      homeAwayDisplay.src = new URL('live-condition-alert/home-away-display.js?v=202608071952', root).href;
      homeAwayDisplay.defer = true;
      homeAwayDisplay.dataset.nomadHomeAwayDisplay = 'true';
      document.head.appendChild(homeAwayDisplay);
    }
  }

  if (window.location.pathname.includes('/test-system/stats/')) {
    if (!document.querySelector('link[data-nomad-stats-card-fix]')) {
      const cardFixStyle = document.createElement('link');
      cardFixStyle.rel = 'stylesheet';
      cardFixStyle.href = new URL('test-system/stats/card-size-fix.css?v=202608061320', root).href;
      cardFixStyle.dataset.nomadStatsCardFix = 'true';
      document.head.appendChild(cardFixStyle);
    }

    const hasOfficialSync = [...document.scripts].some(node =>
      String(node.src || '').includes('/test-system/stats/official-final-sync.js')
    );
    if (!hasOfficialSync) {
      const officialSync = document.createElement('script');
      officialSync.src = new URL('test-system/stats/official-final-sync.js?v=202608060735', root).href;
      officialSync.async = false;
      officialSync.dataset.nomadOfficialFinalSync = 'true';
      document.head.appendChild(officialSync);
    }
  }

  const hasMatchLists = document.querySelector('#pickGrid, #historyRows, #posterList, #matches');
  if (hasMatchLists) {
    if (!document.querySelector('link[data-nomad-match-order]')) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = new URL('test-system/pick-order.css?v=202608041350', root).href;
      style.dataset.nomadMatchOrder = 'true';
      document.head.appendChild(style);
    }
    if (!document.querySelector('script[data-nomad-match-order]')) {
      const orderScript = document.createElement('script');
      orderScript.src = new URL('match-order.js?v=202608041350', root).href;
      orderScript.defer = true;
      orderScript.dataset.nomadMatchOrder = 'true';
      document.head.appendChild(orderScript);
    }
  }

  if (document.querySelector('#historyRows') && !document.querySelector('script[data-nomad-history-pagination]')) {
    const paginationScript = document.createElement('script');
    paginationScript.src = new URL('test-system/stats/history-pagination.js?v=202608061056', root).href;
    paginationScript.defer = true;
    paginationScript.dataset.nomadHistoryPagination = 'true';
    document.head.appendChild(paginationScript);
  }

  if (document.querySelector('.site-footer')) return;

  const termsUrl = new URL('terms/', root).href;
  const privacyUrl = new URL('privacy/', root).href;
  const aboutUrl = new URL('about/', root).href;

  // Replace these two URLs with the official NOMADTIPS3 profile links when ready.
  const socialUrls = {
    facebook: 'https://www.facebook.com/',
    x: 'https://x.com/'
  };

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.setAttribute('aria-label', 'NOMADTIPS3 website information');
  footer.innerHTML = `
    <div class="site-footer__inner">
      <div class="site-footer__left">
        <p class="site-footer__copyright">© 2026 NOMADTIPS3. All Rights Reserved.</p>
        <a class="site-footer__email" href="mailto:manualprototype@nomadtips3.com">manualprototype@nomadtips3.com</a>
      </div>

      <div class="site-footer__right">
        <nav class="site-footer__links" aria-label="Legal and company information">
          <a href="${termsUrl}">Copyright &amp; Terms</a>
          <span class="site-footer__divider" aria-hidden="true"></span>
          <a href="${privacyUrl}">Privacy Policy</a>
          <span class="site-footer__divider" aria-hidden="true"></span>
          <a href="${aboutUrl}">About Us</a>
        </nav>

        <nav class="site-footer__socials" aria-label="NOMADTIPS3 social media">
          <a class="site-footer__social-link" href="${socialUrls.facebook}" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.7-1.6H17V4.1c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.6H8.2v3.2h2.6V22h2.9Z"/></svg>
          </a>
          <a class="site-footer__social-link" href="${socialUrls.x}" target="_blank" rel="noopener noreferrer" aria-label="X" title="X">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 3H22l-6.8 7.8L23 21h-6.1l-4.8-6.3L6.6 21H3.5l7.2-8.3L3.2 3h6.3l4.3 5.7L18.9 3Zm-1.1 16.2h1.7L8.6 4.7H6.8l11 14.5Z"/></svg>
          </a>
        </nav>
      </div>
    </div>`;

  const fixedNav = document.querySelector('.main-nav');
  if (fixedNav) {
    document.body.classList.add('has-fixed-site-nav');
    document.body.insertBefore(footer, fixedNav);
  } else {
    document.body.appendChild(footer);
  }
})();
