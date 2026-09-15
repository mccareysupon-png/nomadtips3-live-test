(()=>{
  const DEFAULT_ENDPOINT='/api/nomad341/live';

  function createSnapshotAdapter(options={}){
    const endpoint=options.endpoint||DEFAULT_ENDPOINT;
    const cacheMs=Math.max(250,Number(options.cacheMs)||1000);
    let cached=null;
    let cachedAt=0;
    let inFlight=null;

    async function loadSnapshot(){
      const now=Date.now();
      if(cached&&(now-cachedAt)<cacheMs)return cached;
      if(inFlight)return inFlight;

      inFlight=fetch(endpoint,{
        method:'GET',
        headers:{'Accept':'application/json'},
        cache:'no-store',
        credentials:'same-origin'
      }).then(async response=>{
        if(!response.ok)throw new Error(`NOMAD snapshot HTTP ${response.status}`);
        const payload=await response.json();
        if(!payload||typeof payload!=='object')throw new Error('Invalid NOMAD snapshot payload');
        cached=payload;
        cachedAt=Date.now();
        return payload;
      }).finally(()=>{inFlight=null;});

      return inFlight;
    }

    function feedFrom(snapshot){
      if(snapshot.feed)return snapshot.feed;
      return {
        updatedAt:snapshot.updatedAt||snapshot.fetchedAt||new Date().toISOString(),
        counts:snapshot.counts||{},
        matches:Array.isArray(snapshot.matches)?snapshot.matches:[]
      };
    }

    function statisticsFrom(snapshot){
      if(snapshot.statistics)return snapshot.statistics;
      return {
        updatedAt:snapshot.updatedAt||snapshot.fetchedAt||new Date().toISOString(),
        rows:Array.isArray(snapshot.ledger)?snapshot.ledger:[]
      };
    }

    function healthFrom(snapshot){
      if(snapshot.health)return snapshot.health;
      return {
        state:'SNAPSHOT READY',
        environment:'5USD CENTRAL POLLER',
        cycle:snapshot.cycleId||'—',
        lastCycle:snapshot.fetchedAt||snapshot.updatedAt||'—',
        lastSuccess:snapshot.fetchedAt||snapshot.updatedAt||'—',
        configVersion:snapshot.configVersion||'central',
        matches:Array.isArray(snapshot.matches)?snapshot.matches.length:0,
        signals:Array.isArray(snapshot.matches)?snapshot.matches.filter(m=>m.state==='SIGNAL'||m.signalStatus==='LOCKED').length:0,
        lastError:snapshot.error||'—',
        sources:[
          {name:'5USD provider traffic',state:'CENTRAL POLLER ONLY'},
          {name:'Browser provider requests',state:'0 BY DESIGN'},
          {name:'Cycle provider requests',state:String(snapshot.providerRequestCount??1)}
        ]
      };
    }

    return {
      name:'NOMAD CENTRAL SNAPSHOT',
      endpoint,
      async getFeed(){return feedFrom(await loadSnapshot());},
      async getStatistics(){return statisticsFrom(await loadSnapshot());},
      async getHealth(){return healthFrom(await loadSnapshot());},
      invalidate(){cached=null;cachedAt=0;},
      peek(){return cached;}
    };
  }

  // Explicit installation only. This file never calls 5USD and never auto-installs.
  // Live deployment should call this only after the central snapshot endpoint exists.
  window.NOMAD341CreateSnapshotAdapter=createSnapshotAdapter;
  window.NOMAD341InstallSnapshotAdapter=(options={})=>{
    const adapter=createSnapshotAdapter(options);
    window.NOMAD_5USD_ADAPTER=adapter;
    return adapter;
  };
})();
