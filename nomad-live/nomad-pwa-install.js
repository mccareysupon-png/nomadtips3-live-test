(()=>{
  'use strict';

  const scriptUrl=new URL(document.currentScript?.src||window.location.href);
  const isGitHubPages=/\.github\.io$/i.test(window.location.hostname);
  const pwaRoot=isGitHubPages?new URL('./',scriptUrl):new URL('/',window.location.origin);
  const asset=name=>new URL(name,pwaRoot).href;

  if(!document.querySelector('link[rel="manifest"]')){
    const manifest=document.createElement('link');
    manifest.rel='manifest';
    manifest.href=asset('manifest.webmanifest?v=20260908-v3');
    document.head.appendChild(manifest);
  }
  if(!document.querySelector('link[rel="apple-touch-icon"]')){
    const icon=document.createElement('link');
    icon.rel='apple-touch-icon';
    icon.href=asset('nomad-app-icon.svg?v=20260908-v3');
    document.head.appendChild(icon);
  }

  const meta=(name,content)=>{
    let node=document.querySelector(`meta[name="${name}"]`);
    if(!node){
      node=document.createElement('meta');
      node.name=name;
      document.head.appendChild(node);
    }
    node.content=content;
  };
  meta('mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-capable','yes');
  meta('apple-mobile-web-app-status-bar-style','black-translucent');
  meta('apple-mobile-web-app-title','nomadtips3');

  const showAppSplash=()=>{
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||window.navigator.standalone===true;
    const fromPwa=new URLSearchParams(window.location.search).get('source')==='pwa';
    const mobile=window.matchMedia?.('(max-width: 900px)')?.matches??window.innerWidth<=900;
    if((!standalone&&!fromPwa)||!mobile)return;

    try{
      if(sessionStorage.getItem('nomadAppSplashShownV3')==='1')return;
      sessionStorage.setItem('nomadAppSplashShownV3','1');
    }catch(_){ }

    const mount=()=>{
      if(!document.body||document.getElementById('nomad-app-splash'))return;

      const style=document.createElement('style');
      style.id='nomad-app-splash-style';
      style.textContent=`
        body.nomad-app-splash-open{overflow:hidden!important;touch-action:none!important;background:#0b2118!important}
        #nomad-app-splash{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:linear-gradient(180deg,#153f30 0%,#0b281e 52%,#081a14 100%);color:#f2f8f4;opacity:1;transition:opacity .48s ease,visibility .48s ease;contain:layout paint style}
        #nomad-app-splash.is-leaving{opacity:0;visibility:hidden;pointer-events:none}
        #nomad-app-splash .nomad-app-splash-art{position:absolute;inset:-3%;background-color:#153f30;background-size:cover;background-position:center center;background-repeat:no-repeat;transform:scale(1.02);animation:nomadSplashDrift 6.2s ease-in-out infinite alternate;will-change:transform,filter}
        #nomad-app-splash .nomad-app-splash-art::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,32,24,.03),rgba(5,20,14,.12) 58%,rgba(4,13,10,.48) 100%)}
        #nomad-app-splash .nomad-app-splash-glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 54%,rgba(112,240,164,.18),transparent 24%),radial-gradient(circle at 50% 78%,rgba(244,210,56,.07),transparent 30%);animation:nomadSplashGlow 2.35s ease-in-out infinite}
        #nomad-app-splash .nomad-app-splash-scan{position:absolute;left:-20%;right:-20%;top:-20%;height:17%;background:linear-gradient(180deg,transparent,rgba(133,255,183,.09),rgba(249,218,69,.045),transparent);filter:blur(10px);animation:nomadSplashScan 3.8s linear infinite;pointer-events:none}
        #nomad-app-splash .nomad-app-splash-progress-wrap{position:absolute;left:9.5%;right:9.5%;bottom:max(76px,calc(env(safe-area-inset-bottom) + 64px));height:10px;border:1px solid rgba(139,249,183,.34);border-radius:999px;background:rgba(5,25,17,.58);box-shadow:inset 0 0 12px rgba(0,0,0,.38),0 0 18px rgba(75,241,142,.09);overflow:hidden;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
        #nomad-app-splash .nomad-app-splash-progress-fill{position:absolute;top:1px;bottom:1px;left:1px;width:42%;border-radius:999px;background:linear-gradient(90deg,rgba(82,230,141,.05) 0%,#57e99b 32%,#c8ffdc 58%,#72f7ae 76%,rgba(82,230,141,.08) 100%);box-shadow:0 0 9px rgba(111,255,174,.95),0 0 22px rgba(82,235,147,.65);transform:translateX(-115%);animation:nomadSplashProgressTravel 1.65s cubic-bezier(.45,.02,.55,.98) infinite;will-change:transform}
        #nomad-app-splash .nomad-app-splash-progress-fill::after{content:"";position:absolute;top:-5px;right:7%;width:18px;height:18px;border-radius:50%;background:rgba(220,255,233,.96);filter:blur(1px);box-shadow:0 0 8px #d7ffe6,0 0 18px #75f5ad,0 0 34px rgba(77,255,151,.78);animation:nomadSplashProgressPulse .85s ease-in-out infinite alternate}
        #nomad-app-splash.is-ready .nomad-app-splash-progress-fill{animation:none;transition:width .22s ease,transform .32s cubic-bezier(.2,.8,.2,1);width:calc(100% - 2px);transform:translateX(0)}
        #nomad-app-splash .nomad-app-splash-status{position:absolute;left:50%;bottom:max(22px,calc(env(safe-area-inset-bottom) + 10px));transform:translateX(-50%);display:flex;align-items:center;gap:9px;padding:8px 13px;border:1px solid rgba(153,238,187,.20);border-radius:999px;background:rgba(8,31,22,.56);-webkit-backdrop-filter:blur(9px);backdrop-filter:blur(9px);font:600 11px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.035em;white-space:nowrap;color:rgba(245,250,247,.94);box-shadow:0 8px 30px rgba(0,0,0,.18)}
        #nomad-app-splash .nomad-app-splash-dot{width:7px;height:7px;border-radius:50%;background:#80e8a8;box-shadow:0 0 0 0 rgba(128,232,168,.42);animation:nomadSplashDot 1.2s ease-out infinite}
        #nomad-app-splash .nomad-app-splash-ellipsis{display:inline-block;width:18px;text-align:left;overflow:hidden;vertical-align:bottom;animation:nomadSplashEllipsis 1.15s steps(4,end) infinite}
        @keyframes nomadSplashDrift{0%{transform:scale(1.02) translate3d(0,0,0);filter:brightness(1) saturate(1.02)}100%{transform:scale(1.065) translate3d(0,-.9%,0);filter:brightness(1.06) saturate(1.08)}}
        @keyframes nomadSplashGlow{0%,100%{opacity:.56}50%{opacity:1}}
        @keyframes nomadSplashScan{0%{transform:translateY(-20vh) skewY(-4deg)}100%{transform:translateY(130vh) skewY(-4deg)}}
        @keyframes nomadSplashProgressTravel{0%{transform:translateX(-115%)}55%{transform:translateX(72%)}100%{transform:translateX(245%)}}
        @keyframes nomadSplashProgressPulse{0%{opacity:.62;transform:scale(.74)}100%{opacity:1;transform:scale(1.08)}}
        @keyframes nomadSplashDot{0%{box-shadow:0 0 0 0 rgba(128,232,168,.48)}70%,100%{box-shadow:0 0 0 11px rgba(128,232,168,0)}}
        @keyframes nomadSplashEllipsis{0%{width:0}100%{width:18px}}
        @media(prefers-reduced-motion:reduce){#nomad-app-splash .nomad-app-splash-art,#nomad-app-splash .nomad-app-splash-glow,#nomad-app-splash .nomad-app-splash-scan,#nomad-app-splash .nomad-app-splash-dot,#nomad-app-splash .nomad-app-splash-ellipsis,#nomad-app-splash .nomad-app-splash-progress-fill,#nomad-app-splash .nomad-app-splash-progress-fill::after{animation:none!important}}
      `;
      document.head.appendChild(style);

      const splash=document.createElement('div');
      splash.id='nomad-app-splash';
      splash.setAttribute('role','status');
      splash.setAttribute('aria-live','polite');
      splash.innerHTML='<div class="nomad-app-splash-art" aria-hidden="true"></div><div class="nomad-app-splash-glow" aria-hidden="true"></div><div class="nomad-app-splash-scan" aria-hidden="true"></div><div class="nomad-app-splash-progress-wrap" aria-hidden="true"><div class="nomad-app-splash-progress-fill"></div></div><div class="nomad-app-splash-status"><span class="nomad-app-splash-dot" aria-hidden="true"></span><span>กำลังดาวน์โหลดข้อมูลสด<span class="nomad-app-splash-ellipsis" aria-hidden="true">...</span></span></div>';
      document.body.classList.add('nomad-app-splash-open');
      document.body.prepend(splash);

      const art=splash.querySelector('.nomad-app-splash-art');
      fetch(asset('nomad-app-splash-stadium.b64?v=20260908-v1'),{cache:'force-cache'})
        .then(r=>{if(!r.ok)throw new Error(String(r.status));return r.text();})
        .then(text=>{
          const raw=text.replace(/\s+/g,'');
          if(raw&&art)art.style.backgroundImage=`url("data:image/webp;base64,${raw}")`;
        })
        .catch(()=>{});

      const started=performance.now();
      let closed=false;
      const close=()=>{
        if(closed)return;
        closed=true;
        splash.classList.add('is-ready');
        const wait=Math.max(0,850-(performance.now()-started));
        setTimeout(()=>{
          splash.classList.add('is-leaving');
          document.body.classList.remove('nomad-app-splash-open');
          setTimeout(()=>{splash.remove();style.remove();},540);
        },Math.max(wait,320));
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
      setTimeout(close,8000);
    };

    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
    else mount();
  };
  showAppSplash();

  if('serviceWorker'in navigator){
    window.addEventListener('load',()=>{
      navigator.serviceWorker.register(asset('nomad-app-sw.js?v=20260908-v2'),{scope:pwaRoot.pathname})
        .catch(()=>{});
    },{once:true});
  }
})();
