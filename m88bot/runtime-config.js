(()=>{
'use strict';
window.NOMAD_M88BOT_RUNTIME=Object.freeze({
  version:'3.42',
  mode:'READ_ONLY',
  sourceBranch:'work/nomad342-central-ledger',
  engineBase:'https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev',
  endpoints:Object.freeze({health:'/health',feed:'/feed',statistics:'/api/v1/statistics/summary'}),
  refreshMs:15000,
  requestTimeoutMs:9000,
  targetRoute:'https://www.nomadtips3.com/m88bot',
  routeState:'NOT_ROUTED',
  centralLedgerState:'NOT_PROVISIONED'
});
})();
