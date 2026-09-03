(()=>{
  'use strict';

  const scriptUrl=new URL(document.currentScript?.src||window.location.href);
  const isGitHubPages=/\.github\.io$/i.test(window.location.hostname);
  const pwaRoot=isGitHubPages?new URL('./',scriptUrl):new URL('/',window.location.origin);
  const asset=name=>new URL(name,pwaRoot).href;

  if(!document.querySelector('link[rel="manifest"]')){
    const manifest=document.createElement('link');
    manifest.rel='manifest';
    manifest.href=asset('manifest.webmanifest?v=20260903-v1');
    document.head.appendChild(manifest);
  }
  if(!document.querySelector('link[rel="apple-touch-icon"]')){
    const icon=document.createElement('link');
    icon.rel='apple-touch-icon';
    icon.href=asset('nomad-app-icon.svg?v=20260903-v1');
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

  let installPrompt=null;
  let button=null;
  let hint=null;

  const standalone=()=>window.matchMedia?.('(display-mode: standalone)')?.matches===true||window.navigator.standalone===true;
  const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent||'');

  const setInstalled=()=>{
    if(!button)return;
    button.textContent='Installed';
    button.disabled=true;
    if(hint)hint.classList.remove('is-visible');
  };

  const mount=()=>{
    const footer=document.querySelector('.site-footer');
    const inner=footer?.querySelector('.site-footer-inner');
    if(!inner||inner.querySelector('.site-app-promo'))return Boolean(inner);

    const rail=document.createElement('section');
    rail.className='site-app-promo';
    rail.setAttribute('aria-label','Install NOMADTIPS3 app');
    rail.innerHTML=`
      <div class="site-app-promo-brand">nomad<span>tips3</span></div>
      <div class="site-app-promo-actions">
        <button class="site-app-install-button" type="button">Install App</button>
        <span class="site-app-install-hint" aria-live="polite"></span>
      </div>`;
    inner.prepend(rail);

    button=rail.querySelector('.site-app-install-button');
    hint=rail.querySelector('.site-app-install-hint');

    if(standalone())setInstalled();

    button?.addEventListener('click',async()=>{
      if(standalone()){
        setInstalled();
        return;
      }
      if(installPrompt){
        const prompt=installPrompt;
        installPrompt=null;
        await prompt.prompt();
        try{
          const choice=await prompt.userChoice;
          if(choice?.outcome==='accepted')setInstalled();
        }catch(_){ }
        return;
      }
      if(hint){
        hint.textContent=isiOS()?'Safari: Share → Add to Home Screen':'Browser menu → Install app / Add to Home screen';
        hint.classList.add('is-visible');
      }
    });
    return true;
  };

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    installPrompt=event;
    if(button&&!standalone())button.disabled=false;
  });
  window.addEventListener('appinstalled',()=>{
    installPrompt=null;
    setInstalled();
  });

  if(!mount()){
    const observer=new MutationObserver(()=>{
      if(mount())observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    window.setTimeout(()=>observer.disconnect(),10000);
  }
})();
