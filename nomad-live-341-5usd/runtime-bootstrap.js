(()=>{
  const cfg=window.NOMAD341_RUNTIME_CONFIG||{};
  const central=cfg.mode==='CENTRAL_SNAPSHOT';
  window.NOMAD341_SKIP_BROWSER_DERIVED=central||cfg.browserDerivedEnabled===false;
  if(central){
    if(typeof window.NOMAD341InstallSnapshotAdapter!=='function'){
      throw new Error('Snapshot adapter is not loaded');
    }
    window.NOMAD341InstallSnapshotAdapter({endpoint:cfg.snapshotEndpoint||'/api/nomad341/live',cacheMs:cfg.cacheMs||1000});
  }
})();
