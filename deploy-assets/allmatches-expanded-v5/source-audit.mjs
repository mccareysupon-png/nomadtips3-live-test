import assert from 'node:assert/strict';
const paths=['/singlepage-workspace-343.js','/singlepage-workspace-343.css','/dashboard-v2-stage3-featured-facts-20261013a.js','/'];
const roots=['match-expanded','match-expanded-inner','expand-flow-card','expand-full-market-card','featured-card','renderExpanded','data-expanded-match','b46x-live-detail'];
for (const path of paths){
 const response=await fetch('https://ball46.com'+path+'?b46audit='+Date.now(),{headers:{'Cache-Control':'no-cache'}});
 assert(response.ok,'bad status '+path+': '+response.status);
 const content=await response.text();
 console.log('ASSET_OVERVIEW',JSON.stringify({path,length:content.length,contentType:response.headers.get('content-type')}));
 for(const needle of roots){
  let start=0,n=0;
  while((start=content.indexOf(needle,start))!==-1 && n<6){
   const snip=content.substring(Math.max(0,start-950),Math.min(content.length,start+1600));
   console.log('ASSET_MATCH',JSON.stringify({path,needle,pos:start,context:snip}));
   start+=needle.length;n++;
  }
 }
}