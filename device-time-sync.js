(()=>{
  'use strict';

  const STORAGE_KEY='nomadtips3.nomad-control.draft.v2';
  const SOURCE='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/selected-live-matches.json';
  const DEVICE_TIME_ZONE=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  let busy=false;

  document.documentElement.dataset.timeZone=DEVICE_TIME_ZONE;
  window.NOMAD_DEVICE_TIME_ZONE=DEVICE_TIME_ZONE;

  const canonicalIso=value=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?null:date.toISOString();
  };

  async function syncKickoffs(){
    if(busy||document.hidden)return;
    busy=true;
    try{
      const response=await fetch(`${SOURCE}?t=${Date.now()}`,{cache:'no-store'});
      if(!response.ok)return;
      const config=await response.json();
      const kickoffMap=new Map((config.matches||[]).map(match=>[
        String(match.fixture_id),
        canonicalIso(match.kickoff_utc)
      ]));

      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw){
        setTimeout(syncKickoffs,1200);
        return;
      }

      const state=JSON.parse(raw);
      if(!Array.isArray(state.publishedPicks))return;

      let changed=false;
      state.publishedPicks=state.publishedPicks.map(pick=>{
        const canonical=kickoffMap.get(String(pick.fixtureId));
        if(!canonical||canonicalIso(pick.kickoffUtc)===canonical)return pick;
        changed=true;
        return {...pick,kickoffUtc:canonical};
      });

      state.deviceTimeZone=DEVICE_TIME_ZONE;
      if(!changed){
        localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
        return;
      }

      state.updatedAt=new Date().toISOString();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      window.dispatchEvent(new Event('nomad-timezone-updated'));

      const reloadKey=`nomadtips3.time-sync:${config.selection_date||'current'}:${DEVICE_TIME_ZONE}`;
      if(!sessionStorage.getItem(reloadKey)){
        sessionStorage.setItem(reloadKey,'1');
        location.reload();
      }
    }catch(error){
      console.debug('Device time synchronization pending',error);
    }finally{
      busy=false;
    }
  }

  setTimeout(syncKickoffs,500);
  setInterval(syncKickoffs,300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncKickoffs()});
})();
