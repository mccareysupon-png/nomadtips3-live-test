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

for(const uri of ['/b46-receiver-v1/graph?market=all&variant=all&filter=all&range=all','/api/engine/statistics?paged=1']){
 try{
  const res=await fetch(base+uri,{signal:AbortSignal.timeout(30000),headers:{'cache-control':'no-cache'}});
  const stamp=res.headers.get('x-b46-monitor-rates');
  const result={uri,status:res.status,contentType:res.headers.get('content-type'),monitorHeader:stamp?JSON.parse(stamp):null};
  try{
    const b=await res.json();result.jsonKeys=Object.keys(b||{}).slice(0,35);
    for(const k of ['ok','schema','sequence','total','asOf','market','variant','filter','range','summary','byMarket','markets','head','snapshotSavedAt'])if(b?.[k]!==undefined)result[k]=JSON.stringify(b[k]).slice(0,2500);
  }catch(e){result.jsonError=String(e)}
  console.log('SNAPSHOT_ENDPOINT_METADATA',JSON.stringify(result));
 }catch(e){console.log('SNAPSHOT_ENDPOINT_ERROR',JSON.stringify({uri,error:String(e)}))}
}
