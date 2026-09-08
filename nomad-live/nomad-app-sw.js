/* NOMADTIPS3 PWA service worker.
   Live pages/APIs remain network-only to avoid stale scores, odds, signals or match state.
   Only static launch artwork is cached for a faster mobile app opening. */
const VERSION='nomadtips3-pwa-20260908-v2';
const STATIC_CACHE=`${VERSION}-static`;
const STATIC_ASSETS=[
  './nomad-app-icon.svg?v=20260908-v3',
  './nomad-app-splash-stadium.b64?v=20260908-v1'
];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache=>cache.addAll(STATIC_ASSETS))
      .catch(()=>{})
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==STATIC_CACHE&&key.startsWith('nomadtips3-pwa-')).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const isStaticLaunchAsset=url.pathname.endsWith('/nomad-app-icon.svg')||url.pathname.endsWith('/nomad-app-splash-stadium.b64');
  if(isStaticLaunchAsset){
    event.respondWith(
      caches.match(request,{ignoreSearch:true}).then(hit=>hit||fetch(request).then(response=>{
        const copy=response.clone();
        caches.open(STATIC_CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
        return response;
      }))
    );
    return;
  }
  event.respondWith(fetch(request));
});
