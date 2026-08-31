(()=>{
  'use strict';
  const targets=[
    ['#team-mj','./mj.b64'],
    ['#team-k','./k.b64']
  ];
  const urls=[];
  const decode=(base64)=>{
    const clean=base64.replace(/\s+/g,'');
    const binary=atob(clean);
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i+=1) bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes],{type:'image/jpeg'});
  };
  Promise.all(targets.map(async ([selector,path])=>{
    const image=document.querySelector(selector);
    if(!image) return;
    try{
      const response=await fetch(`${path}?v=20260831-team-portrait-v2`,{cache:'force-cache'});
      if(!response.ok) throw new Error(`Asset unavailable: ${path}`);
      const blob=decode(await response.text());
      const url=URL.createObjectURL(blob);
      urls.push(url);
      image.src=url;
      image.addEventListener('load',()=>image.classList.add('is-ready'),{once:true});
    }catch(error){
      image.closest('.team-photo')?.classList.add('is-error');
      console.error(error);
    }
  }));
  window.addEventListener('pagehide',()=>urls.forEach(url=>URL.revokeObjectURL(url)),{once:true});
})();
