const base='https://ball46.com';
const paths=['/b46-sidebar-monitor-client-colors-20261119-v1.js','/b46-statistics-fast-v1-20261116.js','/b46-statistics-card-20261116.js','/singlepage-workspace-343.js','/longterm-performance-343.js','/b46-sidebar-leagues-20261119-v1.js'];
for(const path of paths){
 try{
  const res=await fetch(base+path+'?qaStat=20261121',{signal:AbortSignal.timeout(30000)});
  const s=await res.text();
  console.log('SOURCE_ASSET',JSON.stringify({path,status:res.status,bytes:s.length,head:s.slice(0,path.includes('sidebar-monitor')?14000:380)}));
  const tokens=['b46-rate-snapshot-v2','data-b46-rate-snapshot','Receiver Win Rate','winRate','win_rate','winrate','snapshot','setInterval','MutationObserver','stat-market','api/engine/statistics','statistics-fast','dispatchEvent','load','requestAnimationFrame'];
  for(const token of tokens){
   let pos=-1,occ=0,contexts=[];
   while((pos=s.toLowerCase().indexOf(token.toLowerCase(),pos+1))!==-1){
    occ++;
    if(contexts.length<(path.includes('sidebar-monitor')?8:3))contexts.push(s.slice(Math.max(0,pos-210),pos+Math.min(650,token.length+480)).replace(/\s+/g,' '));
   }
   if(occ)console.log('ASSET_TOKEN',JSON.stringify({path,token,occ,contexts}));
  }
 }catch(e){console.log('SOURCE_ASSET_ERROR',JSON.stringify({path,error:String(e)}))}
}
