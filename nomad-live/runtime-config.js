(()=>{
  const host=String(window.location.hostname||'').toLowerCase();
  const PROD_HOSTS=new Set(['www.nomadtips3.com','nomadtips3.com']);
  const TEST_HOSTS=new Set(['nomadtips3-live-web-test.mccarey-supon.workers.dev']);
  const production=PROD_HOSTS.has(host);
  const test=TEST_HOSTS.has(host);
  const runtime=Object.freeze({
    environment:test?'test':'production',
    engineBase:test
      ?'/api'
      :'https://nomadtips3-live-engine.mccarey-supon.workers.dev',
    production,
    host,
  });
  window.NOMAD_RUNTIME=runtime;
  document.documentElement.dataset.nomadEnvironment=runtime.environment;
})();
