(()=>{
  const realFetch=window.fetch.bind(window);
  const safe=v=>String(v??'').trim();
  const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null};
  const norm=s=>safe(s).toLowerCase().replace(/\([^)]*\)/g,' ').replace(/[^a-z0-9À-žก-๙]+/gi,' ').replace(/\s+/g,' ').trim();

  const explicitText=m=>[
    m?.sport,m?.league,m?.home,m?.away,m?.status,m?.market,m?.selection,m?.sourceUrl
  ].map(safe).join(' ').toLowerCase();

  const domText=m=>{
    const t=m?.raw?.text;
    if(Array.isArray(t))return t.map(safe).join(' ').toLowerCase();
    return safe(t).toLowerCase();
  };

  const virtualMarker=t=>/(เสมือนจริง|กีฬาเสมือนจริง|ฟุตบอลเสมือนจริง|e\s*-?sports?|virtual(?:\s+(?:football|soccer|sports?))?|simulat(?:ed|ion)?|simulated\s+reality|\bsrl\b|efootball|e-football|e-soccer|esoccer|fifa\s*\d*|cyber|battle\s*\d|gt\s*league|short\s*football)/i.test(t);
  const otherSportMarker=t=>/(basketball|tennis|volleyball|baseball|ice hockey|hockey|table tennis|badminton|cricket|snooker|darts|handball|rugby|boxing|mma|formula|motorsport)/i.test(t);

  // Important: do NOT scan the whole network raw payload here. One response may contain
  // both real and virtual events; scanning that whole blob can incorrectly reject real games.
  const badSport=m=>{
    const t=explicitText(m);
    if(virtualMarker(t)||otherSportMarker(t))return true;
    if(m?.sourceKind==='dom-fallback'){
      const dt=domText(m);
      if(virtualMarker(dt)||otherSportMarker(dt))return true;
    }
    return false;
  };

  const liveNetwork=m=>{
    if(badSport(m))return false;
    const st=safe(m.status).toLowerCase();
    if(/(finished|final|\bft\b|ended|cancel|postpon|upcoming|prematch|pre-match|not started|scheduled)/i.test(st))return false;
    const minute=n(m.minute);
    if(minute!==null&&minute>=0&&minute<=130)return true;
    return /(live|in.?play|1st|2nd|first half|second half|half.?time|\bht\b|สด|กำลังแข่ง)/i.test(st);
  };

  const liveDom=m=>{
    if(badSport(m))return false;
    const minute=n(m.minute),hs=n(m.homeScore),as=n(m.awayScore),dt=domText(m);
    const explicitLive=/(^|\s)(live|in.?play|สด|กำลังแข่ง)(\s|$)/i.test(dt)||/(live|สด|กำลังแข่ง)/i.test(safe(m.status));
    const hasScore=hs!==null&&as!==null;
    const hasMinute=minute!==null&&minute>=0&&minute<=130;
    // M88 can omit the minute in some displayed live rows. A row-local LIVE marker + score is enough.
    return (explicitLive&&hasScore)||hasMinute;
  };

  const dedupe=arr=>{
    const map=new Map();
    for(const m of arr){
      const h=norm(m.home),a=norm(m.away);
      if(!h||!a||h===a)continue;
      const key=`${h}|${a}`;
      const old=map.get(key);
      const score=x=>(x.sourceKind==='dom-fallback'?0:100)+(n(x.minute)!==null?20:0)+(n(x.homeScore)!==null&&n(x.awayScore)!==null?15:0)+(n(x.odds)!==null?10:0)+(safe(x.market)?5:0);
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
      const networkDedup=dedupe(network);
      const domDedup=dedupe(dom);
      const chosen=networkDedup.length?networkDedup:domDedup;

      const body=JSON.stringify({
        ...data,
        mode:'row-local-real-live-football-v8',
        serverMatchCount:data.matchCount??data.matches.length,
        networkLiveCount:networkDedup.length,
        domFallbackCount:domDedup.length,
        matchCount:chosen.length,
        matches:chosen
      });
      const headers=new Headers(response.headers);
      headers.set('content-type','application/json; charset=utf-8');
      headers.set('cache-control','no-store');
      return new Response(body,{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();
