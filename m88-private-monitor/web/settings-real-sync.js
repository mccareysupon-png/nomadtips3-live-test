(()=>{
  const KEY='m88-monitor-settings-v2';
  const CONTRACT='M88-REAL-SOURCE-v2';
  const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
  function migrate(){
    let s={};try{s=JSON.parse(localStorage.getItem(KEY)||'{}')||{}}catch{}
    if(s.realSourceContractVersion!==CONTRACT){
      s={...s,side:'HOME',market:'AH',ahMatchMode:'EXACT',ahExact:1,ahMin:1,ahMax:1,realSourceContractVersion:CONTRACT};
      localStorage.setItem(KEY,JSON.stringify(s));
    }
  }
  migrate();
  function sync(){
    const form=document.querySelector('#settingsForm');if(!form)return;
    const mode=form.elements.ahMatchMode,exact=form.elements.ahExact,min=form.elements.ahMin,max=form.elements.ahMax,preview=document.querySelector('#ahPreview');
    if(!mode||!exact||!min||!max)return;
    const isExact=mode.value!=='RANGE';
    if(isExact){
      const line=n(exact.value)??1;
      exact.value=String(line);min.value=String(line);max.value=String(line);
      min.style.pointerEvents='none';max.style.pointerEvents='none';min.tabIndex=-1;max.tabIndex=-1;
      min.closest('.field')?.classList.add('inactive');max.closest('.field')?.classList.add('inactive');
      if(preview)preview.textContent=`EXACT M88 AH line: ${line>=0?'+':''}${line.toFixed(2)} · +1 stays +1; no sign conversion`;
    }else{
      min.style.pointerEvents='';max.style.pointerEvents='';min.tabIndex=0;max.tabIndex=0;
      min.closest('.field')?.classList.remove('inactive');max.closest('.field')?.classList.remove('inactive');
      if(preview)preview.textContent='RANGE mode: M88 line must fall inside the selected range without sign conversion.';
    }
  }
  window.addEventListener('DOMContentLoaded',()=>{setTimeout(sync,0);const form=document.querySelector('#settingsForm');form?.addEventListener('input',sync);form?.addEventListener('change',sync);form?.addEventListener('submit',sync,true);document.querySelector('#saveRun')?.addEventListener('click',sync,true);});
})();
