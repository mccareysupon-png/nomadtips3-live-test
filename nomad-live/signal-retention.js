(()=>{
  const API='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
  const STORE='nomad341StickySignalsV1';
  const MAX_AGE_MS=8*60*60*1000;
  const LEDGER_TTL_MS=30000;
  const originalFetch=window.fetch.bind(window);
  let lastLedgerAt=0,lastLedger=null;

  const normalize=value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ');
  const matchKey=match=>`${normalize(match?.home)}|${normalize(match?.away)}`;
  const now=()=>Date.now();

  const loadStore=()=>{
    try{
      const parsed=JSON.parse(localStorage.getItem(STORE)||'{}');
      return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
    }catch{return {};}
  };
  const saveStore=store=>{
    try{localStorage.setItem(STORE,JSON.stringify(store));}catch{}
  };
  const settled=record=>Boolean(record?.settlement&&record.settlement.result&&String(record.settlement.result).toUpperCase()!=='PENDING');
  const sameSignal=(entry,record)=>{
    if(!record||matchKey(record)!==entry.key)return false;
    const lockedAt=Date.parse(record.lockedAt||'');
    if(!Number.isFinite(lockedAt)||!entry.firstSeen)return true;
    return Math.abs(lockedAt-entry.firstSeen)<=3*60*60*1000;
  };
  const getLedger=async()=>{
    if(lastLedger&&now()-lastLedgerAt<LEDGER_TTL_MS)return lastLedger;
    try{
      const response=await originalFetch(`${API}/statistics?_=${now()}`,{cache:'no-store'});
      if(!response.ok)return lastLedger;
      const data=await response.json();
      lastLedger=Array.isArray(data?.records)?data.records:[];
      lastLedgerAt=now();
    }catch{}
    return lastLedger;
  };
  const keepLockedPrice=(current,locked)=>({
    ...current,
    state:'SIGNAL',
    selectedPrice:locked.selectedPrice??current.selectedPrice,
    priceSources:locked.priceSources??current.priceSources,
    marketCheck:locked.marketCheck??current.marketCheck,
    market:locked.market??current.market,
    marketComparison:locked.marketComparison??current.marketComparison,
    __stickySignal:true,
  });

  const mergeFeed=async data=>{
    if(!data||!Array.isArray(data.matches))return data;
    const time=now();
    const store=loadStore();
    const ledger=await getLedger();

    for(const [key,entry] of Object.entries(store)){
      if(!entry?.match||!entry.firstSeen||time-entry.firstSeen>MAX_AGE_MS){delete store[key];continue;}
      const record=Array.isArray(ledger)?ledger.find(item=>sameSignal(entry,item)):null;
      if(record&&settled(record))delete store[key];
    }

    const currentByKey=new Map();
    for(const match of data.matches){
      const key=matchKey(match);
      if(key!=='|')currentByKey.set(key,match);
      if(match?.state==='SIGNAL'&&key!=='|'){
        const previous=store[key];
        store[key]={
          key,
          firstSeen:previous?.firstSeen||time,
          lastSeen:time,
          match:previous?.match?keepLockedPrice(match,previous.match):{...match,__stickySignal:true},
        };
      }
    }

    const merged=[];
    const emitted=new Set();
    for(const match of data.matches){
      const key=matchKey(match);
      const entry=store[key];
      if(entry){
        const sticky=keepLockedPrice(match,entry.match);
        entry.match=sticky;entry.lastSeen=time;
        merged.push(sticky);
      }else merged.push(match);
      emitted.add(key);
    }
    for(const [key,entry] of Object.entries(store)){
      if(!emitted.has(key)&&entry?.match)merged.push({...entry.match,state:'SIGNAL',__stickySignal:true});
    }

    saveStore(store);
    const signalCount=merged.filter(match=>match?.state==='SIGNAL').length;
    return {...data,matches:merged,counts:{...(data.counts||{}),signal:signalCount}};
  };

  window.fetch=async(...args)=>{
    const response=await originalFetch(...args);
    const request=args[0];
    const url=typeof request==='string'?request:request?.url||'';
    if(!url.startsWith(API)||!/\/feed(?:\?|$)/.test(url))return response;
    try{
      const data=await response.clone().json();
      const merged=await mergeFeed(data);
      const headers=new Headers(response.headers);
      headers.set('content-type','application/json; charset=utf-8');
      return new Response(JSON.stringify(merged),{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();
