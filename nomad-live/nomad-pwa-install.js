(()=>{
  'use strict';

  const scriptUrl=new URL(document.currentScript?.src||window.location.href);
  const isGitHubPages=/\.github\.io$/i.test(window.location.hostname);
  const pwaRoot=isGitHubPages?new URL('./',scriptUrl):new URL('/',window.location.origin);
  const asset=name=>new URL(name,pwaRoot).href;

  if(!document.querySelector('link[rel="manifest"]')){
    const manifest=document.createElement('link');
    manifest.rel='manifest';
    manifest.href=asset('manifest.webmanifest?v=20260903-v2');
    document.head.appendChild(manifest);
  }
  if(!document.querySelector('link[rel="apple-touch-icon"]')){
    const icon=document.createElement('link');
    icon.rel='apple-touch-icon';
    icon.href=asset('nomad-app-icon.svg?v=20260903-v2');
    document.head.appendChild(icon);
  }

  const meta=(name,content)=>{
    if(document.querySelector(`meta[name="${name}"]`))return;
    const node=document.createElement('meta');
    node.name=name;
    node.content=content;
    document.head.appendChild(node);
  };
  meta('mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-status-bar-style','black-translucent');
  meta('apple-mobile-web-app-title','nomadtips3');

  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register(asset('nomad-app-sw.js?v=20260903-v1'),{scope:pwaRoot.pathname})
        .catch(()=>{});
    },{once:true});
  }
})();
