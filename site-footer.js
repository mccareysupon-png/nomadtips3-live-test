(()=>{
  'use strict';

  if (document.querySelector('.site-footer')) return;

  const script = document.currentScript;
  const root = new URL('./', script?.src || window.location.href);
  const termsUrl = new URL('terms/', root).href;
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
