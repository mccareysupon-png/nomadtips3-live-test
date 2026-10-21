for(const path of ['/league-flags-343.js','/singlepage-workspace-343.js','/dashboard-v2-stage3-featured-facts-20261013a.js','/']){
 const r=await fetch('https://ball46.com'+path+'?b46-flags-source-readonly='+Date.now(),{cache:'no-store'}),s=await r.text();
 console.log('FLAGS_SOURCE_FILE',JSON.stringify({path,status:r.status,len:s.length,contentType:r.headers.get('content-type')}));
 const terms=['flag','Flag','country','Country','league-filter-list','league-flag-ready','league-globe','data-league-filters','MutationObserver','setInterval','innerHTML','renderBoard','renderLeague'];
 for(const t of terms){
  let p=0,n=0;
  while((p=s.indexOf(t,p))>=0&&n<7){
   console.log('FLAGS_SOURCE_SNIP',JSON.stringify({path,term:t,at:p,context:s.slice(Math.max(0,p-850),Math.min(s.length,p+1400))}));p+=t.length;n++;
  }
 }
 if(path==='/league-flags-343.js')console.log('LEAGUE_FLAGS_WHOLE_SCRIPT',s.slice(0,38000));
}