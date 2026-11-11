const urls=["https://ball46.com/dashboard-v2-stage3-featured-facts-20261013a.js?v=b46-screen-refresh-5s-20261104","https://ball46.com/b46-mobile-event-flow-bars-20261102.js?v=1","https://ball46.com/expanded-match-343.js?v=b46-eventflow-dialog-20261105b","https://ball46.com/singlepage-workspace-343.js?v=b46-statistics-columns-20261102","https://ball46.com/mobile-menu-classic-343.js?v=343-mobile-classic-20260922b","https://ball46.com/ui-sync-fixes-343-v2.js?v=statistics-no-total-cap-20261005","https://ball46.com/b46-visual-suite-20261030.js","https://ball46.com/b46-monitor-20261030.js?v=b46-mini-monitor-20261101","https://ball46.com/b46-radar-watch-20261030.js"];
for(const url of urls){
  try{
    const t=await (await fetch(url,{headers:{'cache-control':'no-cache'}})).text();
    const hits=['data-b46gn-fixture','b46gn-card','b46gn-detail','data-board-sections','match-row'].filter(x=>t.includes(x));
    if(!hits.length)continue;
    console.log('\nURL='+url+' LEN='+t.length+' HITS='+hits.join(','));
    for(const term of hits){
      let from=0,count=0;
      while(count<3){
        const i=t.indexOf(term,from);if(i<0)break;
        console.log('TERM='+term+'\n'+t.slice(Math.max(0,i-1800),Math.min(t.length,i+6500))+'\n---');
        from=i+term.length;count++;
      }
    }
  }catch(e){console.log('ERR='+url+' '+e)}
}
console.log('PIN_V2_SOURCE_LOCATOR_DONE=1');