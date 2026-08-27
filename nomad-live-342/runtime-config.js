(()=>{
'use strict';
const DEFAULT_ENGINE='https://nomadtips3-live-engine-342-test.mccarey-supon.workers.dev';
let override='';
try{override=localStorage.getItem('nomadEngine342Base')||''}catch{}
window.NOMAD342_RUNTIME=Object.freeze({
  version:'3.42',
  environment:'GIT',
  engineBase:String(override||DEFAULT_ENGINE).replace(/\/$/,''),
  feedPath:'/feed',
  pollMs:10000,
  requestTimeoutMs:9000,
});
})();
