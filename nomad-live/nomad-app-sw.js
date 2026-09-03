/* NOMADTIPS3 PWA service worker.
   Installability only: live pages and APIs stay network-first with no offline cache.
   This avoids stale scores, odds, signals or match state. */
const VERSION='nomadtips3-pwa-20260903-v1';

self.addEventListener('install',()=>{
  self.skipWaiting();
});

self.addEventListener('activate',event=>{
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  event.respondWith(fetch(request));
});
