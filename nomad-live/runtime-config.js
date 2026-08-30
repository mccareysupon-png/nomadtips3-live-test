(()=>{
  const host=String(window.location.hostname||'').toLowerCase();
  const PROD_BOUND_HOSTS=new Set([
    'www.nomadtips3.com',
    'nomadtips3.com',
    'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
  ]);
  const TEST_BOUND_HOSTS=new Set([
    'nomadtips3-live-web-test.mccarey-supon.workers.dev',
  ]);
  const PROD_DIRECT_HOSTS=new Set([
    'mccareysupon-png.github.io',
  ]);
  const boundProduction=PROD_BOUND_HOSTS.has(host);
  const directProduction=PROD_DIRECT_HOSTS.has(host);
  const production=boundProduction||directProduction;
  const test=TEST_BOUND_HOSTS.has(host);
  const runtime=Object.freeze({
    environment:production?'production':'test',
    engineBase:directProduction
      ?'https://nomadtips3-live-engine.mccarey-supon.workers.dev'
      :'/api',
    transport:directProduction?'direct':'service-binding',
    production,
    test,
    host,
  });
  window.NOMAD_RUNTIME=runtime;
  document.documentElement.dataset.nomadEnvironment=runtime.environment;
})();
