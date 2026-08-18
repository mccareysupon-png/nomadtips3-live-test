(()=>{
  const realFetch=window.fetch.bind(window);
  const safe=v=>String(v??'').trim();
  const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
  const norm=s=>safe(s).toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9À-žก-๙]+/gi,' ').replace(/\s+/g,' ').trim();
  const rawText=m=>{
    let raw='';
    try{raw=JSON.stringify(m?.raw??'').slice(0,5000)}catch{}
    return [m?.sport,m?.league,m?.home,m?.away,m?.status,m?.market,m?.selection,m?.sourceUrl,m?.sourceKind,raw].map(safe).join(' ').toLowerCase();
  };
  const badSport=m=>{
    const t=rawText(m);
    return /(e\s*-?sports?|virtual(?:\s+(?:football|soccer|sports?))?|simulat(?:ed|ion)?|simulated\s+reality|\bsrl\b|efootball|e-football|e-soccer|esoccer|fifa\s*\d*|cyber|battle\s*\d|gt\s*league|short\s*football|basketball|tennis|volleyball|baseball|ice hockey|hockey|table tennis|badminton|cricket|snooker|darts|handball|rugby|boxing|mma|formula|motorsport)/i.test(t);
  };
  const liveNetwork=m=>{
    if(badSport(m))return false;
    const st=safe(m.status).toLowerCase();
    if(/(finished|final|\bft\b|ended|cancel|postpon|upcoming|prematch|pre-match|not started|scheduled)/i.test(st))return false;
    const minute=n(m.minute);
    if(minute!==null&&minute>=0&&minute<=130)return true;
    return /(live|in.?play|1st|2nd|first half|second half|half.?time|\bht\b)/i.test(st);
  };
  const liveDom=m=>{
    if(badSport(m))return false;
    const minute=n(m.minute),hs=n(m.homeScore),as=n(m.awayScore);
    return minute!==null&&minute>=0&&minute<=130&&hs!==null&&as!==null;
  };
  const dedupe=arr=>{
    const map=new Map();
    for(const m of arr){
      const key=`${norm(m.home)}|${norm(m.away)}`;
      if(!key||key==='|')continue;
      const old=map.get(key);
      const score=x=>(x.sourceKind==='dom-fallback'?0:100)+(n(x.minute)!==null?20:0)+(n(x.odds)!==null?10:0)+(safe(x.market)?5:0);
      if(!old||score(m)>score(old))map.set(key,m);
    }
    return [...map.values()];
  };
  window.fetch=async function(input,init){
    const response=await realFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!/\/api\/feed(?:\?|$)/.test(url))return response;
      const data=await response.clone().json();
      if(!Array.isArray(data?.matches))return response;
      const network=data.matches.filter(m=>m?.sourceKind!=='dom-fallback'&&liveNetwork(m));
      const dom=data.matches.filter(m=>m?.sourceKind==='dom-fallback'&&liveDom(m));
      // Network payload is authoritative when available. DOM is only a last-resort fallback.
      // Virtual/eSports markers are checked across normalized fields, source URL and raw payload.
      const chosen=dedupe(network.length?network:dom);
      const body=JSON.stringify({...data,mode:'strict-real-live-football-v6',serverMatchCount:data.matchCount??data.matches.length,networkLiveCount:dedupe(network).length,domFallbackCount:dedupe(dom).length,matchCount:chosen.length,matches:chosen});
      const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');headers.set('cache-control','no-store');
      return new Response(body,{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();
