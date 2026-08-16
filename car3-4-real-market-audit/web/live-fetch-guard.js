(()=>{
  const nativeFetch=window.fetch.bind(window);
  const HOLD_MS=75000;
  let lastGoodPayload=null;
  let lastGoodReceivedAt=0;
  let holding=false;
  let lastSourceTime=null;

  function isLiveRequest(input){
    const url=typeof input==='string'?input:String(input?.url||'');
    return /\/live(?:\?|$)/.test(url);
  }

  function sourceIsFresh(payload){
    if(!payload?.ok||!Array.isArray(payload?.matches))return false;
    const generated=Date.parse(payload.generatedAt||'');
    return Number.isFinite(generated)&&Date.now()-generated<=90000;
  }

  function statusText(){
    if(!holding)return;
    const el=document.querySelector('#lastUpdate');
    if(!el)return;
    const source=lastSourceTime?new Date(lastSourceTime).toLocaleTimeString():'unknown';
    el.textContent=`HOLDING LAST GOOD · ${source}`;
    el.style.color='#f4c84b';
  }

  window.fetch=async function guardedFetch(input,init){
    if(!isLiveRequest(input))return nativeFetch(input,init);
    try{
      const response=await nativeFetch(input,init);
      if(!response.ok)throw new Error(`live HTTP ${response.status}`);
      const text=await response.clone().text();
      const payload=JSON.parse(text);
      if(!sourceIsFresh(payload))throw new Error('live payload stale or invalid');
      lastGoodPayload=payload;
      lastGoodReceivedAt=Date.now();
      lastSourceTime=payload.generatedAt||null;
      holding=false;
      const el=document.querySelector('#lastUpdate');
      if(el)el.style.color='';
      return response;
    }catch(error){
      const age=Date.now()-lastGoodReceivedAt;
      if(lastGoodPayload&&age<=HOLD_MS){
        const held=JSON.parse(JSON.stringify(lastGoodPayload));
        held.__uiHeld=true;
        held.__sourceGeneratedAt=held.generatedAt||null;
        held.generatedAt=new Date().toISOString();
        holding=true;
        setTimeout(statusText,0);
        return new Response(JSON.stringify(held),{
          status:200,
          headers:{'content-type':'application/json','x-nomadtips-ui-held':'1'}
        });
      }
      holding=false;
      throw error;
    }
  };

  window.addEventListener('car31:live-updated',()=>setTimeout(statusText,0));
  setInterval(statusText,1000);
})();
