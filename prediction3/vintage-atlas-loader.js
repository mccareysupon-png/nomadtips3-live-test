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

  const loadAtlas=async()=>{
    try{
      const parts=await Promise.all(chunks.map(async url=>{
        const res=await fetch(url,{cache:'force-cache'});
        if(!res.ok)throw new Error(`atlas chunk ${res.status}: ${url}`);
        return res.text();
      }));
      const base64=parts.join('').replace(/\s+/g,'');
      if(base64.length<38000)throw new Error(`atlas incomplete: ${base64.length}`);
      document.documentElement.style.setProperty('--p3-vintage-atlas',`url("data:image/webp;base64,${base64}")`);
      document.documentElement.classList.add('p3-vintage-ready');
    }catch(error){
      console.error('[Prediction3 vintage atlas]',error);
    }
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{mapClasses();loadAtlas();},{once:true});
  }else{
    mapClasses();
    loadAtlas();
  }
})();
