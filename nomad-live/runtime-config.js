(()=>{
  const host=String(window.location.hostname||'').toLowerCase();
  const PROD_HOSTS=new Set(['www.nomadtips3.com','nomadtips3.com']);
  const production=PROD_HOSTS.has(host);
  const runtime=Object.freeze({
    environment:production?'production':'test',
    engineBase:production
      ?'https://nomadtips3-live-engine.mccarey-supon.workers.dev'
      :'/api',
    production,
    host,
  });
  window.NOMAD_RUNTIME=runtime;
  document.documentElement.dataset.nomadEnvironment=runtime.environment;
})();
