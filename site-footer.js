(()=>{
  'use strict';

  if (document.querySelector('.site-footer')) return;

  const script = document.currentScript;
  const root = new URL('./', script?.src || window.location.href);
  const termsUrl = new URL('terms/', root).href;
  const aboutUrl = new URL('about/', root).href;

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.setAttribute('aria-label', 'NOMADTIPS3 website information');
  footer.innerHTML = `
    <div class="site-footer__inner">
      <p class="site-footer__copyright">© 2026 NOMADTIPS3. All Rights Reserved.</p>
      <nav class="site-footer__links" aria-label="Legal and company information">
        <a href="${termsUrl}">Copyright &amp; Terms</a>
        <span aria-hidden="true">•</span>
        <a href="${aboutUrl}">About Us</a>
      </nav>
      <a class="site-footer__email" href="mailto:manualprototype@nomadtips3.com">manualprototype@nomadtips3.com</a>
    </div>`;

  const fixedNav = document.querySelector('.main-nav');
  if (fixedNav) {
    document.body.classList.add('has-fixed-site-nav');
    document.body.insertBefore(footer, fixedNav);
  } else {
    document.body.appendChild(footer);
  }
})();
