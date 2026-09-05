(()=>{
  'use strict';

  const chunks=[
    'assets/vintage-atlas-1.b64?v=20260905-v2',
    'assets/vintage-atlas-2.b64?v=20260905-v2',
    'assets/vintage-atlas-3.b64?v=20260905-v2',
    'assets/vintage-atlas-4.b64?v=20260905-v2'
  ];

  const mapClasses=()=>{
    document.querySelectorAll('.p3-vintage-icon').forEach(el=>{
      const use=el.querySelector('use');
      if(!use)return;
      const href=use.getAttribute('href')||use.getAttribute('xlink:href')||'';
      const match=href.match(/#vi-([a-z0-9-]+)/i);
      if(match)el.classList.add(`vi-${match[1]}`);
    });
  };

  const prependIcon=(host,iconClass,sizeClass='')=>{
    if(!host||host.querySelector('.p3-vintage-icon'))return;
    const icon=document.createElement('span');
    icon.className=`p3-vintage-icon ${sizeClass} ${iconClass}`.trim();
    icon.setAttribute('aria-hidden','true');
    host.prepend(icon);
  };

  const decorateToolbar=()=>{
    const eyebrow=document.getElementById('sectionEyebrow');
    const title=document.getElementById('sectionTitle');
    if(eyebrow){
      const isResults=/RESULT/i.test(eyebrow.textContent||'');
      prependIcon(eyebrow,isResults?'vi-results':'vi-selections','sm');
    }
    if(title){
      const isResults=/RESULT/i.test(title.textContent||'');
      prependIcon(title,isResults?'vi-results':'vi-manual-desk');
    }
  };

  const observeToolbar=()=>{
    ['sectionEyebrow','sectionTitle'].forEach(id=>{
      const node=document.getElementById(id);
      if(!node)return;
      new MutationObserver(()=>decorateToolbar()).observe(node,{childList:true,subtree:true});
    });
    decorateToolbar();
  };

  const loadAtlas=async()=>{
    try{
      const parts=await Promise.all(chunks.map(async url=>{
        const res=await fetch(url,{cache:'force-cache'});
        if(!res.ok)throw new Error(`atlas chunk ${res.status}: ${url}`);
        return res.text();
      }));
      const base64=parts.join('').replace(/\s+/g,'');
      if(base64.length!==38520)throw new Error(`atlas incomplete: ${base64.length}`);
      document.documentElement.style.setProperty('--p3-vintage-atlas',`url("data:image/webp;base64,${base64}")`);
      document.documentElement.classList.add('p3-vintage-ready');
    }catch(error){
      console.error('[Prediction3 vintage atlas]',error);
    }
  };

  const start=()=>{
    mapClasses();
    observeToolbar();
    loadAtlas();
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
