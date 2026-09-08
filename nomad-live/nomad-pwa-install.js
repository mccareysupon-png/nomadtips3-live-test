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

  // Mobile app launch splash only. Presentation layer; no live engine/feed logic is changed.
  const showAppSplash=()=>{
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
    const fromPwa=new URLSearchParams(window.location.search).get('source')==='pwa';
    const mobile=window.matchMedia?.('(max-width: 900px)')?.matches??window.innerWidth<=900;
    if((!standalone&&!fromPwa)||!mobile)return;

    try{
      if(sessionStorage.getItem('nomadAppSplashShownV1')==='1')return;
      sessionStorage.setItem('nomadAppSplashShownV1','1');
    }catch(_){ }

    const mount=()=>{
      if(!document.body||document.getElementById('nomad-app-splash'))return;

      const style=document.createElement('style');
      style.id='nomad-app-splash-style';
      style.textContent=`
        body.nomad-app-splash-open{overflow:hidden!important;touch-action:none!important}
        #nomad-app-splash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#06120d;color:#eef7f2;opacity:1;transition:opacity .55s ease,visibility .55s ease;contain:layout paint style}
        #nomad-app-splash.is-leaving{opacity:0;visibility:hidden;pointer-events:none}
        #nomad-app-splash .nomad-app-splash-art{position:absolute;inset:-2.5%;background-color:#06120d;background-size:cover;background-position:center center;background-repeat:no-repeat;transform:scale(1.015);animation:nomadSplashDrift 6.5s ease-in-out infinite alternate;will-change:transform,filter}
        #nomad-app-splash .nomad-app-splash-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 58%,rgba(66,255,149,.14),transparent 25%),linear-gradient(180deg,transparent 0%,rgba(0,0,0,.03) 42%,rgba(0,0,0,.24) 100%);animation:nomadSplashGlow 2.2s ease-in-out infinite}
        #nomad-app-splash .nomad-app-splash-scan{position:absolute;left:-15%;right:-15%;top:-12%;height:16%;background:linear-gradient(180deg,transparent,rgba(87,255,170,.11),rgba(255,216,74,.055),transparent);filter:blur(8px);transform:skewY(-4deg);animation:nomadSplashScan 3.6s linear infinite;pointer-events:none}
        #nomad-app-splash .nomad-app-splash-status{position:absolute;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:7px 12px;border:1px solid rgba(86,245,155,.20);background:rgba(3,16,11,.58);backdrop-filter:blur(8px);font:600 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.06em;white-space:nowrap;color:rgba(239,250,244,.9);box-shadow:0 0 24px rgba(40,220,126,.08)}
        #nomad-app-splash .nomad-app-splash-dot{width:7px;height:7px;border-radius:50%;background:#5cf39a;box-shadow:0 0 0 0 rgba(92,243,154,.46);animation:nomadSplashDot 1.25s ease-out infinite}
        @keyframes nomadSplashDrift{0%{transform:scale(1.015) translate3d(0,0,0);filter:brightness(.98) saturate(1.02)}100%{transform:scale(1.055) translate3d(0,-.7%,0);filter:brightness(1.05) saturate(1.08)}}
        @keyframes nomadSplashGlow{0%,100%{opacity:.62}50%{opacity:1}}
        @keyframes nomadSplashScan{0%{transform:translateY(-20vh) skewY(-4deg)}100%{transform:translateY(125vh) skewY(-4deg)}}
        @keyframes nomadSplashDot{0%{box-shadow:0 0 0 0 rgba(92,243,154,.48)}70%,100%{box-shadow:0 0 0 10px rgba(92,243,154,0)}}
        @media(prefers-reduced-motion:reduce){#nomad-app-splash .nomad-app-splash-art,#nomad-app-splash .nomad-app-splash-glow,#nomad-app-splash .nomad-app-splash-scan,#nomad-app-splash .nomad-app-splash-dot{animation:none!important}}
      `;
      document.head.appendChild(style);

      const splash=document.createElement('div');
      splash.id='nomad-app-splash';
      splash.setAttribute('role','status');
      splash.setAttribute('aria-live','polite');
      splash.innerHTML='<div class="nomad-app-splash-art" aria-hidden="true"></div><div class="nomad-app-splash-glow" aria-hidden="true"></div><div class="nomad-app-splash-scan" aria-hidden="true"></div><div class="nomad-app-splash-status"><span class="nomad-app-splash-dot" aria-hidden="true"></span><span>กำลังเชื่อมต่อข้อมูลสด…</span></div>';
      document.body.classList.add('nomad-app-splash-open');
      document.body.prepend(splash);

      // First approved stadium/football artwork, stored as compact WebP base64 text.
      fetch(asset('nomad-app-splash-stadium.b64?v=20260908-v1'),{cache:'force-cache'})
        .then(r=>{if(!r.ok)throw new Error(String(r.status));return r.text();})
        .then(text=>{
          const raw=text.replace(/\s+/g,'');
          if(raw)splash.querySelector('.nomad-app-splash-art').style.backgroundImage=`url("data:image/webp;base64,${raw}")`;
        })
        .catch(()=>{});

      const started=performance.now();
      let closed=false;
      const close=()=>{
        if(closed)return;
        closed=true;
        const wait=Math.max(0,900-(performance.now()-started));
        setTimeout(()=>{
          splash.classList.add('is-leaving');
          document.body.classList.remove('nomad-app-splash-open');
          setTimeout(()=>{splash.remove();style.remove();},620);
        },wait);
      };
      const ready=()=>{
        const pill=document.querySelector('.source-pill');
        const text=(pill?.textContent||'').replace(/\s+/g,' ').trim().toUpperCase();
        return Boolean(text)&&!text.includes('CONNECTING');
      };
      const pill=document.querySelector('.source-pill');
      if(pill){
        const observer=new MutationObserver(()=>{
          if(ready()){
            observer.disconnect();
            close();
          }
        });
        observer.observe(pill,{childList:true,subtree:true,characterData:true});
      }
      if(ready())close();
      window.addEventListener('nomad:live-ready',close,{once:true});
      // Safety valve so the splash can never become a blocking screen.
      setTimeout(close,10000);
    };

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
    else mount();
  };
  showAppSplash();

  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register(asset('nomad-app-sw.js?v=20260903-v1'),{scope:pwaRoot.pathname})
        .catch(()=>{});
    },{once:true});
  }
})();
