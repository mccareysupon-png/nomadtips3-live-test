(()=>{
  'use strict';

  const nativeFetch=window.fetch.bind(window);
  const PATCH_URL='data/current.json?v=20260914-sirius-current-v1';
  let patchPromise=null;

  function isLegacyLedger(input){
    const raw=typeof input==='string'?input:(input&&input.url)||'';
    try{
      return new URL(raw,window.location.href).pathname.endsWith('/prediction3/data/ledger.json');
    }catch{
      return /(^|\/)data\/ledger\.json(?:\?|$)/.test(raw);
    }
  }

  async function currentPatch(){
    if(!patchPromise){
      patchPromise=nativeFetch(PATCH_URL,{cache:'no-store'})
        .then(response=>{
          if(!response.ok)throw new Error(`current ledger HTTP ${response.status}`);
          return response.json();
        })
        .catch(error=>{
          patchPromise=null;
          throw error;
        });
    }
    return patchPromise;
  }

  function mergeLedger(base,patch){
    const merged={...(base||{})};
    merged.updated_at=patch?.updated_at||merged.updated_at||null;
    merged.selection={...(merged.selection||{}),...(patch?.selection||{})};
    if(Array.isArray(patch?.today))merged.today=patch.today;

    const patchResults=Array.isArray(patch?.results)?patch.results:[];
    const baseResults=Array.isArray(merged.results)?merged.results:[];
    const patchIds=new Set(patchResults.map(row=>String(row?.id||'')).filter(Boolean));
    merged.results=[...patchResults,...baseResults.filter(row=>!patchIds.has(String(row?.id||'')))];
    return merged;
  }

  window.fetch=async function(input,init){
    if(!isLegacyLedger(input))return nativeFetch(input,init);
    const response=await nativeFetch(input,init);
    if(!response.ok)return response;
    try{
      const [base,patch]=await Promise.all([response.clone().json(),currentPatch()]);
      const headers=new Headers(response.headers);
      headers.set('content-type','application/json; charset=utf-8');
      headers.set('cache-control','no-store');
      return new Response(JSON.stringify(mergeLedger(base,patch)),{
        status:response.status,
        statusText:response.statusText,
        headers,
      });
    }catch(error){
      console.warn('Prediction3 current ledger overlay unavailable; using legacy ledger.',error);
      return response;
    }
  };
})();
