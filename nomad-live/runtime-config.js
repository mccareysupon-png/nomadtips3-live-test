(()=>{
  const host=String(window.location.hostname||'').toLowerCase();
  const PROD_HOSTS=new Set(['www.nomadtips3.com','nomadtips3.com','mccareysupon-png.github.io']);
  const TEST_HOSTS=new Set(['nomadtips3-live-web-test.mccarey-supon.workers.dev']);
  const production=PROD_HOSTS.has(host);
  const test=TEST_HOSTS.has(host);
  const runtime=Object.freeze({
    environment:production?'production':'test',
    engineBase:production
      ?'https://nomadtips3-live-engine.mccarey-supon.workers.dev'
      :'/api',
    production,
    test,
    host,
  });
  window.NOMAD_RUNTIME=runtime;
  document.documentElement.dataset.nomadEnvironment=runtime.environment;
})();
